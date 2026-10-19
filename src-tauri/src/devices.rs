//! Lista de dispositivos em tempo real.
//!
//! Um `adb track-devices` de longa duração recebe do servidor adb cada mudança
//! (plugou, desplugou, autorizou...). Detalhes como modelo e bateria são
//! buscados em paralelo e o frontend recebe sempre a lista completa pelo
//! evento [`DEVICES_CHANGED`].

use std::collections::HashSet;
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt};

use crate::error::{AdbError, Result};
use crate::state::AppState;

pub const DEVICES_CHANGED: &str = "devices:changed";

const RECONNECT_DELAY: Duration = Duration::from_secs(2);
const QUICK_RECONNECT_DELAY: Duration = Duration::from_millis(150);
const BATTERY_REFRESH: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceState {
    Online,
    Unauthorized,
    /// Linux sem regras udev: o sistema não deixa o adb abrir o USB.
    NoPermission,
    Offline,
}

impl DeviceState {
    fn parse(raw: &str) -> Self {
        match raw {
            "device" => Self::Online,
            "unauthorized" | "authorizing" => Self::Unauthorized,
            // A linha completa é "no permissions (user in plugdev group; ...)".
            "no" => Self::NoPermission,
            _ => Self::Offline,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Connection {
    Usb,
    Wifi,
}

impl Connection {
    fn from_serial(serial: &str) -> Self {
        if serial.contains(':') || serial.contains("._adb-tls-connect.") {
            Self::Wifi
        } else {
            Self::Usb
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub level: u8,
    pub charging: bool,
}

/// Identidade do aparelho físico (`ro.serialno`).
///
/// O adb trata cada transporte como um dispositivo: o mesmo celular pode
/// aparecer via USB, via mDNS (`adb-XXXX._adb-tls-connect._tcp`) e via
/// `ip:porta` ao mesmo tempo. A identidade une esses transportes em um card.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
enum Identity {
    /// Detalhes ainda não lidos.
    #[default]
    Pending,
    Known(String),
    /// Não foi possível ler (ex.: aparelho não respondeu).
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Chave estável do aparelho físico; o `serial` é o transporte usado nas ações.
    pub id: String,
    pub serial: String,
    pub state: DeviceState,
    pub connection: Connection,
    pub model: Option<String>,
    pub manufacturer: Option<String>,
    pub battery: Option<Battery>,
    pub mirroring: bool,
    #[serde(skip)]
    identity: Identity,
}

impl Device {
    fn new(serial: &str) -> Self {
        Self {
            id: serial.to_owned(),
            serial: serial.to_owned(),
            state: DeviceState::Offline,
            connection: Connection::from_serial(serial),
            model: None,
            manufacturer: None,
            battery: None,
            mirroring: false,
            identity: Identity::Pending,
        }
    }

    /// Ordem de preferência entre transportes do mesmo aparelho (menor = melhor):
    /// o que está espelhando, depois online, depois USB › mDNS › `ip:porta`.
    fn preference(&self) -> (bool, bool, u8) {
        let transport = match self.connection {
            Connection::Usb => 0,
            Connection::Wifi if self.serial.contains("._adb-tls-connect.") => 1,
            Connection::Wifi => 2,
        };
        (!self.mirroring, self.state != DeviceState::Online, transport)
    }
}

// --- publicação ---------------------------------------------------------------

/// Lista exibida ao usuário: um item por aparelho físico.
pub fn snapshot(state: &AppState) -> Vec<Device> {
    let devices: Vec<Device> = state
        .devices
        .lock()
        .unwrap()
        .values()
        .cloned()
        .map(|mut device| {
            device.mirroring = state.processes.is_mirroring(&device.serial);
            device
        })
        .collect();

    merge_transports(devices)
}

fn merge_transports(mut devices: Vec<Device>) -> Vec<Device> {
    // Online sem identidade ainda: espera os detalhes (centenas de ms) em vez
    // de exibir um card que poderia ser um duplicado.
    devices.retain(|d| !(d.state == DeviceState::Online && d.identity == Identity::Pending));

    for device in &mut devices {
        if let Identity::Known(serialno) = &device.identity {
            device.id = serialno.clone();
        }
    }

    devices.sort_by(|a, b| a.id.cmp(&b.id).then(a.preference().cmp(&b.preference())));
    devices.dedup_by(|later, kept| later.id == kept.id);
    devices
}

/// `ro.serialno` do aparelho de `serial` e todos os seus transportes Wi-Fi
/// (inclusive os escondidos pela fusão de duplicados).
pub fn wifi_transports_of(state: &AppState, serial: &str) -> (Option<String>, Vec<String>) {
    let devices = state.devices.lock().unwrap();
    let serialno = match devices.get(serial).map(|d| &d.identity) {
        Some(Identity::Known(serialno)) => Some(serialno.clone()),
        _ => serialno_from_mdns(serial),
    };

    let transports = devices
        .values()
        .filter(|d| d.connection == Connection::Wifi)
        .filter(|d| {
            d.serial == serial
                || matches!((&d.identity, &serialno), (Identity::Known(a), Some(b)) if a == b)
        })
        .map(|d| d.serial.clone())
        .collect();

    (serialno, transports)
}

/// `adb-RQCY4082BEZ-t2UKR6._adb-tls-connect._tcp` → `RQCY4082BEZ`.
fn serialno_from_mdns(serial: &str) -> Option<String> {
    let name = serial.split_once("._adb-tls-connect.")?.0;
    let (serialno, _suffix) = name.strip_prefix("adb-")?.rsplit_once('-')?;
    Some(serialno.to_owned())
}

pub fn publish(app: &AppHandle) {
    let devices = snapshot(&app.state::<AppState>());
    let _ = app.emit(DEVICES_CHANGED, devices);
}

// --- rastreamento ---------------------------------------------------------------

/// Loop principal: mantém um `adb track-devices` vivo e reconecta se cair.
pub async fn track(app: AppHandle) {
    loop {
        let mut received_any = false;
        if let Err(err) = track_once(&app, &mut received_any).await {
            eprintln!("[androidsEye] rastreamento de dispositivos interrompido: {err}");
        }

        if received_any {
            // O stream funcionava e caiu (ex.: um `adb disconnect`). Reabrimos
            // sem limpar a tela: o primeiro frame do novo stream traz a lista
            // completa e o `apply` remove só quem realmente saiu.
            tokio::time::sleep(QUICK_RECONNECT_DELAY).await;
        } else {
            // Nem conseguimos abrir o stream: adb ausente ou servidor fora do ar.
            apply(&app, Vec::new());
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    }
}

async fn track_once(app: &AppHandle, received_any: &mut bool) -> Result<()> {
    let adb = app.state::<AppState>().adb()?;
    let mut child = adb
        .command(["track-devices", "-l"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let mut stdout = child.stdout.take().expect("stdout configurado como pipe");

    loop {
        let payload = read_frame(&mut stdout).await?;
        *received_any = true;
        apply(app, parse_device_list(&payload));
    }
}

/// O protocolo do adb envia `<tamanho em 4 dígitos hex><conteúdo>`.
async fn read_frame(reader: &mut (impl AsyncRead + Unpin)) -> Result<String> {
    let mut header = [0u8; 4];
    reader.read_exact(&mut header).await?;

    let len = std::str::from_utf8(&header)
        .ok()
        .and_then(|hex| usize::from_str_radix(hex, 16).ok())
        .ok_or_else(|| AdbError::CommandFailed("Resposta inválida do servidor adb".into()))?;

    let mut body = vec![0u8; len];
    reader.read_exact(&mut body).await?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

struct TrackedDevice {
    serial: String,
    state: DeviceState,
    model: Option<String>,
}

/// Linhas no formato `serial  device product:x model:Pixel_7 device:y ...`.
fn parse_device_list(payload: &str) -> Vec<TrackedDevice> {
    payload
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?.to_owned();
            let state = DeviceState::parse(fields.next()?);
            let model = fields
                .find_map(|field| field.strip_prefix("model:"))
                .map(|model| model.replace('_', " "));
            Some(TrackedDevice { serial, state, model })
        })
        .collect()
}

/// Reconcilia a lista recebida do adb com o estado atual.
fn apply(app: &AppHandle, tracked: Vec<TrackedDevice>) {
    let state = app.state::<AppState>();
    let mut needs_details = Vec::new();

    {
        let mut devices = state.devices.lock().unwrap();
        let present: HashSet<&str> = tracked.iter().map(|d| d.serial.as_str()).collect();

        devices.retain(|serial, _| {
            let keep = present.contains(serial.as_str());
            if !keep {
                state.processes.release_device(serial);
            }
            keep
        });

        for entry in &tracked {
            let device = devices
                .entry(entry.serial.clone())
                .or_insert_with(|| Device::new(&entry.serial));

            if entry.state == DeviceState::Online && device.state != DeviceState::Online {
                needs_details.push(entry.serial.clone());
            }
            if entry.state != DeviceState::Online {
                state.processes.release_device(&entry.serial);
            }

            device.state = entry.state;
            if device.model.is_none() {
                device.model = entry.model.clone();
            }
        }
    }

    publish(app);

    for serial in needs_details {
        tauri::async_runtime::spawn(refresh_details(app.clone(), serial));
    }
}

// --- detalhes ---------------------------------------------------------------------

/// Atualiza identidade, fabricante, modelo e bateria de um dispositivo online.
async fn refresh_details(app: AppHandle, serial: String) {
    let Ok(adb) = app.state::<AppState>().adb() else { return };
    let script = "getprop ro.serialno; getprop ro.product.manufacturer; \
                  getprop ro.product.model; dumpsys battery";
    let output = adb.shell(&serial, script).await.unwrap_or_default();

    let mut lines = output.lines().map(str::trim);
    let mut next_value = || lines.next().filter(|s| !s.is_empty()).map(str::to_owned);
    let identity = next_value().map_or(Identity::Unknown, Identity::Known);
    let manufacturer = next_value().map(|m| capitalize(&m));
    let model = next_value();
    let battery = parse_battery(lines);

    {
        let state = app.state::<AppState>();
        let mut devices = state.devices.lock().unwrap();
        let Some(device) = devices.get_mut(&serial) else { return };
        // Uma falha pontual não apaga uma identidade já conhecida.
        if device.identity == Identity::Pending || identity != Identity::Unknown {
            device.identity = identity;
        }
        device.manufacturer = manufacturer.or(device.manufacturer.take());
        device.model = model.or(device.model.take());
        device.battery = battery.or(device.battery);
    }

    publish(&app);
}

fn parse_battery<'a>(lines: impl Iterator<Item = &'a str>) -> Option<Battery> {
    let mut level = None;
    let mut charging = false;

    for line in lines {
        if let Some(value) = line.strip_prefix("level:") {
            level = value.trim().parse().ok();
        } else if let Some(value) = line.strip_prefix("status:") {
            // BatteryManager.BATTERY_STATUS_CHARGING = 2
            charging = value.trim() == "2";
        }
    }

    level.map(|level| Battery { level, charging })
}

fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// Mantém o nível de bateria atualizado sem polling no frontend.
pub async fn refresh_batteries(app: AppHandle) {
    let mut interval = tokio::time::interval(BATTERY_REFRESH);
    interval.tick().await; // o primeiro tick é imediato; os detalhes já vêm do tracker

    loop {
        interval.tick().await;
        let online: Vec<String> = {
            let state = app.state::<AppState>();
            let devices = state.devices.lock().unwrap();
            devices
                .values()
                .filter(|d| d.state == DeviceState::Online)
                .map(|d| d.serial.clone())
                .collect()
        };

        for serial in online {
            tauri::async_runtime::spawn(refresh_details(app.clone(), serial));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_long_device_list() {
        let payload = "R58M123\tdevice product:a52 model:SM_A525M device:a52q transport_id:1\n\
                       192.168.0.10:5555\tunauthorized transport_id:2\n\
                       ZY22\tno permissions (user in plugdev group; are your udev rules wrong?) usb:1-1\n";
        let devices = parse_device_list(payload);

        assert_eq!(devices.len(), 3);
        assert_eq!(devices[2].state, DeviceState::NoPermission);
        assert_eq!(devices[0].state, DeviceState::Online);
        assert_eq!(devices[0].model.as_deref(), Some("SM A525M"));
        assert_eq!(devices[1].state, DeviceState::Unauthorized);
        assert_eq!(Connection::from_serial(&devices[1].serial), Connection::Wifi);
    }

    fn online(serial: &str, identity: Identity) -> Device {
        Device { state: DeviceState::Online, identity, ..Device::new(serial) }
    }

    #[test]
    fn merges_transports_of_the_same_phone() {
        let phone = || Identity::Known("RQCY4082BEZ".into());
        let devices = merge_transports(vec![
            online("192.168.15.4:35139", phone()),
            online("adb-RQCY4082BEZ-t2UKR6._adb-tls-connect._tcp", phone()),
            online("R58M123", Identity::Known("R58M123".into())),
            online("192.168.15.20:5555", Identity::Pending),
        ]);

        let serials: Vec<&str> = devices.iter().map(|d| d.serial.as_str()).collect();
        assert_eq!(serials, ["R58M123", "adb-RQCY4082BEZ-t2UKR6._adb-tls-connect._tcp"]);
        assert_eq!(devices[1].id, "RQCY4082BEZ");
    }

    #[test]
    fn keeps_the_transport_that_is_mirroring() {
        let phone = || Identity::Known("RQCY4082BEZ".into());
        let mut by_ip = online("192.168.15.4:35139", phone());
        by_ip.mirroring = true;

        let devices = merge_transports(vec![
            by_ip,
            online("adb-RQCY4082BEZ-t2UKR6._adb-tls-connect._tcp", phone()),
        ]);

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "192.168.15.4:35139");
    }

    #[test]
    fn extracts_serialno_from_mdns_serial() {
        let serial = "adb-RQCY4082BEZ-t2UKR6._adb-tls-connect._tcp";
        assert_eq!(serialno_from_mdns(serial).as_deref(), Some("RQCY4082BEZ"));
        assert_eq!(serialno_from_mdns("192.168.15.4:35139"), None);
    }

    #[test]
    fn parses_battery_dump() {
        let dump = ["AC powered: false", "status: 2", "level: 87", "scale: 100"];
        let battery = parse_battery(dump.into_iter()).unwrap();
        assert_eq!(battery.level, 87);
        assert!(battery.charging);
    }
}
