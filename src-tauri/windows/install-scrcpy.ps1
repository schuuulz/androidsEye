<#
.SYNOPSIS
    Instala (ou remove) a versão mais recente do scrcpy — que já inclui o adb —
    e a coloca no PATH do usuário.

.DESCRIPTION
    Executado pelo instalador do androidsEye (hooks.nsh), mas também funciona
    sozinho:  powershell -ExecutionPolicy Bypass -File install-scrcpy.ps1 -Destination C:\tools\scrcpy
#>
param(
    [Parameter(Mandatory)] [string] $Destination,
    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'                  # a barra do PowerShell 5 deixa o download lento
[Console]::OutputEncoding = [Text.Encoding]::Default      # acentos legíveis no log do instalador
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Destination = $Destination.TrimEnd('\')

function Set-UserPath([bool] $Include) {
    # Lê o valor cru do registro: preserva entradas como %USERPROFILE%\bin.
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $current = $key.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
    $entries = @($current -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $Destination })
    if ($Include) { $entries += $Destination }
    $updated = $entries -join ';'
    # Sem mudança real, o PATH do usuário fica exatamente como estava.
    if ($updated -ne $current.TrimEnd(';')) { $key.SetValue('Path', $updated, 'ExpandString') }
    $key.Close()

    # Avisa o Windows para que novos terminais já enxerguem o PATH atualizado.
    Add-Type -Namespace Win32 -Name Env -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam,
                                               uint flags, uint timeout, out UIntPtr result);
'@
    $result = [UIntPtr]::Zero
    [Win32.Env]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null
}

function Remove-Current {
    # O servidor do adb segura o adb.exe aberto, impedindo a troca da pasta.
    # Encerramos só os processos que rodam daqui — um `adb kill-server`
    # derrubaria também o adb de outras instalações (Android Studio etc.).
    Get-Process adb, scrcpy -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith("$Destination\", 'OrdinalIgnoreCase') } |
        Stop-Process -Force
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
}

function Install-Scrcpy {
    Write-Output 'Procurando a versão mais recente do scrcpy...'
    $release = Invoke-RestMethod 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest' `
        -Headers @{ 'User-Agent' = 'androidsEye-installer' }
    $asset = $release.assets | Where-Object name -like 'scrcpy-win64-*.zip' | Select-Object -First 1
    if (-not $asset) { throw "Pacote win64 não encontrado na versão $($release.tag_name)." }

    $zip = Join-Path $env:TEMP $asset.name
    $staging = Join-Path $env:TEMP "androidseye-scrcpy-$([guid]::NewGuid())"
    try {
        Write-Output "Baixando $($asset.name)..."
        Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing

        # O GitHub publica o SHA-256 de cada arquivo; se estiver disponível, conferimos.
        if ($asset.digest -match '^sha256:(?<hash>[0-9a-fA-F]{64})$') {
            if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $Matches.hash) {
                throw 'O arquivo baixado está corrompido (SHA-256 não confere).'
            }
        }

        Expand-Archive $zip $staging -Force
        # O zip traz uma pasta raiz (scrcpy-win64-vX.Y); o conteúdo dela vai para o destino.
        $root = Get-ChildItem $staging -Directory | Select-Object -First 1
        $source = if ($root) { $root.FullName } else { $staging }

        Remove-Current
        New-Item $Destination -ItemType Directory -Force | Out-Null
        Copy-Item (Join-Path $source '*') $Destination -Recurse -Force
    }
    finally {
        Remove-Item $zip, $staging -Recurse -Force -ErrorAction SilentlyContinue
    }

    Set-UserPath -Include $true
    Write-Output "scrcpy $($release.tag_name) instalado em $Destination e adicionado ao PATH."
}

try {
    if ($Uninstall) {
        Remove-Current
        Set-UserPath -Include $false
        Write-Output 'scrcpy removido.'
    }
    else {
        Install-Scrcpy
    }
    exit 0
}
catch {
    Write-Output "Falha: $($_.Exception.Message)"
    exit 1
}
