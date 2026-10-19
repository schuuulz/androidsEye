use serde::{ser::SerializeStruct, Serialize, Serializer};

pub type Result<T, E = AdbError> = std::result::Result<T, E>;

/// Erro único da aplicação. Chega ao frontend como `{ kind, message, hint }`.
#[derive(Debug, thiserror::Error)]
pub enum AdbError {
    #[error("'{0}' não foi encontrado no sistema")]
    BinaryNotFound(&'static str),

    #[error("O dispositivo '{0}' não está conectado")]
    DeviceNotFound(String),

    #[error("O dispositivo ainda não autorizou este computador")]
    Unauthorized,

    #[error("O dispositivo está offline")]
    Offline,

    #[error("Já existe um espelhamento ativo neste dispositivo")]
    AlreadyMirroring,

    #[error("A sessão do terminal já foi encerrada")]
    SessionNotFound,

    #[error("O dispositivo demorou demais para responder")]
    Timeout,

    #[error("Não foi possível parear com o dispositivo")]
    PairingFailed,

    #[error("Operação cancelada")]
    Cancelled,

    #[error("{0}")]
    CommandFailed(String),

    #[error("Erro de E/S: {0}")]
    Io(#[from] std::io::Error),
}

impl AdbError {
    /// Traduz o stderr do adb em um erro com significado para o usuário.
    pub fn from_adb_output(output: &str, serial: Option<&str>) -> Self {
        let lower = output.to_lowercase();
        if lower.contains("unauthorized") {
            Self::Unauthorized
        } else if lower.contains("offline") {
            Self::Offline
        } else if lower.contains("not found") && lower.contains("device") {
            Self::DeviceNotFound(serial.unwrap_or_default().to_owned())
        } else {
            let message = output.trim();
            Self::CommandFailed(if message.is_empty() {
                "O comando adb falhou sem mensagem de erro".into()
            } else {
                message.to_owned()
            })
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::BinaryNotFound(_) => "binaryNotFound",
            Self::DeviceNotFound(_) => "deviceNotFound",
            Self::Unauthorized => "unauthorized",
            Self::Offline => "offline",
            Self::AlreadyMirroring => "alreadyMirroring",
            Self::SessionNotFound => "sessionNotFound",
            Self::Timeout => "timeout",
            Self::PairingFailed => "pairingFailed",
            Self::Cancelled => "cancelled",
            Self::CommandFailed(_) => "commandFailed",
            Self::Io(_) => "io",
        }
    }

    fn hint(&self) -> Option<&'static str> {
        match self {
            Self::BinaryNotFound(_) => {
                Some("Instale a ferramenta e garanta que ela esteja no PATH do sistema.")
            }
            Self::DeviceNotFound(_) => Some("Verifique o cabo USB ou a conexão Wi-Fi."),
            Self::Unauthorized => Some(
                "Desbloqueie o aparelho e toque em \"Permitir\" no diálogo de depuração USB.",
            ),
            Self::Offline => Some("Reconecte o cabo ou reinicie a depuração USB no aparelho."),
            Self::Timeout => Some("Confira se o aparelho está desbloqueado e tente novamente."),
            Self::PairingFailed => Some(
                "Confira o código e se o celular ainda mostra a tela de pareamento.",
            ),
            _ => None,
        }
    }
}

impl Serialize for AdbError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AdbError", 3)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("hint", &self.hint())?;
        s.end()
    }
}
