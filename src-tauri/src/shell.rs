//! Shell interativo (`adb shell`) transmitido para o xterm.js.
//!
//! Saída: lida em uma task e enviada por um `Channel` do Tauri (ordenado).
//! Entrada: um `mpsc` alimenta a task que escreve no stdin do processo.
//! Redimensionamento: o pty remoto é descoberto na abertura da sessão e
//! ajustado com `stty -F`, o que faz o kernel enviar SIGWINCH ao programa.

use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;

use crate::error::{AdbError, Result};
use crate::process::{handle_pair, supervise, ShellSession};
use crate::state::AppState;

const PTS_MARKER: &[u8] = b"__ANDROIDSEYE_PTS__";
const GRACEFUL_EXIT: Duration = Duration::from_millis(800);

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ShellEvent {
    Data { data: String },
    Exit { code: Option<i32> },
}

pub async fn open(
    app: &AppHandle,
    serial: &str,
    cols: u16,
    rows: u16,
    on_event: Channel<ShellEvent>,
) -> Result<u32> {
    let state = app.state::<AppState>();
    let adb = state.adb()?;

    let bootstrap = format!(
        "stty rows {rows} cols {cols} 2>/dev/null; echo {}$(tty); exec sh",
        String::from_utf8_lossy(PTS_MARKER)
    );
    let mut child = adb
        .device_command(serial, ["shell", "-tt", &bootstrap])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdin = child.stdin.take().expect("stdin configurado como pipe");
    let mut stdout = child.stdout.take().expect("stdout configurado como pipe");
    let mut stderr = child.stderr.take().expect("stderr configurado como pipe");

    let (input, mut input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let pts = Arc::new(Mutex::new(None));
    let (handle, stop) = handle_pair();

    let id = state.processes.add_shell(ShellSession {
        serial: serial.to_owned(),
        handle,
        input,
        pts: pts.clone(),
    });

    // stdin: repassa o que o usuário digita.
    tauri::async_runtime::spawn(async move {
        while let Some(bytes) = input_rx.recv().await {
            if stdin.write_all(&bytes).await.is_err() || stdin.flush().await.is_err() {
                break;
            }
        }
    });

    // stdout: decodifica UTF-8 em fluxo e envia ao terminal.
    let output = on_event.clone();
    let reader = tauri::async_runtime::spawn(async move {
        let mut decoder = Utf8Stream::default();
        let mut preamble = Some(Vec::new());
        let mut buf = vec![0u8; 8192];

        while let Ok(n) = stdout.read(&mut buf).await {
            if n == 0 {
                break;
            }
            // Captura a primeira linha (marcador + caminho do pty) sem exibi-la.
            let bytes = match preamble.take() {
                None => buf[..n].to_vec(),
                Some(mut pending) => {
                    pending.extend_from_slice(&buf[..n]);
                    match extract_pts(&pending) {
                        Preamble::Incomplete => {
                            preamble = Some(pending);
                            continue;
                        }
                        Preamble::Found { pts: path, rest } => {
                            *pts.lock().unwrap() = path;
                            rest
                        }
                        Preamble::Absent => pending,
                    }
                }
            };

            let text = decoder.push(&bytes);
            if !text.is_empty() {
                let _ = output.send(ShellEvent::Data { data: text });
            }
        }

        // O processo terminou antes do marcador: mostra o que tiver chegado.
        if let Some(pending) = preamble.filter(|p| !p.is_empty()) {
            let data = String::from_utf8_lossy(&pending).into_owned();
            let _ = output.send(ShellEvent::Data { data });
        }
    });

    // Supervisor: reporta o fim da sessão e limpa o registro.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let status = supervise(child, stop).await;
        let _ = reader.await;

        if status.is_some_and(|s| !s.success()) {
            let mut log = String::new();
            let _ = stderr.read_to_string(&mut log).await;
            if !log.trim().is_empty() {
                let message = AdbError::from_adb_output(&log, None).to_string();
                let _ = on_event.send(ShellEvent::Data {
                    data: format!("\r\n\x1b[31m{message}\x1b[0m\r\n"),
                });
            }
        }

        app.state::<AppState>().processes.take_shell(id);
        let _ = on_event.send(ShellEvent::Exit { code: status.and_then(|s| s.code()) });
    });

    Ok(id)
}

pub fn write(app: &AppHandle, id: u32, data: String) -> Result<()> {
    app.state::<AppState>()
        .processes
        .with_shell(id, |session| session.input.send(data.into_bytes()).is_ok())
        .filter(|sent| *sent)
        .map(|_| ())
        .ok_or(AdbError::SessionNotFound)
}

pub async fn resize(app: &AppHandle, id: u32, cols: u16, rows: u16) -> Result<()> {
    let state = app.state::<AppState>();
    let target = state
        .processes
        .with_shell(id, |s| (s.serial.clone(), s.pts.lock().unwrap().clone()))
        .ok_or(AdbError::SessionNotFound)?;

    // Sem pty conhecido (Android muito antigo), o redimensionamento é ignorado.
    let (serial, Some(pts)) = target else { return Ok(()) };
    state
        .adb()?
        .shell(&serial, &format!("stty -F {pts} rows {rows} cols {cols}"))
        .await
        .map(|_| ())
}

/// Encerramento educado: envia `exit` e só força o kill se o shell não sair.
pub fn close(app: &AppHandle, id: u32) {
    let Some(session) = app.state::<AppState>().processes.take_shell(id) else { return };
    let _ = session.input.send(b"\x03exit\n".to_vec());

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(GRACEFUL_EXIT).await;
        drop(session); // descarta o handle → processo encerrado se ainda vivo
    });
}

// --- utilitários -------------------------------------------------------------------

enum Preamble {
    Incomplete,
    Found { pts: Option<String>, rest: Vec<u8> },
    Absent,
}

fn extract_pts(buffer: &[u8]) -> Preamble {
    let Some(start) = find(buffer, PTS_MARKER) else {
        // Marcador nunca chegou: desiste e exibe tudo.
        return if buffer.len() > 4096 { Preamble::Absent } else { Preamble::Incomplete };
    };
    let after = start + PTS_MARKER.len();
    let Some(newline) = buffer[after..].iter().position(|&b| b == b'\n') else {
        return Preamble::Incomplete;
    };

    let path = String::from_utf8_lossy(&buffer[after..after + newline]).trim().to_owned();
    let mut rest = buffer[..start].to_vec();
    rest.extend_from_slice(&buffer[after + newline + 1..]);

    Preamble::Found {
        pts: path.starts_with("/dev/").then_some(path),
        rest,
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Decodifica UTF-8 em fluxo, guardando bytes de caracteres cortados ao meio.
#[derive(Default)]
struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let valid_up_to = match std::str::from_utf8(&self.pending) {
            Ok(_) => self.pending.len(),
            Err(err) if err.error_len().is_none() => err.valid_up_to(),
            Err(_) => {
                let text = String::from_utf8_lossy(&self.pending).into_owned();
                self.pending.clear();
                return text;
            }
        };

        let rest = self.pending.split_off(valid_up_to);
        String::from_utf8(std::mem::replace(&mut self.pending, rest))
            .expect("prefixo validado acima")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_stream_handles_split_characters() {
        let mut stream = Utf8Stream::default();
        let bytes = "ação".as_bytes();
        let first = stream.push(&bytes[..2]);
        let second = stream.push(&bytes[2..]);
        assert_eq!(format!("{first}{second}"), "ação");
    }

    #[test]
    fn extracts_pts_and_keeps_remaining_output() {
        let mut input = PTS_MARKER.to_vec();
        input.extend_from_slice(b"/dev/pts/3\r\n$ ");
        match extract_pts(&input) {
            Preamble::Found { pts, rest } => {
                assert_eq!(pts.as_deref(), Some("/dev/pts/3"));
                assert_eq!(rest, b"$ ");
            }
            _ => panic!("marcador deveria ter sido encontrado"),
        }
    }
}
