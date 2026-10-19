#!/bin/sh
# Instalador do androidsEye para Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/schuuulz/androidsEye/main/install.sh | sh
#
# Opções (depois de `sh -s --`):
#   --uninstall          remove o androidsEye
#   --version v0.2.0     instala uma versão específica (padrão: a mais recente)
#
# Escolhe o pacote certo para a distro (.deb, .rpm ou AppImage), instala o adb,
# o scrcpy e as regras USB, e deixa o celular pronto para ser reconhecido.

set -eu

REPO="schuuulz/androidsEye"
APP="androidsEye"

# --- aparência -----------------------------------------------------------------

if [ -t 1 ]; then
    BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m'); GREEN=$(printf '\033[32m')
    YELLOW=$(printf '\033[33m'); RED=$(printf '\033[31m'); RESET=$(printf '\033[0m')
else
    BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

step() { printf '%s›%s %s\n' "$GREEN" "$RESET" "$1"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail() { printf '%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# --- utilitários ---------------------------------------------------------------

has() { command -v "$1" >/dev/null 2>&1; }

as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    elif has sudo; then
        sudo "$@"
    else
        fail "É preciso permissão de administrador, mas o sudo não está disponível."
    fi
}

download() { # download <url> <arquivo>
    if has curl; then
        curl -fsSL --retry 3 -o "$2" "$1"
    elif has wget; then
        wget -q -O "$2" "$1"
    else
        fail "Instale o curl ou o wget e tente de novo."
    fi
}

# --- descoberta da versão ------------------------------------------------------

release_api() {
    if [ -n "${VERSION:-}" ]; then
        echo "https://api.github.com/repos/$REPO/releases/tags/$VERSION"
    else
        echo "https://api.github.com/repos/$REPO/releases/latest"
    fi
}

# Primeiro link de download da release que termina com o sufixo pedido.
asset_url() { # asset_url <json> <sufixo>
    grep -o '"browser_download_url": *"[^"]*"' "$1" \
        | sed 's/.*"\(https[^"]*\)"/\1/' \
        | grep -F -- "$2" \
        | grep -v '\.sig$' \
        | head -n 1
}

# --- instalação por tipo de pacote ---------------------------------------------

install_deb() {
    step "Instalando o pacote .deb (o adb, o scrcpy e as regras USB vêm junto)..."
    as_root apt-get update -qq
    as_root apt-get install -y "$1"
}

install_rpm() {
    step "Instalando o pacote .rpm (o adb vem junto)..."
    if has dnf; then
        as_root dnf install -y "$1"
    elif has zypper; then
        as_root zypper --non-interactive install --allow-unsigned-rpm "$1"
    else
        as_root yum install -y "$1"
    fi
}

install_appimage() {
    step "Instalando o AppImage em ~/.local/bin..."
    bin_dir="$HOME/.local/bin"
    apps_dir="$HOME/.local/share/applications"
    icon_dir="$HOME/.local/share/icons/hicolor/128x128/apps"
    mkdir -p "$bin_dir" "$apps_dir" "$icon_dir"

    install -m 755 "$1" "$bin_dir/androidseye"
    download "https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/128x128.png" \
        "$icon_dir/androidseye.png" || true

    cat > "$apps_dir/androidseye.desktop" <<EOF
[Desktop Entry]
Name=$APP
Comment=Veja, espelhe e controle aparelhos Android
Exec=$bin_dir/androidseye
Icon=androidseye
Terminal=false
Type=Application
Categories=Development;Utility;
EOF

    case ":$PATH:" in
        *":$bin_dir:"*) ;;
        *) warn "$bin_dir não está no seu PATH; o app aparece no menu mesmo assim." ;;
    esac
    has fusermount || has fusermount3 \
        || warn "AppImages precisam do FUSE. Se o app não abrir, instale o pacote fuse2 (ou libfuse2) da sua distro."
}

# Permite que o adb enxergue o celular pelo cabo sem precisar de root.
setup_usb_access() {
    if getent group plugdev >/dev/null 2>&1 && ! id -nG "$(id -un)" | grep -qw plugdev; then
        step "Adicionando $(id -un) ao grupo plugdev (acesso USB ao celular)..."
        as_root usermod -aG plugdev "$(id -un)"
        RELOGIN=1
    fi
    if has udevadm; then
        as_root udevadm control --reload-rules 2>/dev/null || true
        as_root udevadm trigger 2>/dev/null || true
    fi
}

check_dependencies() {
    has adb || warn "adb não encontrado. Instale pelo gerenciador da sua distro (ex.: android-tools)."
    if ! has scrcpy; then
        if has dnf; then
            warn "scrcpy não encontrado. No Fedora: sudo dnf copr enable zeno/scrcpy && sudo dnf install scrcpy"
        else
            warn "scrcpy não encontrado. Instale pelo gerenciador da sua distro para usar o espelhamento."
        fi
    fi
}

# --- desinstalação -------------------------------------------------------------

# Nome do pacote instalado (o Tauri pode gerar "androidseye" ou "androids-eye").
installed_package() {
    if has dpkg-query; then
        dpkg-query -W -f '${Package}\n' 2>/dev/null | grep -ix 'androids-\{0,1\}eye' | head -n 1
    elif has rpm; then
        rpm -qa --qf '%{NAME}\n' 2>/dev/null | grep -ix 'androids-\{0,1\}eye' | head -n 1
    fi
}

uninstall() {
    step "Removendo o $APP..."
    package=$(installed_package || true)
    if [ -n "$package" ]; then
        if has apt-get; then as_root apt-get remove -y "$package"
        elif has dnf; then as_root dnf remove -y "$package"
        elif has zypper; then as_root zypper --non-interactive remove "$package"
        else as_root yum remove -y "$package"; fi
    fi
    rm -f "$HOME/.local/bin/androidseye" \
          "$HOME/.local/share/applications/androidseye.desktop" \
          "$HOME/.local/share/icons/hicolor/128x128/apps/androidseye.png"
    ok "$APP removido. O adb e o scrcpy continuam instalados."
}

# --- principal -----------------------------------------------------------------

main() {
    VERSION=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --uninstall) uninstall; exit 0 ;;
            --version) VERSION="${2:?informe a versão, ex.: --version v0.2.0}"; shift 2 ;;
            *) fail "Opção desconhecida: $1" ;;
        esac
    done

    printf '\n%s👁  %s%s %s— instalador para Linux%s\n\n' "$BOLD" "$APP" "$RESET" "$DIM" "$RESET"

    [ "$(uname -s)" = "Linux" ] || fail "Este instalador é para Linux. Veja o README para Windows e macOS."
    case "$(uname -m)" in
        x86_64 | amd64) ;;
        *) fail "Por enquanto só há pacotes para x86_64 (este computador é $(uname -m))." ;;
    esac

    # Escolhe o formato pelo gerenciador de pacotes disponível.
    if has apt-get && has dpkg; then
        kind=deb; suffix="_amd64.deb"
    elif has dnf || has zypper || has yum; then
        kind=rpm; suffix=".x86_64.rpm"
    else
        kind=appimage; suffix="_amd64.AppImage"
    fi

    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    # O apt lê o pacote com um usuário sem privilégios (_apt); sem isto, avisa.
    chmod 755 "$tmp"

    step "Procurando a ${VERSION:-versão mais recente}..."
    download "$(release_api)" "$tmp/release.json" \
        || fail "Não foi possível consultar as releases de $REPO."
    tag=$(grep -o '"tag_name": *"[^"]*"' "$tmp/release.json" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
    url=$(asset_url "$tmp/release.json" "$suffix")
    [ -n "$url" ] || fail "A release $tag não tem um pacote $suffix."

    # apt/dnf exigem caminho com barra para tratar o argumento como arquivo local.
    package="$tmp/${url##*/}"
    step "Baixando ${url##*/}..."
    download "$url" "$package"

    RELOGIN=0
    case "$kind" in
        deb) install_deb "$package" ;;
        rpm) install_rpm "$package" ;;
        appimage) install_appimage "$package" ;;
    esac
    setup_usb_access
    check_dependencies

    printf '\n'
    ok "${BOLD}$APP $tag instalado!${RESET} Procure por \"$APP\" no menu de aplicativos."
    if [ "$RELOGIN" -eq 1 ]; then
        warn "Saia e entre de novo na sessão para o acesso USB valer."
    fi
    printf '%s  Para atualizar, rode este mesmo comando. Para remover: ... | sh -s -- --uninstall%s\n\n' "$DIM" "$RESET"
}

# Tudo dentro de main(): se o download do script for interrompido no meio,
# nada é executado pela metade.
main "$@"
