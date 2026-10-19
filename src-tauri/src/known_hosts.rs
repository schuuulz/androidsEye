//! Aparelhos pareados que o adb lembra neste computador (`adb_known_hosts.pb`).
//!
//! É graças a essa lista que o adb reconecta sozinho, via mDNS, a um celular
//! já pareado. Esquecer o aparelho aqui encerra essa reconexão automática.
//!
//! O arquivo é um protobuf mínimo — não justifica uma dependência:
//! `AdbKnownHosts { repeated HostInfo host_infos = 1 }`, `HostInfo { string guid = 1 }`.

use std::io;
use std::path::{Path, PathBuf};

/// Tag protobuf do campo 1 com tipo "length-delimited".
const FIELD_1: u8 = 0x0a;

/// Mesma resolução do adb: `$ANDROID_USER_HOME`, senão `~/.android`.
pub fn default_path() -> io::Result<PathBuf> {
    let android_home = match std::env::var_os("ANDROID_USER_HOME") {
        Some(dir) => PathBuf::from(dir),
        None => std::env::home_dir()
            .ok_or_else(|| io::Error::other("pasta do usuário não encontrada"))?
            .join(".android"),
    };
    Ok(android_home.join("adb_known_hosts.pb"))
}

/// Remove todas as entradas do aparelho (`adb-<serialno>-*`). Retorna quantas saíram.
pub fn forget(file: &Path, serialno: &str) -> io::Result<usize> {
    let bytes = match std::fs::read(file) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(err) => return Err(err),
    };
    let hosts = decode(&bytes).ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "adb_known_hosts.pb em formato inesperado")
    })?;

    let prefix = format!("adb-{serialno}-");
    let kept: Vec<&Host> = hosts.iter().filter(|h| !h.guid.starts_with(&prefix)).collect();
    let removed = hosts.len() - kept.len();
    if removed == 0 {
        return Ok(0);
    }

    // Grava ao lado e renomeia: o adb nunca lê um arquivo pela metade.
    let temp = file.with_extension("pb.tmp");
    std::fs::write(&temp, encode(&kept))?;
    std::fs::rename(&temp, file)?;
    Ok(removed)
}

struct Host<'a> {
    /// Bytes originais da entrada, regravados intactos.
    raw: &'a [u8],
    guid: String,
}

fn decode(mut bytes: &[u8]) -> Option<Vec<Host<'_>>> {
    let mut hosts = Vec::new();
    while !bytes.is_empty() {
        let raw = read_field(&mut bytes)?;
        let mut inner = raw;
        let guid = read_field(&mut inner)
            .map(|guid| String::from_utf8_lossy(guid).into_owned())
            .unwrap_or_default();
        hosts.push(Host { raw, guid });
    }
    Some(hosts)
}

fn encode(hosts: &[&Host]) -> Vec<u8> {
    let mut out = Vec::new();
    for host in hosts {
        out.push(FIELD_1);
        write_varint(&mut out, host.raw.len() as u64);
        out.extend_from_slice(host.raw);
    }
    out
}

fn read_field<'a>(bytes: &mut &'a [u8]) -> Option<&'a [u8]> {
    let (&tag, rest) = bytes.split_first()?;
    if tag != FIELD_1 {
        return None;
    }
    let (len, rest) = read_varint(rest)?;
    let len = usize::try_from(len).ok().filter(|&len| len <= rest.len())?;
    let (field, rest) = rest.split_at(len);
    *bytes = rest;
    Some(field)
}

fn read_varint(bytes: &[u8]) -> Option<(u64, &[u8])> {
    let mut value = 0u64;
    for (i, &byte) in bytes.iter().enumerate().take(10) {
        value |= u64::from(byte & 0x7f) << (7 * i);
        if byte & 0x80 == 0 {
            return Some((value, &bytes[i + 1..]));
        }
    }
    None
}

fn write_varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(guid: &str) -> Vec<u8> {
        let mut inner = vec![FIELD_1, guid.len() as u8];
        inner.extend_from_slice(guid.as_bytes());
        let mut out = vec![FIELD_1, inner.len() as u8];
        out.extend(inner);
        out
    }

    #[test]
    fn forgets_every_entry_of_a_phone() {
        // Mesmo formato do arquivo real: o RQCY… aparece uma vez por pareamento.
        let keep = entry("adb-RXCT20176QK-GMEZOq");
        let file_bytes = [keep.clone(), entry("adb-RQCY4082BEZ-t2UKR6"), entry("adb-RQCY4082BEZ-t2UKR6")].concat();

        let file = std::env::temp_dir().join(format!("known_hosts_{}.pb", std::process::id()));
        std::fs::write(&file, &file_bytes).unwrap();

        assert_eq!(forget(&file, "RQCY4082BEZ").unwrap(), 2);
        assert_eq!(std::fs::read(&file).unwrap(), keep);
        assert_eq!(forget(&file, "RQCY4082BEZ").unwrap(), 0);

        std::fs::remove_file(&file).unwrap();
    }

    #[test]
    fn varints_round_trip() {
        for value in [0, 1, 127, 128, 300, 16_384] {
            let mut out = Vec::new();
            write_varint(&mut out, value);
            assert_eq!(read_varint(&out).unwrap().0, value);
        }
    }
}
