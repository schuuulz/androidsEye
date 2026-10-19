use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use crate::adb::Adb;
use crate::devices::Device;
use crate::error::{AdbError, Result};
use crate::process::ProcessRegistry;
use crate::tools::Tools;

pub struct AppState {
    tools: RwLock<Tools>,
    pub devices: Mutex<BTreeMap<String, Device>>,
    pub processes: ProcessRegistry,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            tools: RwLock::new(Tools::locate()),
            devices: Mutex::default(),
            processes: ProcessRegistry::default(),
        }
    }

    /// Procura as ferramentas novamente (ex.: o usuário acabou de instalá-las).
    pub fn relocate_tools(&self) -> Tools {
        let tools = Tools::locate();
        *self.tools.write().unwrap() = tools.clone();
        tools
    }

    pub fn adb(&self) -> Result<Adb> {
        let path = self.tools.read().unwrap().adb.clone();
        path.map(Adb::new).ok_or(AdbError::BinaryNotFound("adb"))
    }

    pub fn scrcpy_path(&self) -> Result<PathBuf> {
        let path = self.tools.read().unwrap().scrcpy.clone();
        path.ok_or(AdbError::BinaryNotFound("scrcpy"))
    }
}
