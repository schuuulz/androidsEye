; Hooks do instalador NSIS gerado pelo Tauri (ver tauri.windows.conf.json).
;
; Depois de instalar o app, baixa o scrcpy mais recente — que já traz o adb —
; para $INSTDIR\scrcpy e o coloca no PATH do usuário. Na desinstalação, desfaz.

!define SCRCPY_SCRIPT '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\scripts\install-scrcpy.ps1" -Destination "$INSTDIR\scrcpy"'

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Instalando o scrcpy e o adb..."
  nsExec::ExecToLog '${SCRCPY_SCRIPT}'
  Pop $0
  ${If} $0 != 0
    DetailPrint "O scrcpy não pôde ser instalado agora."
    ${IfNot} ${Silent}
      MessageBox MB_ICONINFORMATION|MB_OK "Não foi possível baixar o scrcpy agora (sem conexão com a internet?).$\r$\n$\r$\nTudo bem: ao abrir, o androidsEye mostra como instalá-lo."
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removendo o scrcpy..."
  nsExec::ExecToLog '${SCRCPY_SCRIPT} -Uninstall'
  Pop $0
!macroend
