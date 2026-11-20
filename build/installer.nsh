; Better AV Client: la carpeta de instalación es siempre «Better AV Client».
; electron-builder reutiliza la ruta de una instalación anterior (que se llamaba «NotXunta Client»)
; porque se conserva el appId; aquí se sobrescribe esa ruta guardada antes de mostrar el instalador.
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Better AV Client"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Better AV Client"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Better AV Client"
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Better AV Client"
!macroend
