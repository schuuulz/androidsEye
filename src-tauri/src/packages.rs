//! Listagem de apps instalados e extração de APK com progresso.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::adb::Adb;
use crate::error::{AdbError, Result};
use crate::process::{handle_pair, StopSignal};
use crate::state::AppState;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub name: String,
    pub system: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullProgress {
    pub received: u64,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub path: String,
    pub bytes: u64,
    /// Quantidade de APKs "split" que não foram incluídos (só o base.apk é extraído).
    pub split_count: usize,
}

/// Apps instalados em ordem alfabética.
pub async fn list(adb: &Adb, serial: &str, user_only: bool) -> Result<Vec<Package>> {
    let script = if user_only { "pm list packages -f -3" } else { "pm list packages -f" };
    let output = adb.shell(serial, script).await?;

    let mut packages: Vec<Package> = output.lines().filter_map(parse_package_line).collect();
    packages.sort_by(|a, b| a.name.cmp(&b.name));
    packages.dedup_by(|a, b| a.name == b.name);
    Ok(packages)
}

/// `package:/data/app/~~abc==/com.foo-xyz==/base.apk=com.foo`
fn parse_package_line(line: &str) -> Option<Package> {
    let (path, name) = line.trim().strip_prefix("package:")?.rsplit_once('=')?;
    Some(Package {
        name: name.to_owned(),
        system: !path.starts_with("/data/"),
    })
}

pub fn pull_key(serial: &str, package: &str) -> String {
    format!("{serial}/{package}")
}

/// Copia o `base.apk` do pacote para `destination`, reportando o progresso.
///
/// Usa `adb exec-out cat` em vez de `adb pull`: o fluxo é binário e o
/// progresso vem da contagem real de bytes, sem depender de saída em TTY.
pub async fn pull(
    app: &AppHandle,
    serial: &str,
    package: &str,
    destination: PathBuf,
    on_progress: Channel<PullProgress>,
) -> Result<PullResult> {
    let state = app.state::<AppState>();
    let adb = state.adb()?;

    let apks = apk_paths(&adb, serial, package).await?;
    let base = apks
        .iter()
        .find(|path| path.ends_with("/base.apk"))
        .or(apks.first())
        .cloned()
        .ok_or_else(|| AdbError::CommandFailed(format!("Nenhum APK encontrado para {package}")))?;
    let total = remote_size(&adb, serial, &base).await?;

    let key = pull_key(serial, package);
    let (handle, stop) = handle_pair();
    let id = handle.id;
    state.processes.add_pull(&key, handle);

    let result = copy_remote_file(&adb, serial, &base, &destination, total, stop, &on_progress).await;
    state.processes.forget_pull(&key, id);

    match result {
        Ok(bytes) => Ok(PullResult {
            path: destination.display().to_string(),
            bytes,
            split_count: apks.len().saturating_sub(1),
        }),
        Err(err) => {
            let _ = tokio::fs::remove_file(&destination).await;
            Err(err)
        }
    }
}

async fn apk_paths(adb: &Adb, serial: &str, package: &str) -> Result<Vec<String>> {
    let output = adb.shell(serial, &format!("pm path {package}")).await?;
    Ok(output
        .lines()
        .filter_map(|line| line.trim().strip_prefix("package:"))
        .map(str::to_owned)
        .collect())
}

async fn remote_size(adb: &Adb, serial: &str, path: &str) -> Result<u64> {
    let output = adb.shell(serial, &format!("stat -c %s '{path}'")).await?;
    output
        .trim()
        .parse()
        .map_err(|_| AdbError::CommandFailed(format!("Não foi possível ler o tamanho de {path}")))
}

async fn copy_remote_file(
    adb: &Adb,
    serial: &str,
    remote: &str,
    local: &Path,
    total: u64,
    stop: StopSignal,
    on_progress: &Channel<PullProgress>,
) -> Result<u64> {
    let mut child = adb
        .device_command(serial, ["exec-out", &format!("cat '{remote}'")])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let mut stdout = child.stdout.take().expect("stdout configurado como pipe");
    let mut file = tokio::fs::File::create(local).await?;

    let mut stop = std::pin::pin!(stop.cancelled());
    let mut buf = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut last_report = Instant::now();

    loop {
        let n = tokio::select! {
            read = stdout.read(&mut buf) => read?,
            _ = &mut stop => return Err(AdbError::Cancelled),
        };
        if n == 0 {
            break;
        }

        file.write_all(&buf[..n]).await?;
        received += n as u64;

        if last_report.elapsed() >= PROGRESS_INTERVAL {
            let _ = on_progress.send(PullProgress { received, total });
            last_report = Instant::now();
        }
    }

    file.flush().await?;
    let status = child.wait().await?;
    let _ = on_progress.send(PullProgress { received, total });

    if !status.success() || received != total {
        return Err(AdbError::CommandFailed(format!(
            "Transferência incompleta ({received} de {total} bytes)"
        )));
    }
    Ok(received)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_package_lines() {
        let user = parse_package_line("package:/data/app/~~a==/com.foo-b==/base.apk=com.foo").unwrap();
        assert_eq!(user.name, "com.foo");
        assert!(!user.system);

        let system = parse_package_line("package:/system/app/Settings/Settings.apk=com.android.settings").unwrap();
        assert!(system.system);
    }
}
