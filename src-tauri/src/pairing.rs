//! Pareamento de depuração por Wi-Fi (Android 11+).
//!
//! O celular anuncia via mDNS um serviço `_adb-tls-pairing._tcp` enquanto a tela
//! de pareamento está aberta (QR Code ou código de 6 dígitos). Depois de
//! pareado, passa a anunciar `_adb-tls-connect._tcp`, que é onde conectamos.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::adb::Adb;
use crate::devices;
use crate::error::{AdbError, Result};
use crate::known_hosts;
use crate::state::AppState;

const CONNECT_ATTEMPTS: u32 = 10;
const CONNECT_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceKind {
    Pairing,
    Connect,
}

#[derive(Debug, Clone, Serialize)]
pub struct MdnsService {
    pub name: String,
    pub kind: ServiceKind,
    pub address: String,
}

impl MdnsService {
    fn ip(&self) -> &str {
        ip_of(&self.address)
    }
}

pub async fn services(adb: &Adb) -> Result<Vec<MdnsService>> {
    Ok(parse_mdns_services(&adb.mdns_services().await?))
}

/// Pareia e, em seguida, garante que o aparelho fique conectado.
pub async fn pair_device(app: &AppHandle, address: &str, secret: &str) -> Result<()> {
    let adb = app.state::<AppState>().adb()?;
    adb.pair(address, secret).await?;

    // O adb costuma conectar sozinho a aparelhos recém-pareados; só intervimos
    // se, após alguns segundos, ele ainda não apareceu na lista.
    let ip = ip_of(address);
    for _ in 0..CONNECT_ATTEMPTS {
        tokio::time::sleep(CONNECT_INTERVAL).await;

        let Some(service) = services(&adb)
            .await?
            .into_iter()
            .find(|s| s.kind == ServiceKind::Connect && s.ip() == ip)
        else {
            continue;
        };

        if !is_tracked(app, &service) {
            adb.connect(&service.address).await?;
        }
        return Ok(());
    }

    // Pareado, mas o celular não anunciou a porta de conexão a tempo: o
    // usuário ainda pode conectar pela aba "Já pareado".
    Ok(())
}

/// Faz este computador esquecer o aparelho e encerra suas conexões Wi-Fi.
///
/// Não há comando adb para tirar o PC da lista de pareados *do celular*; por
/// isso, opcionalmente, desligamos a Depuração por Wi-Fi no próprio aparelho.
pub async fn unpair(app: &AppHandle, serial: &str, disable_wireless_debugging: bool) -> Result<()> {
    let state = app.state::<AppState>();
    let adb = state.adb()?;
    let (serialno, transports) = devices::wifi_transports_of(&state, serial);

    if disable_wireless_debugging {
        // Derruba a própria conexão; se o aparelho já tiver caído, seguimos mesmo assim.
        let _ = adb.shell(serial, "settings put global adb_wifi_enabled 0").await;
    }

    // Sem isto, o adb reconectaria sozinho via mDNS segundos depois.
    if let Some(serialno) = serialno {
        known_hosts::forget(&known_hosts::default_path()?, &serialno)?;
    }

    let announced = services(&adb).await.unwrap_or_default();
    for transport in transports {
        // `adb disconnect` espera `ip:porta`; seriais mDNS são traduzidos pelo anúncio.
        let address = announced
            .iter()
            .find(|s| s.kind == ServiceKind::Connect && transport.starts_with(&s.name))
            .map_or(transport.as_str(), |s| s.address.as_str());
        let _ = adb.disconnect(address).await;
    }

    Ok(())
}

fn is_tracked(app: &AppHandle, service: &MdnsService) -> bool {
    let state = app.state::<AppState>();
    let devices = state.devices.lock().unwrap();
    devices
        .keys()
        .any(|serial| serial.starts_with(&service.name) || *serial == service.address)
}

pub fn validate_address(address: &str) -> Result<()> {
    let valid = address
        .rsplit_once(':')
        .is_some_and(|(host, port)| !host.is_empty() && port.parse::<u16>().is_ok());
    if valid {
        Ok(())
    } else {
        Err(AdbError::CommandFailed(format!("Endereço inválido: {address}")))
    }
}

fn ip_of(address: &str) -> &str {
    address.rsplit_once(':').map_or(address, |(ip, _)| ip)
}

/// Linhas no formato `nome\t_adb-tls-pairing._tcp\t192.168.0.10:37123`.
fn parse_mdns_services(output: &str) -> Vec<MdnsService> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let name = fields.next()?.to_owned();
            let kind = match fields.next()? {
                "_adb-tls-pairing._tcp" => ServiceKind::Pairing,
                "_adb-tls-connect._tcp" => ServiceKind::Connect,
                _ => return None,
            };
            let address = fields.next()?.to_owned();
            Some(MdnsService { name, kind, address })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mdns_services() {
        let output = "List of discovered mdns services\n\
                      adb-RXCT-GMEZOq\t_adb-tls-connect._tcp\t192.168.15.9:43399\n\
                      androidseye-x7k2\t_adb-tls-pairing._tcp\t192.168.15.9:37011\n";
        let services = parse_mdns_services(output);

        assert_eq!(services.len(), 2);
        assert_eq!(services[0].kind, ServiceKind::Connect);
        assert_eq!(services[1].name, "androidseye-x7k2");
        assert_eq!(services[1].ip(), "192.168.15.9");
    }

    #[test]
    fn validates_addresses() {
        assert!(validate_address("192.168.0.10:5555").is_ok());
        assert!(validate_address("192.168.0.10").is_err());
        assert!(validate_address(":5555").is_err());
    }
}
