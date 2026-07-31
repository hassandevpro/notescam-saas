<#
  enable-hybrid-maarif.ps1 — RACCOURCI vers le script générique enable-hybrid.ps1,
  pré-rempli avec l'identifiant de MAARIF SCHOOL OF CAMEROON.

  ⚠️ Déprécié en tant que logique propre : toute la mécanique vit désormais dans
  enable-hybrid.ps1 (générique, idempotent, journalisé, préflight). Ce fichier ne
  fait que déléguer, pour ne pas casser les habitudes / raccourcis existants.

  MAARIF a déjà, en base : les rôles fondatrice + coordonnateur_general avec droits
  de décision, et remote_access_allowed posé sur les décideurs. Il n'y a donc rien
  d'autre à injecter — seule la deployment_policy est (re)posée.

  Usage :
    cd packaging
    powershell -ExecutionPolicy Bypass -File enable-hybrid-maarif.ps1
    powershell -ExecutionPolicy Bypass -File enable-hybrid-maarif.ps1 -Revert
#>
param([switch] $Revert, [switch] $Yes)

$Here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Generic = Join-Path $Here 'enable-hybrid.ps1'
$MaarifId = '369fa0e3-318f-4130-94b3-6f14d007ca85'

$fwd = @{ SchoolId = $MaarifId }
if ($Revert) { $fwd['Revert'] = $true }
if ($Yes)    { $fwd['Yes'] = $true }

& $Generic @fwd
