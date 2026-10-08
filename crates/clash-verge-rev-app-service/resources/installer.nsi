OutFile "ClashVergeRevAppServiceInstaller.exe"

InstallDir "$PROGRAMFILES\ClashVergeRevAppService"

Page directory
Page instfiles

Section "Install"
    SetOutPath $INSTDIR

    ;FILES_PLACEHOLDER

    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ExecShell "" "$INSTDIR\cvr-app-service-install.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\*.exe"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
SectionEnd
