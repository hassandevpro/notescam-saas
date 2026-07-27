<#
  Bascule MAARIF en mode HYBRIDE côté Cloud (finance LAN-authoritative + gouvernance
  distante), puis rappelle comment lancer le serveur LAN en mode hybride.

  Ce que ça fait (côté Cloud / Supabase, via la CLI supabase déjà authentifiée) :
    - ré-applique supabase/pilot_activate_maarif.sql :
        deployment_policy = { finance: { execution: lan, governance: cloud } }
        + autorité d'approbation Fondatrice + remote_access_allowed des décideurs.
    La politique redescend ensuite au serveur LAN par la synchro de la table `schools`.

  Prérequis : exécuter depuis le dépôt (la CLI `supabase` doit être installée et liée
  au projet — `supabase link` déjà fait). NE crée/supprime AUCUNE donnée : ne change
  que la configuration de déploiement de MAARIF.

  Usage :
    cd packaging
    powershell -ExecutionPolicy Bypass -File enable-hybrid-maarif.ps1
    # pour revenir au mode Cloud (recette) : -Revert
#>
param([switch] $Revert)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root = Split-Path -Parent $Here

if ($Revert) {
  Write-Host "Retour en mode CLOUD (deployment_policy = NULL) pour MAARIF..." -ForegroundColor Yellow
  $sql = "UPDATE schools SET deployment_policy = NULL WHERE id = '369fa0e3-318f-4130-94b3-6f14d007ca85';"
  $tmp = Join-Path $env:TEMP 'nc_revert_policy.sql'
  Set-Content -Path $tmp -Value $sql -Encoding utf8
  & supabase db query --linked -f $tmp
  Write-Host "[OK] MAARIF repasse en mode Cloud." -ForegroundColor Green
  return
}

Write-Host "Activation du mode HYBRIDE pour MAARIF (finance LAN + gouvernance Cloud)..." -ForegroundColor Cyan
$pilot = Join-Path $Root 'supabase\pilot_activate_maarif.sql'
if (-not (Test-Path $pilot)) { throw "Introuvable : $pilot" }
& supabase db query --linked -f $pilot
if ($LASTEXITCODE -ne 0) { throw "L'application de la politique hybride a echoue." }

Write-Host ""
Write-Host "[OK] MAARIF est en mode HYBRIDE cote Cloud." -ForegroundColor Green
Write-Host "Etapes suivantes cote LAN :" -ForegroundColor Cyan
Write-Host "  1. Migrer MAARIF Cloud -> LAN via l'assistant (si pas deja fait)."
Write-Host "  2. Lancer le serveur en mode hybride :"
Write-Host "       C:\Program Files\NotesCam\start-hybrid.cmd   (en Administrateur)"
Write-Host "  3. La politique redescend au LAN a la 1re synchro ; les intentions"
Write-Host "     budgetaires distantes sont alors drainees et appliquees par le LAN."
