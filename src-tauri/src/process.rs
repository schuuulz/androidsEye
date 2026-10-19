//! Ciclo de vida dos processos filhos (scrcpy, adb shell, downloads).
//!
//! Cada processo vivo é representado por um [`ProcessHandle`] guardado no
//! [`ProcessRegistry`]. Remover o handle do registro (ou simplesmente
//! descartá-lo) encerra o processo — é RAII aplicado a processos.

use std::collections::HashMap;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

/// Cria um `Command` com os padrões seguros da aplicação.
pub fn command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.kill_on_drop(true).stdin(Stdio::null());

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd
}

/// Dono simbólico de um processo. Quando é descartado, o processo morre.
pub struct ProcessHandle {
    pub id: u32,
    _stop: oneshot::Sender<()>,
}

/// Contraparte do [`ProcessHandle`], consumida por [`supervise`].
pub struct StopSignal(oneshot::Receiver<()>);

impl StopSignal {
    /// Resolve quando o [`ProcessHandle`] correspondente é descartado.
    pub async fn cancelled(self) {
        let _ = self.0.await;
    }
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

pub fn handle_pair() -> (ProcessHandle, StopSignal) {
    let (tx, rx) = oneshot::channel();
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    (ProcessHandle { id, _stop: tx }, StopSignal(rx))
}

/// Aguarda o processo terminar ou o handle ser descartado.
/// Retorna `None` quando fomos nós que encerramos o processo.
pub async fn supervise(mut child: Child, stop: StopSignal) -> Option<ExitStatus> {
    tokio::select! {
        status = child.wait() => status.ok(),
        _ = stop.cancelled() => {
            let _ = child.kill().await;
            None
        }
    }
}

pub struct ShellSession {
    pub serial: String,
    pub handle: ProcessHandle,
    pub input: mpsc::UnboundedSender<Vec<u8>>,
    pub pts: std::sync::Arc<Mutex<Option<String>>>,
}

#[derive(Default)]
pub struct ProcessRegistry {
    mirrors: Mutex<HashMap<String, ProcessHandle>>,
    shells: Mutex<HashMap<u32, ShellSession>>,
    pulls: Mutex<HashMap<String, ProcessHandle>>,
}

impl ProcessRegistry {
    // --- espelhamento ------------------------------------------------------

    pub fn is_mirroring(&self, serial: &str) -> bool {
        self.mirrors.lock().unwrap().contains_key(serial)
    }

    pub fn add_mirror(&self, serial: &str, handle: ProcessHandle) {
        self.mirrors.lock().unwrap().insert(serial.to_owned(), handle);
    }

    pub fn stop_mirror(&self, serial: &str) -> bool {
        self.mirrors.lock().unwrap().remove(serial).is_some()
    }

    /// Remove o handle só se ainda for o mesmo processo (evita corrida com um
    /// novo espelhamento iniciado logo após o anterior terminar).
    pub fn forget_mirror(&self, serial: &str, id: u32) {
        let mut mirrors = self.mirrors.lock().unwrap();
        if mirrors.get(serial).is_some_and(|h| h.id == id) {
            mirrors.remove(serial);
        }
    }

    // --- shells ------------------------------------------------------------

    pub fn add_shell(&self, session: ShellSession) -> u32 {
        let id = session.handle.id;
        self.shells.lock().unwrap().insert(id, session);
        id
    }

    pub fn with_shell<T>(&self, id: u32, f: impl FnOnce(&ShellSession) -> T) -> Option<T> {
        self.shells.lock().unwrap().get(&id).map(f)
    }

    pub fn take_shell(&self, id: u32) -> Option<ShellSession> {
        self.shells.lock().unwrap().remove(&id)
    }

    // --- downloads ---------------------------------------------------------

    pub fn add_pull(&self, key: &str, handle: ProcessHandle) {
        self.pulls.lock().unwrap().insert(key.to_owned(), handle);
    }

    pub fn cancel_pull(&self, key: &str) -> bool {
        self.pulls.lock().unwrap().remove(key).is_some()
    }

    pub fn forget_pull(&self, key: &str, id: u32) {
        let mut pulls = self.pulls.lock().unwrap();
        if pulls.get(key).is_some_and(|h| h.id == id) {
            pulls.remove(key);
        }
    }

    // --- limpeza -----------------------------------------------------------

    /// Encerra tudo que pertence a um dispositivo (ex.: cabo desconectado).
    pub fn release_device(&self, serial: &str) {
        self.mirrors.lock().unwrap().remove(serial);
        self.shells.lock().unwrap().retain(|_, s| s.serial != serial);
        let prefix = format!("{serial}/");
        self.pulls.lock().unwrap().retain(|key, _| !key.starts_with(&prefix));
    }

    /// Encerra todos os processos filhos (fechamento da janela).
    pub fn release_all(&self) {
        self.mirrors.lock().unwrap().clear();
        self.shells.lock().unwrap().clear();
        self.pulls.lock().unwrap().clear();
    }
}
