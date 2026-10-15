<#
  seed-data.ps1 — pose la base d'établissement embarquée (si elle existe) dans
  le dossier de données, AVANT le premier démarrage du serveur.

  Appelé par l'installateur (Inno Setup, [Run]) juste avant install-service.ps1 :
    powershell -NoProfile -ExecutionPolicy Bypass -File seed-data.ps1 -InstallDir "C:\Program Files\NotesCam"

  RÈGLE ABSOLUE : on ne pose la base QUE si le PC n'en a pas déjà une. Une
  réinstallation, une mise à jour ou une réparation ne doit JAMAIS remplacer les
  données d'une école par celles de l'installeur — ce serait la perte d'une année
  scolaire, en silence, sans que personne n'ait rien demandé.

  Sans dossier `seed\` dans l'installation (installeur vierge, cas normal), ce
  script ne fait rien et le dit.
#>

param(
  [Parameter(Mandatory = $true)] [string] $InstallDir,
  [string] $DataDir = 'C:\ProgramData\NotesCam\data',
  [string] $SeedDir = ''
)

$ErrorActionPreference = 'Stop'
if (-not $SeedDir) { $SeedDir = Join-Path $InstallDir 'seed' }
$seedDb = Join-Path $SeedDir 'notescam.db'

if (-not (Test-Path $seedDb)) {
  Write-Host "[seed] Installeur vierge (aucune base embarquee) - rien a poser."
  exit 0
}

$cibleDb = Join-Path $DataDir 'notescam.db'
if (Test-Path $cibleDb) {
  # Le cas le plus important du script : ce PC a deja une ecole dessus.
  Write-Host "[seed] Une base existe deja sur ce PC - CONSERVEE telle quelle."
  Write-Host "[seed]   $cibleDb"
  Write-Host "[seed] La base embarquee n'est PAS posee (aucune donnee ecrasee)."
  exit 0
}

New-Item -ItemType Directory -Force $DataDir | Out-Null
Copy-Item $seedDb $cibleDb -Force

# Fichiers de l'ecole (logos, cachets, signatures, photos) : sans eux, les
# bulletins et cartes sortent sans en-tete ni cachet.
$seedFiles = Join-Path $SeedDir 'files'
if (Test-Path $seedFiles) {
  $cibleFiles = Join-Path $DataDir 'files'
  New-Item -ItemType Directory -Force $cibleFiles | Out-Null
  Copy-Item (Join-Path $seedFiles '*') $cibleFiles -Recurse -Force
  $n = (Get-ChildItem $cibleFiles -Recurse -File | Measure-Object).Count
  Write-Host "[seed] $n fichier(s) d'etablissement poses."
}

$mo = [math]::Round((Get-Item $cibleDb).Length / 1MB, 1)
Write-Host "[seed] Base d'etablissement posee ($mo Mo) : $cibleDb"
Write-Host "[seed] Connexion avec les identifiants de l'etablissement (inchanges)."
