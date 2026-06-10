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
  [string] $AppVersion  = ''          # défaut : version de package.json
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
Step "Copie du serveur"
$srcServer = Join-Path $Root 'server'
$dstServer = Join-Path $Stage 'app\server'
robocopy $srcServer $dstServer /E /XD data _test_data node_modules /XF *.log | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a échoué (code $LASTEXITCODE)" }
$global:LASTEXITCODE = 0   # robocopy : 0-7 = succès

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
Copy-Item (Join-Path $Here 'install-service.ps1')   $Stage -Force
Copy-Item (Join-Path $Here 'uninstall-service.ps1') $Stage -Force

# --- 6. Compilation de l'installateur (Inno Setup) -------------------
Step "Compilation de l'installateur (Inno Setup)"
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$iss = Join-Path $Here 'notescam.iss'
if ($iscc) {
  & $iscc "/DAppVersion=$AppVersion" "/DStageDir=$Stage" $iss
  if ($LASTEXITCODE -ne 0) { throw "ISCC a echoue" }
  $exe = Join-Path $Here 'Output\NotesCam-Setup.exe'
  Write-Host "`n[OK] Installateur pret : $exe" -ForegroundColor Green
} else {
  Write-Warning "Inno Setup (ISCC.exe) introuvable. Staging pret dans : $Stage"
  Write-Host "Installe Inno Setup 6 (https://jrsoftware.org/isdl.php) puis lance ISCC sur :"
  Write-Host $iss
}
