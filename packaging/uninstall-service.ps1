# Retire la tâche planifiée et la règle pare-feu de NotesCam LAN.
# IMPORTANT : NE supprime PAS C:\ProgramData\NotesCam (données de l'école +
# sauvegardes). La désinstallation du logiciel ne doit jamais effacer les notes.

$ErrorActionPreference = 'SilentlyContinue'
$TaskName = 'NotesCam LAN Server'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tache '$TaskName' supprimee."
}

Get-NetFirewallRule -DisplayName 'NotesCam LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host "Regle pare-feu retiree."
Write-Host "Les donnees restent dans C:\ProgramData\NotesCam (non supprimees)."
