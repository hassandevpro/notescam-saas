<#
  ============================================================================
  purge-notescam.ps1  —  Désinstallation TOTALE de NotesCam (édition LAN)
  ============================================================================

  Contrairement au désinstalleur normal (uninstall-service.ps1, qui PRÉSERVE
  volontairement C:\ProgramData\NotesCam pour ne jamais effacer les notes), ce
  script EFFACE TOUT : programme + service + pare-feu + TOUTES LES DONNÉES
  (base SQLite, jeton d'école, clés, sauvegardes, fichiers, logs).

  Résultat : la machine revient à un état vierge. Après une réinstallation,
  l'ancien compte / l'ancienne école N'EXISTENT PLUS.

  >>> OPÉRATION IRRÉVERSIBLE. À réserver aux machines de démo / test / recette,
      ou à un PC que l'on veut réinitialiser volontairement. <<<

  USAGE (PowerShell en ADMINISTRATEUR) :
    powershell -NoProfile -ExecutionPolicy Bypass -File purge-notescam.ps1

    # sans confirmation interactive (scripts / images de déploiement) :
    ... -File purge-notescam.ps1 -Force

    # sauvegarder la base avant d'effacer (copie .db sur le Bureau) :
    ... -File purge-notescam.ps1 -BackupTo "$env:USERPROFILE\Desktop"
  ============================================================================
#>

param(
  [switch] $Force,              # ne demande pas de confirmation
  [string] $BackupTo = '',      # dossier où copier notescam.db avant purge (optionnel)
  [int]    $Port = 8080
)

$ErrorActionPreference = 'Stop'

$TaskName    = 'NotesCam LAN Server'
$FwRule      = 'NotesCam LAN'
$DataDir     = 'C:\ProgramData\NotesCam'
$InstallDir  = Join-Path ${env:ProgramFiles} 'NotesCam'   # {autopf} en install admin x64
$AppId       = '{8B5F2E14-9C3A-4D7B-9E21-3F7A2C9D5E10}'   # cf. notescam.iss

function Info($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }

# --- 0. Élévation ----------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  throw "Ce script doit être lancé en tant qu'ADMINISTRATEUR (clic droit PowerShell > Exécuter en tant qu'administrateur)."
}

# --- 1. Confirmation --------------------------------------------------------
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Red
Write-Host "   PURGE TOTALE DE NOTESCAM SUR CETTE MACHINE" -ForegroundColor Red
Write-Host "  ============================================================" -ForegroundColor Red
Write-Host "   Seront DÉFINITIVEMENT supprimés :" -ForegroundColor Red
Write-Host "     - le programme         : $InstallDir"
Write-Host "     - la tâche planifiée   : $TaskName"
Write-Host "     - la règle pare-feu    : $FwRule (TCP $Port)"
Write-Host "     - TOUTES LES DONNÉES   : $DataDir" -ForegroundColor Red
Write-Host "       (base notescam.db, jeton d'école, clés, sauvegardes, fichiers, logs)"
Write-Host ""

if (-not $Force) {
  $answer = Read-Host "   Tapez exactement  SUPPRIMER  pour confirmer (autre = annuler)"
  if ($answer -ne 'SUPPRIMER') {
    Warn "Annulé. Aucune modification effectuée."
    return
  }
}

# --- 2. Sauvegarde optionnelle de la base ----------------------------------
if ($BackupTo) {
  $srcDb = Join-Path $DataDir 'data\notescam.db'
  if (Test-Path $srcDb) {
    New-Item -ItemType Directory -Force $BackupTo | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dest  = Join-Path $BackupTo "notescam-purge-$stamp.db"
    Copy-Item $srcDb $dest -Force
    Ok "Base sauvegardée avant purge : $dest"
  } else {
    Warn "Aucune base à sauvegarder ($srcDb introuvable)."
  }
}

# --- 3. Arrêt de la tâche planifiée + processus serveur --------------------
Info "`n[1/6] Arrêt du service et des processus serveur…"
try {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Ok "Tâche planifiée '$TaskName' supprimée."
  } else { Warn "Tâche planifiée absente (déjà retirée)." }
} catch { Warn "Tâche : $($_.Exception.Message)" }

# Tue les node.exe qui exécutent le serveur NotesCam (server\index.js) ou dont
# l'exe est dans le dossier d'installation. On ne touche pas aux autres node.
try {
  $killed = 0
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.CommandLine -and ($_.CommandLine -match 'NotesCam' -or $_.CommandLine -match 'server[\\/]index\.js')) -or
      ($_.ExecutablePath -and $_.ExecutablePath -like (Join-Path $InstallDir '*'))
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $killed++
    }
  if ($killed) { Ok "$killed processus serveur (node.exe) arrêté(s)." }
  else { Warn "Aucun processus serveur en cours." }
} catch { Warn "Processus : $($_.Exception.Message)" }

# --- 4. Règle pare-feu ------------------------------------------------------
Info "`n[2/6] Retrait de la règle pare-feu…"
try {
  $r = Get-NetFirewallRule -DisplayName $FwRule -ErrorAction SilentlyContinue
  if ($r) { $r | Remove-NetFirewallRule -ErrorAction SilentlyContinue; Ok "Règle '$FwRule' retirée." }
  else { Warn "Règle pare-feu absente." }
} catch { Warn "Pare-feu : $($_.Exception.Message)" }

# --- 5. Désinstallation du programme ---------------------------------------
Info "`n[3/6] Désinstallation du programme…"
# On cherche la clé de désinstallation Inno Setup ({AppId}_is1) dans les 3 vues
# de registre (64 bits, WOW6432Node, HKCU au cas où) et on lance son
# UninstallString en mode très silencieux.
$uninstRoots = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)
$uninstalled = $false
foreach ($root in $uninstRoots) {
  $key = Join-Path $root ($AppId + '_is1')
  if (Test-Path $key) {
    $us = (Get-ItemProperty $key -ErrorAction SilentlyContinue).UninstallString
    if ($us) {
      # UninstallString ressemble à : "C:\...\unins000.exe"
      $exe = $us.Trim('"')
      if (Test-Path $exe) {
        try {
          & $exe '/VERYSILENT' '/SUPPRESSMSGBOXES' '/NORESTART' | Out-Null
          # unins*.exe se relance en tâche de fond puis se supprime : on attend.
          $name = [IO.Path]::GetFileNameWithoutExtension($exe)
          $tries = 0
          while ((Get-Process -Name $name -ErrorAction SilentlyContinue) -and $tries -lt 60) {
            Start-Sleep -Milliseconds 500; $tries++
          }
          Ok "Programme désinstallé via $exe"
          $uninstalled = $true
        } catch { Warn "Désinstalleur : $($_.Exception.Message)" }
      }
    }
    Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue
  }
}
if (-not $uninstalled) { Warn "Aucun désinstalleur enregistré trouvé (install manuelle ou déjà retirée)." }

# --- 6. Suppression du dossier programme (résidus) --------------------------
Info "`n[4/6] Suppression du dossier programme…"
if (Test-Path $InstallDir) {
  try {
    Remove-Item -Recurse -Force $InstallDir -ErrorAction Stop
    Ok "Supprimé : $InstallDir"
  } catch {
    Warn "Dossier programme verrouillé : $($_.Exception.Message)"
    Warn "Redémarre puis relance ce script si le dossier persiste."
  }
} else { Warn "Dossier programme déjà absent." }

# --- 7. SUPPRESSION DES DONNÉES (= efface le compte / l'école) -------------
Info "`n[5/6] Suppression des DONNÉES (base, jeton d'école, clés, sauvegardes)…"
if (Test-Path $DataDir) {
  try {
    Remove-Item -Recurse -Force $DataDir -ErrorAction Stop
    Ok "Supprimé : $DataDir   -> l'ancien compte n'existe plus."
  } catch {
    Warn "Données verrouillées : $($_.Exception.Message)"
    Warn "Un processus tient encore la base. Ferme-le (ou redémarre) et relance."
  }
} else { Warn "Dossier de données déjà absent." }

# --- 8. Raccourcis + résidus ------------------------------------------------
Info "`n[6/6] Nettoyage des raccourcis…"
$shortcuts = @(
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\NotesCam'),
  (Join-Path $env:PUBLIC 'Desktop\NotesCam (LAN).url'),
  (Join-Path $env:USERPROFILE 'Desktop\NotesCam (LAN).url')
)
foreach ($s in $shortcuts) {
  if (Test-Path $s) { Remove-Item -Recurse -Force $s -ErrorAction SilentlyContinue; Ok "Raccourci retiré : $s" }
}

# --- Terminé ----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   PURGE TERMINÉE — la machine est vierge de NotesCam." -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  NOTE navigateur : l'app LAN est une web-app (http://localhost:$Port)."
Write-Host "  Une session/cache peut rester dans le navigateur. Pour repartir 100% propre :"
Write-Host "     - vide le cache du site localhost:$Port, OU ouvre-le en navigation privée"
Write-Host "       après réinstallation."
Write-Host ""
