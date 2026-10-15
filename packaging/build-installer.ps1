<#
  Assemble l'installateur NotesCam LAN (.exe).

  Étapes :
    1. Télécharge Node portable (win-x64) depuis nodejs.org
    2. Compile la SPA en édition LAN  (npm run build:lan)
    3. Prépare _stage\ (node + app + scripts)
    4. Installe les dépendances runtime du serveur (fastify, @fastify/static)
    5. Compile l'installateur avec Inno Setup (ISCC) -> Output\NotesCam-Setup.exe

  Prérequis sur la machine de build :
    - Node + npm (pour build:lan et l'install des deps serveur)
    - Inno Setup 6  (https://jrsoftware.org/isdl.php)  pour produire le .exe
    - Accès internet (nodejs.org)

  Usage :
    cd packaging
    powershell -ExecutionPolicy Bypass -File build-installer.ps1
    # version Node précise :  -NodeVersion v24.16.0
#>

param(
  [string] $NodeVersion = 'latest',   # 'latest' = dernière v24 de nodejs.org
  [string] $AppVersion  = '',         # défaut : version de package.json
  # Installeur CHARGÉ DES DONNÉES d'un établissement : dossier de données LAN à
  # embarquer (celui qui contient notescam.db + files\). L'école installe et se
  # connecte avec SES identifiants, sans Internet. Voir packaging/stage-seed.mjs.
  [string] $SeedData    = '',
  # Suffixe du nom de l'installeur produit (obligatoire avec -SeedData) : un
  # installeur chargé de données ne doit JAMAIS porter le même nom qu'un
  # installeur vierge — on ne distribue pas les données d'une école par erreur.
  [string] $SeedLabel   = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Here  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root  = Split-Path -Parent $Here
$Stage = Join-Path $Here '_stage'
$Cache = Join-Path $Here '_cache'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

if (-not $AppVersion) {
  $AppVersion = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
}

# --- 0. Nettoyage stage ----------------------------------------------
Step "Préparation du dossier de staging"
if (Test-Path $Stage) {
  try {
    Remove-Item -Recurse -Force $Stage -ErrorAction Stop
  } catch {
    # Un ancien _stage parfois verrouillé (handle résiduel / antivirus).
    # On bascule sur un dossier neuf horodaté plutôt que d'échouer.
    Write-Warning "Impossible de nettoyer $Stage (verrouillé). Bascule sur un dossier neuf."
    $Stage = Join-Path $Here ('_stage_' + (Get-Date -Format 'yyyyMMddHHmmss'))
  }
}
New-Item -ItemType Directory -Force "$Stage\node", "$Stage\app", $Cache | Out-Null

# --- 1. Node portable -------------------------------------------------
Step "Récupération de Node portable ($NodeVersion)"
if ($NodeVersion -eq 'latest') {
  $idx = Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json'
  $NodeVersion = ($idx | Where-Object { $_.version -like 'v24.*' } | Select-Object -First 1).version
  Write-Host "Dernière v24 : $NodeVersion"
}
$zipName = "node-$NodeVersion-win-x64.zip"
$zipPath = Join-Path $Cache $zipName
$nodeUrl = "https://nodejs.org/dist/$NodeVersion/$zipName"
if (-not (Test-Path $zipPath)) {
  Write-Host "Téléchargement $nodeUrl"
  Invoke-WebRequest -UseBasicParsing -Uri $nodeUrl -OutFile $zipPath
}
$extract = Join-Path $Cache "node-$NodeVersion-win-x64"
if (-not (Test-Path $extract)) { Expand-Archive -Path $zipPath -DestinationPath $Cache -Force }
Copy-Item (Join-Path $extract 'node.exe') (Join-Path $Stage 'node\node.exe') -Force
Write-Host "node.exe prêt ($([math]::Round((Get-Item "$Stage\node\node.exe").Length/1MB,1)) Mo)"

# --- 2. Build SPA édition LAN ----------------------------------------
Step "Compilation de la SPA (édition LAN)"
Push-Location $Root
try {
  & npm run build:lan
  if ($LASTEXITCODE -ne 0) { throw "npm run build:lan a échoué" }
} finally { Pop-Location }
Copy-Item (Join-Path $Root 'dist') (Join-Path $Stage 'app\dist') -Recurse -Force

# --- 3. Copie du serveur (sans données ni node_modules) --------------
#
# CE QUE LES EXCLUSIONS FERMENT, mesuré sur le .exe du 2026-10-09 : l'installeur
# embarquait 16 fichiers de données et de secrets, parce que seuls `data` et
# `_test_data` étaient écartés —
#   server\data-demo\       la base de démonstration « COLLÈGE LA RETRAITE »
#                           (232 élèves, 10 054 notes, 738 paiements, 16 comptes)
#                           AVEC jwt-secret.key, mirror.key, server-token.key ;
#   server\GENIUS-sauvegarde-*.db  une base nommée d'après une école cliente.
# Rien de tout cela n'est lu à l'exécution — le serveur travaille dans
# NOTESCAM_DATA_DIR (C:\ProgramData\NotesCam\data) et génère ses propres clés à
# la première ouverture. C'était donc du poids mort… déposé sur le disque de
# CHAQUE école, clés de signature comprises.
#
# On exclut par NATURE de fichier (*.db, *.key, *.pem) et pas seulement par
# dossier : la prochaine base de travail posée dans server\ sera écartée d'office,
# sans que personne ait à y penser. `license-pubkey.txt` n'est pas touché (c'est
# un .txt), et aucun fichier nécessaire au serveur ne porte ces extensions.
Step "Copie du serveur"
$srcServer = Join-Path $Root 'server'
$dstServer = Join-Path $Stage 'app\server'
robocopy $srcServer $dstServer /E `
  /XD data data-demo _test_data node_modules `
  /XF *.log *.db *.db-wal *.db-shm *.db-journal *.key *.pem | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a échoué (code $LASTEXITCODE)" }
$global:LASTEXITCODE = 0   # robocopy : 0-7 = succès

# Moteurs PURS partagés importés par le serveur (enforcement budgétaire + gouvernance
# hybride H1-H7) : budgetGuard.js -> ../src/lib/* et ../src/governance/* ;
# governanceApply.js -> ../src/domains/finance/events.js. Source unique = src/
# (aucune duplication de logique). On embarque ces dossiers en préservant le chemin
# relatif `app/src/...` attendu par les imports du serveur.
foreach ($sub in @('lib', 'governance', 'domains')) {
  robocopy (Join-Path $Root "src\$sub") (Join-Path $Stage "app\src\$sub") /E /XF *.log | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy src\$sub a échoué (code $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

# --- 3 bis. Identité de l'application (nom + version) ----------------
# `appVersion()` (server/syncAudit.js) lit la version dans `app\package.json`.
# Ce fichier n'était copié nulle part : tout serveur installé annonçait la version
# « ? » dans /api/version, dans le journal d'audit de synchro et dans la comparaison
# de mise à jour. Seul le nom de l'installeur portait le numéro, et il ne survit pas
# à l'installation. Miroir exact de la même étape dans packaging/linux/build-package.sh.
#
# On n'écrit QUE l'identité, pas le package.json de la racine : les dépendances du
# front (react, vite…) n'ont rien à faire sur un serveur d'école.
Step "Identité de l'application (nom + version)"
@"
{
  "name": "notescam-app",
  "private": true,
  "version": "$AppVersion",
  "type": "module"
}
"@ | ForEach-Object {
  # Set-Content -Encoding utf8 (PowerShell 5.1) prefixe le fichier d'un BOM UTF-8, et
  # `JSON.parse` le refuse : appVersion() (server/syncAudit.js) retombait alors sur
  # « ? », et /api/version, le journal d'audit de synchro et la comparaison de mise
  # à jour annoncaient « ? » au lieu du numero embarque. On ecrit donc SANS BOM,
  # comme le heredoc equivalent de packaging/linux/build-package.sh.
  [IO.File]::WriteAllText((Join-Path $Stage 'app\package.json'), $_, (New-Object Text.UTF8Encoding $false))
}
Write-Host "  version embarquée : $AppVersion"

# --- 4. Dépendances runtime du serveur -------------------------------
Step "Installation des dépendances serveur (fastify, @fastify/static)"
Push-Location $dstServer
try {
  & npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install (serveur) a échoué" }
} finally { Pop-Location }

# --- 5. Scripts de service -------------------------------------------
Step "Copie des scripts de service"
Copy-Item (Join-Path $Here 'start-server.cmd')      $Stage -Force
Copy-Item (Join-Path $Here 'start-hybrid.cmd')      $Stage -Force
Copy-Item (Join-Path $Here 'install-service.ps1')   $Stage -Force
Copy-Item (Join-Path $Here 'uninstall-service.ps1') $Stage -Force
# Embarqué pour la MISE À JOUR AUTOMATIQUE : le serveur télécharge l'installeur
# signé puis passe la main à ce script (sauvegarde, arrêt, installation, relance).
# Sans lui dans l'installation, l'OTA retombe sur la mise à jour manuelle.
Copy-Item (Join-Path $Here 'update-notescam.ps1')   $Stage -Force
# Secours « mot de passe oublié » : en LAN il n'y a ni e-mail ni lien de
# réinitialisation, et l'écran qui redéfinit un mot de passe exige d'être DÉJÀ
# connecté. Sans cet outil sur le PC, une école qui oublie son mot de passe
# d'administration perd l'accès à toute l'administration — et personne ne peut
# l'aider à distance. L'outil lui-même (server/reset-password-cli.mjs) est déjà
# embarqué avec le reste de server\ à l'étape 3.
Copy-Item (Join-Path $Here 'reinitialiser-mot-de-passe.cmd') $Stage -Force
# Pose la base d'établissement embarquée au premier démarrage. Toujours embarqué,
# même sans -SeedData : sans dossier seed\ il ne fait rien, et l'installeur
# vierge reste strictement identique dans son comportement.
Copy-Item (Join-Path $Here 'seed-data.ps1')          $Stage -Force

# --- 5 bis. Base d'établissement embarquée (option) ------------------
$SeedArgs = @()
if ($SeedData) {
  Step "Base d'établissement à embarquer"
  if (-not (Test-Path (Join-Path $SeedData 'notescam.db'))) {
    throw "-SeedData : aucune base ici -> " + (Join-Path $SeedData 'notescam.db')
  }
  if (-not $SeedLabel) {
    throw "-SeedData exige -SeedLabel (ex. -SeedLabel bright-continent) : un installeur charge de donnees ne doit pas porter le nom d'un installeur vierge."
  }
  # Prepare le dossier _stage/seed : repli du WAL, purge de l etat du poste de build,
  # AUCUN secret embarqué, et rapport affiché de ce qui part dans l'installeur.
  & node (Join-Path $Here 'stage-seed.mjs') $SeedData (Join-Path $Stage 'seed')
  if ($LASTEXITCODE -ne 0) { throw "stage-seed.mjs a echoue" }
  $SeedArgs = @("/DSeedLabel=$SeedLabel")
}

# --- 5 bis. CONTRÔLE : aucune donnée d'école dans le payload ---------
# Les exclusions de l'étape 3 sont la ceinture ; ceci est les bretelles. Un
# installeur part chez des dizaines d'écoles : mieux vaut un build qui échoue
# qu'un .exe qui distribue la base ou les clés de quelqu'un d'autre.
#
# `node_modules` est hors périmètre : des paquets npm embarquent légitimement des
# certificats de test, et ce n'est pas notre payload.
Step "Contrôle du payload (aucune donnée, aucune clé)"
$suspects = Get-ChildItem (Join-Path $Stage 'app') -Recurse -File `
              -Include '*.db','*.db-wal','*.db-shm','*.db-journal','*.key','*.pem' `
              -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\node_modules\\' }
if ($suspects) {
  $suspects | ForEach-Object { Write-Host "   $($_.FullName)" -ForegroundColor Red }
  throw "$($suspects.Count) fichier(s) de donnees/secrets dans le payload. Build interrompu : rien ne sort."
}
# NOTE : ce fichier est en UTF-8 SANS BOM, et PowerShell 5.1 le lit alors en
# ANSI (c'est pourquoi la console affiche « PrÃ©paration »). Les accents passent,
# mais PAS un tiret cadratin : U+2014 se decode en « â€” », dont le dernier
# caractere U+201D est accepte par PowerShell comme un GUILLEMET OUVRANT. Une
# seule occurrence dans du code casse l'analyse du reste du fichier, avec une
# erreur signalee 20 lignes plus loin. D'ou l'ASCII strict dans cette ligne.
Write-Host "  OK - le payload ne porte que du code." -ForegroundColor Green

# --- 6. Compilation de l'installateur (Inno Setup) -------------------
Step "Compilation de l'installateur (Inno Setup)"
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$iss = Join-Path $Here 'notescam.iss'
if ($iscc) {
  & $iscc "/DAppVersion=$AppVersion" "/DStageDir=$Stage" @SeedArgs $iss
  if ($LASTEXITCODE -ne 0) { throw "ISCC a echoue" }
  $base = if ($SeedLabel) { "NotesCam-Setup-$SeedLabel" } else { 'NotesCam-Setup' }
  $exe = Join-Path $Here "Output\$base.exe"
  Write-Host "`n[OK] Installateur pret : $exe" -ForegroundColor Green
} else {
  Write-Warning "Inno Setup (ISCC.exe) introuvable. Staging pret dans : $Stage"
  Write-Host "Installe Inno Setup 6 (https://jrsoftware.org/isdl.php) puis lance ISCC sur :"
  Write-Host $iss
}
