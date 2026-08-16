; ============================================================
;  NotesCam — Installateur édition LAN (Inno Setup 6)
;
;  Ne pas compiler ce fichier à la main : lancer packaging\build-installer.ps1
;  qui prépare le dossier _stage (node portable + app) puis appelle ISCC.
;
;  Produit : packaging\Output\NotesCam-Setup.exe
; ============================================================

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef StageDir
  #define StageDir "_stage"
#endif

[Setup]
AppId={{8B5F2E14-9C3A-4D7B-9E21-3F7A2C9D5E10}
AppName=NotesCam (LAN)
AppVersion={#AppVersion}
AppPublisher=NotesCam
DefaultDirName={autopf}\NotesCam
DefaultGroupName=NotesCam
DisableProgramGroupPage=yes
UninstallDisplayName=NotesCam (LAN)
OutputDir=Output
OutputBaseFilename=NotesCam-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Service + pare-feu + écriture dans Program Files -> élévation requise
PrivilegesRequired=admin
; node:sqlite et node portable sont 64 bits uniquement
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
; Runtime Node portable (node.exe)
Source: "{#StageDir}\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs createallsubdirs ignoreversion
; Application : serveur + dist (SPA) + node_modules
Source: "{#StageDir}\app\*";  DestDir: "{app}\app";  Flags: recursesubdirs createallsubdirs ignoreversion
; Scripts de service / lanceur
Source: "{#StageDir}\start-server.cmd";     DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\start-hybrid.cmd";     DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\install-service.ps1";  DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\uninstall-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
; Script de mise à jour — utilisé par l'OTA (le serveur lui passe l'installeur signé).
Source: "{#StageDir}\update-notescam.ps1";  DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Raccourci = ouvrir l'app dans le navigateur (c'est une web-app servie en local)
Name: "{group}\NotesCam (LAN)"; Filename: "http://localhost:8080"
Name: "{group}\Désinstaller NotesCam"; Filename: "{uninstallexe}"
Name: "{autodesktop}\NotesCam (LAN)"; Filename: "http://localhost:8080"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Run]
; 1) Enregistre la tâche planifiée (boot, SYSTEM) + règle pare-feu + démarre
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -InstallDir ""{app}"""; \
  StatusMsg: "Configuration du service NotesCam…"; Flags: runhidden waituntilterminated
; 2) Propose d'ouvrir l'app (laisse 3 s au serveur pour démarrer)
Filename: "powershell.exe"; Parameters: "-NoProfile -Command Start-Sleep -Seconds 3"; Flags: runhidden
Filename: "http://localhost:8080"; Description: "Ouvrir NotesCam maintenant"; \
  Flags: postinstall shellexec skipifsilent nowait

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\uninstall-service.ps1"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveNotesCamService"
