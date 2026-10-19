mod adb;
mod commands;
mod devices;
mod error;
mod known_hosts;
mod mirror;
mod packages;
mod pairing;
mod process;
mod shell;
mod state;
mod tools;

use tauri::{Manager, RunEvent};

use crate::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            tauri::async_runtime::spawn(devices::track(app.handle().clone()));
            tauri::async_runtime::spawn(devices::refresh_batteries(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_dependencies,
            commands::list_devices,
            commands::connect_wifi,
            commands::unpair_device,
            commands::list_pairing_services,
            commands::pair_device,
            commands::start_mirror,
            commands::stop_mirror,
            commands::shell_open,
            commands::shell_write,
            commands::shell_resize,
            commands::shell_close,
            commands::list_packages,
            commands::pull_apk,
            commands::cancel_pull,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o androidsEye")
        .run(|app, event| {
            // Nenhum scrcpy ou adb shell sobrevive ao fechamento da janela.
            if let RunEvent::Exit = event {
                app.state::<AppState>().processes.release_all();
            }
        });
}
