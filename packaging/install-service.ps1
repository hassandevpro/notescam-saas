# Enregistre NotesCam LAN comme tâche planifiée démarrant au boot (compte
# SYSTEM, redémarrage auto en cas de crash) + ouvre le pare-feu sur le port.
# Appelé par l'installateur Inno Setup en fin d'installation (élévation admin).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-service.ps1 -InstallDir "C:\Program Files\NotesCam"

param(
  [Parameter(Mandatory = $true)] [string] $InstallDir,
  [int] $Port = 8080
)

$ErrorActionPreference = 'Stop'
$TaskName = 'NotesCam LAN Server'
$cmd = Join-Path $InstallDir 'start-server.cmd'

if (-not (Test-Path $cmd)) { throw "Lanceur introuvable : $cmd" }

# Dossier de données (school data + sauvegardes) hors de Program Files.
New-Item -ItemType Directory -Force 'C:\ProgramData\NotesCam' | Out-Null

# --- Tâche planifiée -------------------------------------------------
$action   = New-ScheduledTaskAction -Execute $cmd
$trigger  = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest  # SYSTEM
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3 `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

# Remplace si déjà présent (réinstallation / mise à jour)
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Description 'Serveur scolaire NotesCam (édition LAN)' | Out-Null
Write-Host "Tache planifiee '$TaskName' enregistree (demarrage au boot)."

# --- Pare-feu (entrant LAN) -----------------------------------------
$ruleName = 'NotesCam LAN'
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
Write-Host "Regle pare-feu '$ruleName' ajoutee (TCP $Port entrant)."

# --- Démarrage immédiat (sans attendre un reboot) -------------------
Start-ScheduledTask -TaskName $TaskName
Write-Host "Serveur demarre. Acces : http://localhost:$Port  (et http://<IP-du-PC>:$Port sur le reseau)."
