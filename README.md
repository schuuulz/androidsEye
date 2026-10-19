<div align="center">

<img src="app-icon.svg" width="112" alt="androidsEye" />

# androidsEye

**Veja, espelhe e controle seus aparelhos Android, sem decorar um único comando `adb`.**

Um hub desktop que transforma o Android Debug Bridge em uma interface visual, rápida e em tempo real.

<br />

![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white&labelColor=09090b)
![Rust](https://img.shields.io/badge/Rust-backend-DEA584?style=for-the-badge&logo=rust&logoColor=white&labelColor=09090b)
![React](https://img.shields.io/badge/React_19-frontend-61DAFB?style=for-the-badge&logo=react&logoColor=white&labelColor=09090b)
![Plataformas](https://img.shields.io/badge/Windows_·_Linux_·_macOS-10b981?style=for-the-badge&labelColor=09090b)
![Licença MIT](https://img.shields.io/badge/licença-MIT-a1a1aa?style=for-the-badge&labelColor=09090b)

</div>

---

## 👁️ Por que o androidsEye existe

O `adb` é poderoso, mas exige terminal, comandos de memória e paciência: descobrir o serial, lembrar a flag certa,
copiar o caminho de um APK, parear pelo Wi-Fi com IP, porta e código...

O **androidsEye** deixa tudo isso **visível e a um clique**. Você conecta o celular e ele aparece. Clica e a tela está
espelhada. Abre um shell sem sair do app. Extrai um APK escolhendo da lista. O objetivo é que **qualquer pessoa**
(dev, QA, suporte técnico ou quem só quer ver a tela do celular no PC) controle seus aparelhos com confiança,
entendendo o que está acontecendo, sem medo de errar um comando.

<table>
<tr><th>Sem o androidsEye</th><th>Com o androidsEye</th></tr>
<tr>
<td>

```sh
adb devices -l
adb -s R58M12... shell getprop ro.product.model
scrcpy -s R58M12... --turn-screen-off
adb -s R58M12... shell pm list packages -f -3 | grep app
adb -s R58M12... pull /data/app/~~x==/com.app-y==/base.apk
adb pair 192.168.0.10:37123 482915
adb connect 192.168.0.10:41235
```

</td>
<td>

- Os aparelhos **aparecem sozinhos** em cards
- **Espelhar** → um clique
- **Shell** → terminal integrado na lateral
- **APK** → busca, escolhe, salva em Downloads
- **Parear** → aponta a câmera para o QR Code

</td>
</tr>
</table>

---

## ✨ Funcionalidades

### 📱 Hub de dispositivos em tempo real
- A lista se atualiza **sozinha** ao plugar, desplugar ou autorizar um aparelho. Não existe botão de "atualizar".
- Cada card mostra **modelo, fabricante, serial/IP, bateria** (com indicação de carregamento) e o tipo de conexão
  (**USB** ou **Wi-Fi**).
- Status claros, cada um com o que fazer: 🟢 **Online** · 🟡 **Não autorizado** (passo a passo para aceitar a chave
  RSA) · 🟡 **Sem permissão USB** (como liberar no Linux) · ⚪ **Offline**.
- **Um card por aparelho físico**: mesmo que o adb enxergue o celular por USB, mDNS e IP ao mesmo tempo, você vê só um.

### 🖥️ Espelhamento de tela
- Um clique abre o [scrcpy](https://github.com/Genymobile/scrcpy) com a **tela física desligada**, para economizar
  bateria e manter a privacidade.
- O card indica quando o espelhamento está ativo, e o processo é encerrado sozinho se o cabo cair.

### ⌨️ Shell ADB integrado
- Terminal completo com **xterm.js** numa gaveta lateral, sem sair do hub.
- Redimensionamento real (`top`, `vi` e afins se ajustam), cores, links clicáveis.
- **Ctrl+Shift+C / V** e clique direito para copiar e colar, e **Ctrl+C** continua interrompendo o processo.
- Ao fechar, a sessão termina de forma limpa (`exit`). Nenhum `adb shell` fica órfão.

### 📦 Extração de APK
- Lista de apps **em ordem alfabética**, com busca instantânea e destaque do termo.
- Alterna entre **apps do usuário** e **todos** (incluindo os de sistema).
- Salva com o diálogo nativo do sistema, já apontando para **Downloads**, com **barra de progresso** e cancelamento.

### 📶 Pareamento por Wi-Fi (Android 11+)
Na primeira vez que você ativa a Depuração por Wi-Fi, o celular **só aparece depois de pareado**. O androidsEye
oferece as duas formas nativas do Android:

| | Como funciona |
|---|---|
| **QR Code** | O app gera o código; o celular lê pela câmera do menu de depuração. Pareia e conecta sozinho. |
| **Código de pareamento** | O app **encontra o celular na rede** automaticamente; você só digita os 6 dígitos. |
| **Já pareado** | Conexão direta por `IP:porta`. |

E, para desfazer, **Desparear** faz este computador esquecer o aparelho (e, se você quiser, desliga a Depuração por
Wi-Fi no celular). O app pede confirmação antes.

### 🧰 Dependências sob controle
- Ao abrir, o app verifica se `adb` e `scrcpy` estão disponíveis e, se faltar algo, mostra **como instalar** no seu
  sistema.
- No Windows, o **instalador já baixa e configura tudo** (veja abaixo).

---

## 📥 Instalação

### Windows: instalador completo

Baixe o `androidsEye_x.y.z_x64-setup.exe` na página de **Releases** e execute. O instalador:

1. Instala o androidsEye para o seu usuário (não pede permissão de administrador);
2. **Baixa a versão mais recente do scrcpy** direto do GitHub oficial, conferindo o SHA-256 do arquivo;
3. Coloca o scrcpy, que **já inclui o `adb`**, no **PATH do usuário**, para você também usá-los no terminal.

> Sem internet na hora da instalação? Tudo bem: o app é instalado mesmo assim e, ao abrir, mostra como instalar o
> scrcpy. Ao desinstalar, a pasta do scrcpy e a entrada no PATH são removidas.

### 🐧 Linux: um comando

```sh
curl -fsSL https://raw.githubusercontent.com/schuuulz/androidsEye/main/install.sh | sh
```

O script detecta sua distro, baixa o pacote certo da última Release (`.deb`, `.rpm` ou AppImage) e instala junto o
`adb`, o `scrcpy` e as regras USB, para o celular ser reconhecido pelo cabo de primeira. Para **atualizar**, rode o
mesmo comando. Para **remover**: `curl -fsSL .../install.sh | sh -s -- --uninstall`.

<details>
<summary>Prefere instalar manualmente?</summary>

| Distro | Como instalar |
|---|---|
| **Ubuntu / Debian** | Baixe o `.deb` e rode `sudo apt install ./androidsEye_*_amd64.deb`. O `adb` vem junto; o `scrcpy` e as regras USB são instalados como recomendados. |
| **Fedora** | `sudo dnf install ./androidsEye-*.x86_64.rpm` (instala o `android-tools`) e o scrcpy pelo [COPR](https://copr.fedorainfracloud.org/coprs/zeno/scrcpy/). |
| **Outras** | Use o `.AppImage` (`chmod +x` e execute) e instale `adb` e `scrcpy` pelo gerenciador da sua distro. |

</details>

> **Celular aparece como "Sem permissão USB"?** O Linux bloqueia o acesso ao aparelho até existirem regras udev.
> O próprio card mostra como resolver: `sudo apt install android-sdk-platform-tools-common`,
> `sudo usermod -aG plugdev $USER`, reiniciar a sessão e reconectar o cabo.

### 🍎 macOS (Intel e Apple Silicon)

1. Instale as dependências com o [Homebrew](https://brew.sh):
   ```sh
   brew install --cask android-platform-tools
   brew install scrcpy
   ```
2. Abra o `.dmg` e arraste o **androidsEye** para **Aplicativos**.
3. Na **primeira abertura**, o macOS avisa que não pode verificar o desenvolvedor, porque o app ainda não é assinado
   pela Apple. Vá em **Ajustes do Sistema › Privacidade e Segurança** e clique em **Abrir Mesmo Assim**. Isso só é
   necessário uma vez.

> Já tem o adb ou o scrcpy em outro lugar? Aponte com as variáveis `ADB_PATH` e `SCRCPY_PATH`.

---

## 🚀 Primeiros passos

1. **Ative as Opções do desenvolvedor**: *Configurações › Sobre o telefone* › toque 7× em **Número da versão**.
2. **Por cabo:** ative **Depuração USB**, plugue o celular e toque em **Permitir** no aviso que aparece na tela.
3. **Por Wi-Fi:** ative **Depuração por Wi-Fi**, clique em **Adicionar dispositivo** no androidsEye e escaneie o
   QR Code (celular e computador na mesma rede).
4. Pronto: o card aparece e as ações **Espelhar**, **Shell** e **APK** ficam disponíveis.

---

## 🏗️ Como funciona por dentro

```mermaid
flowchart LR
    subgraph UI["React + Tailwind (webview)"]
        Hub[Hub de dispositivos]
        Term[Terminal xterm.js]
        Apk[Extrator de APK]
        Pair[Pareamento Wi-Fi]
    end

    subgraph Core["Rust + Tauri v2"]
        Tracker["Tracker<br/>adb track-devices"]
        Registry["Registro de processos<br/>(RAII)"]
        Cmds[Comandos assíncronos]
    end

    Phone(("📱 Android"))

    Tracker -- "evento devices:changed" --> Hub
    Term <-- "Channel (stream)" --> Cmds
    Apk <-- "Channel (progresso)" --> Cmds
    Pair --> Cmds
    Cmds --> Registry
    Registry -- "scrcpy · adb shell · pull" --> Phone
    Tracker --- Phone
```

- **Tempo real sem polling:** um `adb track-devices` de longa duração recebe cada mudança direto do servidor adb.
- **Streaming assíncrono:** saída do shell e progresso de download usam `tauri::ipc::Channel` com `tokio::process`,
  sem bloquear a interface.
- **Nenhum processo órfão:** cada `scrcpy`, `adb shell` e download pertence a um handle. Descartar o handle (fechar o
  painel, desconectar o cabo, fechar o app) encerra o processo.
- **Erros que ajudam:** um `enum AdbError` serializável chega ao frontend com **mensagem e dica de solução**
  (ex.: *"Desbloqueie o aparelho e toque em Permitir"*).
- **APK byte a byte:** `adb exec-out cat` com contagem real de bytes, para um progresso preciso e verificação de
  integridade no fim.

---

## 🛠️ Desenvolvimento

**Pré-requisitos:** [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 20+ e os
[pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) para o seu sistema.

```sh
npm install
npm run tauri dev      # app com hot reload
npm run tauri build    # instalador (no Windows: NSIS com download automático do scrcpy)
```

```sh
cd src-tauri
cargo test             # testes do backend (parsers do adb, mDNS, known hosts, fusão de transportes...)
cargo clippy           # lint
```

### 🚢 Publicando uma versão

Os instaladores dos três sistemas são gerados pelo GitHub Actions (`.github/workflows/release.yml`). Não é preciso ter
Linux nem Mac:

1. Aumente `version` em `src-tauri/tauri.conf.json` (ex.: `0.2.0`).
2. Faça merge na `main`. O workflow compila Windows, Linux e macOS e monta uma Release **rascunho** `v0.2.0` com todos
   os instaladores. Merges seguintes atualizam o mesmo rascunho.
3. Revise o rascunho em **Releases** e clique em **Publish**.

Uma versão já publicada nunca é sobrescrita: o workflow avisa para aumentar o número. Enquanto o repositório for
privado, o workflow não roda sozinho (minutos de macOS custam 10×); dispare em **Actions › Release › Run workflow**.

<details>
<summary><b>Estrutura do projeto</b></summary>

```
src/                          React + TypeScript
├─ components/
│  ├─ DeviceHub.tsx           tela principal
│  ├─ DeviceCard.tsx          card com status e ações
│  ├─ AdbTerminal.tsx         shell com xterm.js
│  ├─ ApkExtractorModal.tsx   lista de apps e download
│  ├─ pairing/                QR Code, código de 6 dígitos, conexão manual
│  └─ ui/                     botões, modais, diálogos, controles
├─ hooks/                     useDevices, useDependencies, usePairingServices
└─ lib/                       API tipada do backend

src-tauri/                    Rust + Tauri v2
├─ src/
│  ├─ devices.rs              tracker em tempo real e fusão de transportes
│  ├─ process.rs              ciclo de vida dos processos (RAII)
│  ├─ mirror.rs · shell.rs    scrcpy e shell interativo
│  ├─ packages.rs             apps instalados e extração de APK
│  ├─ pairing.rs              pareamento e despareamento Wi-Fi via mDNS
│  ├─ known_hosts.rs          aparelhos pareados que o adb lembra
│  └─ error.rs                AdbError → { kind, message, hint }
├─ windows/                   hooks do instalador NSIS + script do scrcpy
└─ tauri.{windows,linux,macos}.conf.json   empacotamento de cada sistema
```

</details>

---

## 🤝 Contribuindo

O androidsEye é open-source e contribuições são bem-vindas: abra uma *issue* para relatar um bug ou sugerir uma
ideia, ou envie um *pull request*. Antes de enviar, rode `cargo test`, `cargo clippy` e `npm run build`.

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE). Use, modifique e redistribua à vontade, mantendo o aviso de copyright.

O androidsEye usa, mas não inclui no código-fonte, o [scrcpy](https://github.com/Genymobile/scrcpy) (Apache-2.0) e o
[Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools) (`adb`), que têm suas
próprias licenças.

---

<div align="center">
<sub>Feito com Rust, React e muito <code>adb</code> por trás, para você não precisar digitar nenhum.</sub>
</div>
