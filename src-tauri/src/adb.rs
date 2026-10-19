//! Cliente fino sobre o binário `adb`.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use crate::error::{AdbError, Result};
use crate::process::command;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct Adb {
    path: PathBuf,
}

impl Adb {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// `adb [args]` pronto para customização (pipes, spawn...).
    pub fn command<I, S>(&self, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        let mut cmd = command(&self.path);
        cmd.args(args);
        cmd
    }

    /// `adb -s <serial> [args]`.
    pub fn device_command<I, S>(&self, serial: &str, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        let mut cmd = self.command(["-s", serial]);
        cmd.args(args);
        cmd
    }

    /// Executa um comando curto e devolve o stdout.
    pub async fn run(&self, mut cmd: Command, serial: Option<&str>) -> Result<String> {
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let output = tokio::time::timeout(DEFAULT_TIMEOUT, cmd.output())
            .await
            .map_err(|_| AdbError::Timeout)??;

        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        if output.status.success() {
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(AdbError::from_adb_output(&format!("{stderr}{stdout}"), serial))
        }
    }

    /// `adb -s <serial> shell <script>`.
    pub async fn shell(&self, serial: &str, script: &str) -> Result<String> {
        self.run(self.device_command(serial, ["shell", script]), Some(serial)).await
    }

    /// `adb connect <host[:porta]>`. O adb retorna código 0 mesmo em falhas,
    /// por isso a saída é inspecionada.
    pub async fn connect(&self, address: &str) -> Result<String> {
        let output = self.run(self.command(["connect", address]), None).await?;
        if output.contains("connected to") {
            Ok(output.trim().to_owned())
        } else {
            Err(AdbError::CommandFailed(output.trim().to_owned()))
        }
    }

    pub async fn disconnect(&self, serial: &str) -> Result<()> {
        self.run(self.command(["disconnect", serial]), Some(serial)).await?;
        Ok(())
    }

    /// `adb pair <ip:porta> <segredo>`. Assim como `connect`, o código de saída
    /// não é confiável: o sucesso é decidido pela mensagem.
    pub async fn pair(&self, address: &str, secret: &str) -> Result<()> {
        match self.run(self.command(["pair", address, secret]), None).await {
            Ok(output) if output.contains("Successfully paired") => Ok(()),
            Err(AdbError::Timeout) => Err(AdbError::Timeout),
            _ => Err(AdbError::PairingFailed),
        }
    }

    /// Saída bruta de `adb mdns services`.
    pub async fn mdns_services(&self) -> Result<String> {
        self.run(self.command(["mdns", "services"]), None).await
    }
}
