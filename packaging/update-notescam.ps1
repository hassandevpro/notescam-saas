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
  [switch] $NoBackup,
  [int]    $IdleMinutes = 5,    # serveur considéré « inactif » si aucune écriture
                                # de données depuis ce délai ET aucun poste connecté.
  [int]    $WaitForIdle = 0,    # minutes à patienter (sondage) que le serveur devienne
                                # inactif avant d'abandonner. 0 = un seul contrôle.
  [switch] $Force              # passe outre le contrôle d'activité (à éviter en plein cours).
)

$ErrorActionPreference = 'Stop'
$TaskName  = 'NotesCam LAN Server'
$InstallDir = Join-Path ${env:ProgramFiles} 'NotesCam'
$DataDir    = 'C:\ProgramData\NotesCam'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "[!]  $m"   -ForegroundColor Yellow }

# --- Détection d'activité (sans toucher au serveur, fonctionne sur l'ancien) -----
# Signal 1 : la base SQLite est en mode WAL → la date de modif de notescam.db-wal
#            reflète la DERNIÈRE écriture (sauvegarde de notes, frais, etc.).
# Signal 2 : connexions TCP ÉTABLIES vers le port depuis un AUTRE poste = clients
#            actuellement connectés.
function Get-LastDataWrite {
  # La base SQLite est sous <DataDir>\data (NOTESCAM_DATA_DIR=...\NotesCam\data).
  $dbDir = Join-Path $DataDir 'data'
  $candidates = @('notescam.db-wal','notescam.db','notescam.db-shm') |
    ForEach-Object { Join-Path $dbDir $_ }
  $times = $candidates | Where-Object { Test-Path $_ } | ForEach-Object { (Get-Item $_).LastWriteTime }
  if ($times) { ($times | Measure-Object -Maximum).Maximum } else { $null }
}
function Get-RemoteClients {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Established -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }
  @($conns | Where-Object { $_.RemoteAddress -notin @('127.0.0.1','::1','0.0.0.0','::') } |
    Select-Object -ExpandProperty RemoteAddress -Unique)
}
function Get-ServerActivity {
  $lastWrite = Get-LastDataWrite
  $clients   = @(Get-RemoteClients)
  $writeAge  = if ($lastWrite) { (New-TimeSpan -Start $lastWrite -End (Get-Date)).TotalMinutes } else { 99999 }
  [PSCustomObject]@{
    Idle        = (($writeAge -ge $IdleMinutes) -and ($clients.Count -eq 0))
    WriteAgeMin = [math]::Round($writeAge, 1)
    Clients     = $clients
    LastWrite   = $lastWrite
  }
}

# --- 0. Élévation administrateur -------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)

if (-not $isAdmin) {
  Warn "Élévation administrateur requise — relance en admin…"
  $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"")
  if ($SetupExe) { $argList += @('-SetupExe', "`"$SetupExe`"") }
  $argList += @('-Port', $Port, '-IdleMinutes', $IdleMinutes, '-WaitForIdle', $WaitForIdle)
  if ($NoBackup) { $argList += '-NoBackup' }
  if ($Force)    { $argList += '-Force' }
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

# --- 1b. Contrôle d'activité (ne JAMAIS interrompre une saisie en cours) ------
# Avant tout arrêt du serveur, on vérifie qu'aucune donnée n'a été écrite
# récemment et qu'aucun poste n'est connecté. Sinon on annule (ou on attend).
Step "Contrôle d'activité du serveur"
if ($Force) {
  Warn "Contrôle d'activité ignoré (-Force) — arrêt immédiat même si des postes saisissent."
} else {
  $deadline = (Get-Date).AddMinutes($WaitForIdle)
  $act = Get-ServerActivity
  while (-not $act.Idle -and (Get-Date) -lt $deadline) {
    Warn ("Serveur ACTIF — écriture il y a {0} min ; {1} poste(s) connecté(s). Attente d'inactivité jusqu'à {2}…" -f `
      $act.WriteAgeMin, $act.Clients.Count, $deadline.ToString('HH:mm:ss'))
    Start-Sleep -Seconds 30
    $act = Get-ServerActivity
  }
  if ($act.Idle) {
    Ok ("Serveur inactif (aucune écriture depuis {0} min, aucun poste connecté) — mise à jour autorisée." -f $act.WriteAgeMin)
  } else {
    Write-Host ''
    Warn 'MISE À JOUR ANNULÉE — le serveur est en cours d''utilisation :'
    Write-Host ("   - derniere ecriture de donnees il y a {0} min (seuil d'inactivite : {1} min)" -f $act.WriteAgeMin, $IdleMinutes) -ForegroundColor Yellow
    if ($act.Clients.Count) { Write-Host ("   - poste(s) connecte(s) : {0}" -f ($act.Clients -join ', ')) -ForegroundColor Yellow }
    Write-Host ''
    Write-Host 'Pour ne pas interrompre une saisie de notes, relance :' -ForegroundColor Cyan
    Write-Host '   - plus tard (hors cours), ou' -ForegroundColor Cyan
    Write-Host '   - en attendant l''inactivite :  -WaitForIdle 30   (patiente jusqu''a 30 min)' -ForegroundColor Cyan
    Write-Host '   - en forcant (deconseille)   :  -Force' -ForegroundColor Cyan
    Write-Host "`nAppuie sur Entree pour fermer…"
    [void](Read-Host)
    return
  }
}

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
