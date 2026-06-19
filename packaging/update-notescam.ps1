<#
  Met à jour NotesCam LAN sur le PC serveur de l'école, en une seule commande.

  Ce que fait le script :
    1. S'auto-élève en administrateur si nécessaire.
    2. Sauvegarde les données (C:\ProgramData\NotesCam).
    3. Arrête le serveur (tâche planifiée + node.exe) pour libérer les fichiers.
    4. Vérifie que le port est libéré.
    5. Lance le nouvel installateur (mise à jour en place, même AppId).
    6. Vérifie que la tâche tourne, que le port écoute et que le serveur répond.

  Les données (C:\ProgramData\NotesCam) ne sont JAMAIS supprimées.

  Usage (PowerShell) :
    powershell -ExecutionPolicy Bypass -File update-notescam.ps1 -SetupExe "C:\Temp\NotesCam-Setup.exe"

  Si -SetupExe est omis, le script cherche un NotesCam-Setup.exe à côté de lui.
#>

param(
  [string] $SetupExe = '',
  [int]    $Port = 8080,
  [switch] $NoBackup
)

$ErrorActionPreference = 'Stop'
$TaskName  = 'NotesCam LAN Server'
$InstallDir = Join-Path ${env:ProgramFiles} 'NotesCam'
$DataDir    = 'C:\ProgramData\NotesCam'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "[!]  $m"   -ForegroundColor Yellow }

# --- 0. Élévation administrateur -------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)

if (-not $isAdmin) {
  Warn "Élévation administrateur requise — relance en admin…"
  $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"")
  if ($SetupExe) { $argList += @('-SetupExe', "`"$SetupExe`"") }
  $argList += @('-Port', $Port)
  if ($NoBackup) { $argList += '-NoBackup' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  return
}

# --- 1. Localiser l'installateur -------------------------------------
Step "Localisation de l'installateur"
if (-not $SetupExe) {
  $SetupExe = Join-Path $PSScriptRoot 'NotesCam-Setup.exe'
  if (-not (Test-Path $SetupExe)) {
    $SetupExe = Join-Path (Join-Path $PSScriptRoot 'Output') 'NotesCam-Setup.exe'
  }
}
if (-not (Test-Path $SetupExe)) {
  throw "Installateur introuvable. Passe le chemin via -SetupExe `"C:\chemin\NotesCam-Setup.exe`""
}
$exeInfo = Get-Item $SetupExe
Write-Host ("Installateur : {0}  ({1:N1} Mo, {2})" -f $exeInfo.FullName, ($exeInfo.Length/1MB), $exeInfo.LastWriteTime)

# --- 2. Sauvegarde des données ---------------------------------------
if (-not $NoBackup) {
  Step "Sauvegarde des données"
  if (Test-Path $DataDir) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "${DataDir}_backup_$stamp"
    Copy-Item $DataDir $backup -Recurse -Force
    Ok "Données sauvegardées -> $backup"
  } else {
    Warn "$DataDir absent (première installation ?) — rien à sauvegarder."
  }
} else {
  Warn "Sauvegarde ignorée (-NoBackup)."
}

# --- 3. Arrêt du serveur (libère les fichiers verrouillés) -----------
Step "Arrêt du serveur"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { }
  Ok "Tâche '$TaskName' stoppée."
} else {
  Warn "Tâche '$TaskName' absente (sera créée par l'installateur)."
}

# Tue tout node.exe issu de l'installation NotesCam (relâche node.exe + index.js)
$killed = 0
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    if ($_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $_.Id -Force; $killed++
    }
  } catch { }
}
if ($killed) { Ok "$killed processus node NotesCam arrêté(s)." }
Start-Sleep -Seconds 2

# --- 4. Vérifier que le port est libéré ------------------------------
Step "Vérification du port $Port"
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Warn "Le port $Port écoute encore. Nouvelle tentative d'arrêt…"
  Start-Sleep -Seconds 3
  $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    throw "Port $Port toujours occupé (PID $($listening.OwningProcess -join ',')). Ferme le processus puis relance."
  }
}
Ok "Port $Port libre."

# --- 5. Installation de la nouvelle version --------------------------
Step "Installation de la nouvelle version"
# /SILENT garde une barre de progression mais aucune question ; les hooks
# [Run] de l'installateur ré-enregistrent la tâche, rouvrent le pare-feu
# et redémarrent le serveur automatiquement.
$proc = Start-Process $SetupExe -ArgumentList '/SILENT','/NORESTART','/SUPPRESSMSGBOXES' -Wait -PassThru
if ($proc.ExitCode -ne 0) {
  throw "L'installateur a renvoyé le code $($proc.ExitCode). Vérifie l'installation."
}
Ok "Installation terminée (exit 0)."

# Laisse au serveur le temps de démarrer (la tâche le lance en fin d'install).
Start-Sleep -Seconds 5

# --- 6. Vérifications post-installation -------------------------------
Step "Vérifications"
$problems = @()

# a) Tâche planifiée
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = $task | Get-ScheduledTaskInfo
  Ok "Tâche présente — dernier résultat : $($info.LastTaskResult) (0 ou 267009 = OK)."
} else {
  $problems += "Tâche planifiée absente."
}

# b) Port en écoute
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Ok "Port $Port en écoute."
} else {
  $problems += "Port $Port n'écoute pas."
}

# c) Réponse HTTP
foreach ($path in @('/', '/api/license')) {
  try {
    $r = Invoke-WebRequest "http://localhost:$Port$path" -UseBasicParsing -TimeoutSec 10
    Ok "GET $path -> HTTP $($r.StatusCode)"
  } catch {
    $problems += "GET $path a échoué : $($_.Exception.Message)"
  }
}

# d) Extrait du journal
$log = Join-Path $DataDir 'server.log'
if (Test-Path $log) {
  Write-Host "`n--- server.log (15 dernières lignes) ---" -ForegroundColor DarkGray
  Get-Content $log -Tail 15
}

# --- Bilan -----------------------------------------------------------
Step "Bilan"
if ($problems.Count -eq 0) {
  Ok "Mise à jour réussie. Accès : http://localhost:$Port  (et http://<IP-du-PC>:$Port sur le réseau)."
  Write-Host "Pense à recharger les postes clients avec Ctrl+Shift+R." -ForegroundColor Cyan
} else {
  Warn "Mise à jour terminée AVEC avertissements :"
  $problems | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
  Write-Host "Consulte $log et l'observateur de tâches si le serveur ne répond pas." -ForegroundColor Yellow
}

Write-Host "`nAppuie sur Entrée pour fermer…"
[void](Read-Host)
