//! Espelhamento de tela com scrcpy.

use std::process::Stdio;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;

use crate::devices;
use crate::error::{AdbError, Result};
use crate::process::{self, handle_pair, supervise};
use crate::state::AppState;

pub const MIRROR_FAILED: &str = "mirror:failed";

#[derive(Debug, Clone, Serialize)]
pub struct MirrorFailure {
    serial: String,
    message: String,
}

pub async fn start(app: &AppHandle, serial: &str, title: &str) -> Result<()> {
    let state = app.state::<AppState>();
    if state.processes.is_mirroring(serial) {
        return Err(AdbError::AlreadyMirroring);
    }

    let adb = state.adb()?;
    let mut cmd = process::command(&state.scrcpy_path()?);
    cmd.args(["--serial", serial, "--turn-screen-off", "--window-title", title])
        // Garante que o scrcpy use o mesmo adb que o restante do app.
        .env("ADB", adb.path())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()?;
    let mut stderr = child.stderr.take().expect("stderr configurado como pipe");

    let (handle, stop) = handle_pair();
    let id = handle.id;
    state.processes.add_mirror(serial, handle);
    devices::publish(app);

    let app = app.clone();
    let serial = serial.to_owned();
    tauri::async_runtime::spawn(async move {
        // O stderr precisa ser drenado continuamente para o scrcpy não travar.
        let log = tauri::async_runtime::spawn(async move {
            let mut log = String::new();
            let _ = stderr.read_to_string(&mut log).await;
            log
        });

        let status = supervise(child, stop).await;
        let log = log.await.unwrap_or_default();

        app.state::<AppState>().processes.forget_mirror(&serial, id);
        devices::publish(&app);

        if status.is_some_and(|s| !s.success()) {
            let message = last_error_line(&log)
                .unwrap_or("O scrcpy foi encerrado inesperadamente")
                .to_owned();
            let _ = app.emit(MIRROR_FAILED, MirrorFailure { serial, message });
        }
    });

    Ok(())
}

pub fn stop(app: &AppHandle, serial: &str) {
    if app.state::<AppState>().processes.stop_mirror(serial) {
        devices::publish(app);
    }
}

fn last_error_line(log: &str) -> Option<&str> {
    log.lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix("ERROR:"))
        .map(str::trim)
}
