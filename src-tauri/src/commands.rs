//! Comandos expostos ao frontend. Finos de propósito: validam a entrada e
//! delegam aos módulos de domínio.

use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::devices::{self, Device};
use crate::error::{AdbError, Result};
use crate::mirror;
use crate::packages::{self, Package, PullProgress, PullResult};
use crate::pairing::{self, MdnsService, ServiceKind};
use crate::shell::{self, ShellEvent};
use crate::state::AppState;
use crate::tools::DependencyReport;

#[tauri::command]
pub async fn check_dependencies(state: State<'_, AppState>) -> Result<DependencyReport> {
    let tools = state.relocate_tools();
    Ok(DependencyReport::probe(&tools).await)
}

#[tauri::command]
pub fn list_devices(state: State<'_, AppState>) -> Vec<Device> {
    devices::snapshot(&state)
}

#[tauri::command]
pub async fn connect_wifi(state: State<'_, AppState>, address: String) -> Result<String> {
    let address = address.trim();
    if address.is_empty() || address.contains(char::is_whitespace) {
        return Err(AdbError::CommandFailed("Informe um endereço como 192.168.0.10:5555".into()));
    }
    state.adb()?.connect(address).await
}

#[tauri::command]
pub async fn unpair_device(
    app: AppHandle,
    serial: String,
    disable_wireless_debugging: bool,
) -> Result<()> {
    pairing::unpair(&app, &serial, disable_wireless_debugging).await
}

// --- pareamento Wi-Fi ---------------------------------------------------------

#[tauri::command]
pub async fn list_pairing_services(state: State<'_, AppState>) -> Result<Vec<MdnsService>> {
    let services = pairing::services(&state.adb()?).await?;
    Ok(services.into_iter().filter(|s| s.kind == ServiceKind::Pairing).collect())
}

#[tauri::command]
pub async fn pair_device(app: AppHandle, address: String, secret: String) -> Result<()> {
    let address = address.trim();
    pairing::validate_address(address)?;
    if secret.is_empty() || !secret.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AdbError::PairingFailed);
    }
    pairing::pair_device(&app, address, &secret).await
}

// --- espelhamento --------------------------------------------------------------

#[tauri::command]
pub async fn start_mirror(app: AppHandle, serial: String, title: String) -> Result<()> {
    mirror::start(&app, &serial, &title).await
}

#[tauri::command]
pub fn stop_mirror(app: AppHandle, serial: String) {
    mirror::stop(&app, &serial);
}

// --- shell --------------------------------------------------------------------------

#[tauri::command]
pub async fn shell_open(
    app: AppHandle,
    serial: String,
    cols: u16,
    rows: u16,
    on_event: Channel<ShellEvent>,
) -> Result<u32> {
    shell::open(&app, &serial, cols, rows, on_event).await
}

#[tauri::command]
pub fn shell_write(app: AppHandle, id: u32, data: String) -> Result<()> {
    shell::write(&app, id, data)
}

#[tauri::command]
pub async fn shell_resize(app: AppHandle, id: u32, cols: u16, rows: u16) -> Result<()> {
    shell::resize(&app, id, cols, rows).await
}

#[tauri::command]
pub fn shell_close(app: AppHandle, id: u32) {
    shell::close(&app, id);
}

// --- APKs ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_packages(
    state: State<'_, AppState>,
    serial: String,
    user_only: bool,
) -> Result<Vec<Package>> {
    packages::list(&state.adb()?, &serial, user_only).await
}

#[tauri::command]
pub async fn pull_apk(
    app: AppHandle,
    serial: String,
    package: String,
    destination: PathBuf,
    on_progress: Channel<PullProgress>,
) -> Result<PullResult> {
    ensure_package_name(&package)?;
    packages::pull(&app, &serial, &package, destination, on_progress).await
}

#[tauri::command]
pub fn cancel_pull(state: State<'_, AppState>, serial: String, package: String) {
    state.processes.cancel_pull(&packages::pull_key(&serial, &package));
}

/// Nomes de pacote vão para um comando de shell no aparelho: só aceitamos o
/// formato oficial (letras, dígitos, `_` e `.`).
fn ensure_package_name(name: &str) -> Result<()> {
    let valid = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    if valid {
        Ok(())
    } else {
        Err(AdbError::CommandFailed(format!("Nome de pacote inválido: {name}")))
    }
}
