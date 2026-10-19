//! Localização e verificação das ferramentas externas (adb e scrcpy).

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;

use crate::process::command;

#[derive(Debug, Clone, Default)]
pub struct Tools {
    pub adb: Option<PathBuf>,
    pub scrcpy: Option<PathBuf>,
}

impl Tools {
    /// Procura cada binário, nesta ordem: `ADB_PATH`/`SCRCPY_PATH`, a pasta
    /// `scrcpy` ao lado do executável (onde o instalador do Windows coloca o
    /// scrcpy e o adb) e, por fim, o PATH.
    pub fn locate() -> Self {
        Self {
            adb: locate("adb", "ADB_PATH"),
            scrcpy: locate("scrcpy", "SCRCPY_PATH"),
        }
    }
}

fn locate(binary: &str, env_override: &str) -> Option<PathBuf> {
    std::env::var_os(env_override)
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            // Não depende do PATH: o app aberto pelo próprio instalador ainda
            // herda o PATH antigo.
            let bundled = std::env::current_exe().ok()?.parent()?.join("scrcpy");
            which::which_in(binary, Some(&bundled), &bundled).ok()
        })
        .or_else(|| which::which(binary).ok())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DependencyReport {
    pub adb: ToolStatus,
    pub scrcpy: ToolStatus,
}

impl DependencyReport {
    pub async fn probe(tools: &Tools) -> Self {
        let (adb, scrcpy) = tokio::join!(
            probe(tools.adb.clone(), "version"),
            probe(tools.scrcpy.clone(), "--version"),
        );
        Self { adb, scrcpy }
    }
}

async fn probe(path: Option<PathBuf>, version_flag: &str) -> ToolStatus {
    let Some(path) = path else {
        return ToolStatus { found: false, path: None, version: None };
    };

    let mut cmd = command(&path);
    cmd.arg(version_flag).stdout(Stdio::piped()).stderr(Stdio::null());

    let version = tokio::time::timeout(Duration::from_secs(5), cmd.output())
        .await
        .ok()
        .and_then(Result::ok)
        .and_then(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .map(|line| line.trim().to_owned())
        });

    ToolStatus {
        found: true,
        path: Some(path.display().to_string()),
        version,
    }
}
