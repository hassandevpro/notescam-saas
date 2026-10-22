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
#ifdef SeedLabel
OutputBaseFilename=NotesCam-Setup-{#SeedLabel}
#else
OutputBaseFilename=NotesCam-Setup
#endif
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
; Secours hors ligne : réinitialiser un mot de passe oublié (aucun e-mail en LAN).
Source: "{#StageDir}\reinitialiser-mot-de-passe.cmd"; DestDir: "{app}"; Flags: ignoreversion
; Contrôle de la mise à jour : dit si CE poste a vraiment reçu les correctifs,
; en lisant la base. Lecture seule, sans élévation.
Source: "{#StageDir}\verifier-correctifs.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\verifier-correctifs.mjs"; DestDir: "{app}"; Flags: ignoreversion
; Élèves en double : lit la base et nomme la cause. Lecture seule.
Source: "{#StageDir}\diagnostic-doublons.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\diagnostic-doublons.mjs"; DestDir: "{app}"; Flags: ignoreversion
; Applique une mise à jour déjà installée : arrêt, sauvegarde VÉRIFIÉE,
; redémarrage, contrôle. Sans ce geste, le serveur continue sur l'ancien code
; et les tables neuves ne sont jamais posées.
Source: "{#StageDir}\REDEMARRER-APRES-MAJ.cmd";      DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\sauvegarder-et-redemarrer.mjs"; DestDir: "{app}"; Flags: ignoreversion
; Pose la base embarquée au 1er démarrage — JAMAIS par-dessus une base existante.
Source: "{#StageDir}\seed-data.ps1";        DestDir: "{app}"; Flags: ignoreversion
#ifdef SeedLabel
; Base d'établissement embarquée (installeur « {#SeedLabel} ») + ses fichiers.
Source: "{#StageDir}\seed\*"; DestDir: "{app}\seed"; Flags: recursesubdirs createallsubdirs ignoreversion
#endif

[Icons]
; Raccourci = ouvrir l'app dans le navigateur (c'est une web-app servie en local)
Name: "{group}\NotesCam (LAN)"; Filename: "http://localhost:8080"
Name: "{group}\Réinitialiser un mot de passe"; Filename: "{app}\reinitialiser-mot-de-passe.cmd"; IconFilename: "{sys}\shell32.dll"; IconIndex: 48
Name: "{group}\Vérifier la mise à jour"; Filename: "{app}\verifier-correctifs.cmd"; IconFilename: "{sys}\shell32.dll"; IconIndex: 23
Name: "{group}\Appliquer la mise à jour (redémarrer)"; Filename: "{app}\REDEMARRER-APRES-MAJ.cmd"; IconFilename: "{sys}\shell32.dll"; IconIndex: 238
Name: "{group}\Élèves en double — diagnostic"; Filename: "{app}\diagnostic-doublons.cmd"; IconFilename: "{sys}\shell32.dll"; IconIndex: 22
Name: "{group}\Désinstaller NotesCam"; Filename: "{uninstallexe}"
Name: "{autodesktop}\NotesCam (LAN)"; Filename: "http://localhost:8080"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Run]
; 0) Pose la base d'établissement embarquée, SI ce PC n'en a pas déjà une.
;    Sans données embarquées, le script ne fait rien. Doit passer AVANT le
;    démarrage du serveur : au 1er lancement il créerait une base vide.
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\seed-data.ps1"" -InstallDir ""{app}"""; \
  StatusMsg: "Installation des données de l'établissement…"; Flags: runhidden waituntilterminated
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
