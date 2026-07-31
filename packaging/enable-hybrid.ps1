<#
  enable-hybrid.ps1 — Active le MODE HYBRIDE (finance LAN-authoritative + gouvernance
  distante Cloud) pour N'IMPORTE QUELLE école, par son identifiant. Générique : aucune
  édition de SQL par école, aucun UUID codé en dur, aucun changement de code source.

  Ce que ça fait, côté Cloud (Supabase, via la CLI `supabase` déjà liée) :
    1. (optionnel) injecte les droits de DÉCISION sur un rôle donné (-GrantDecisionRightsToRole),
       sans lesquels l'applicateur LAN rejetterait toute décision (rejected_unauthorized).
    2. active remote_access_allowed sur les décideurs distants :
         - par défaut : tous les comptes portant un rôle qui DÉTIENT un droit de décision ;
         - ou explicitement via -RemoteAccessEmails "a@x.com,b@y.com".
    3. pose deployment_policy = { finance: { execution: lan, governance: cloud } } en
       PRÉSERVANT les autres clés éventuelles (notes, frais…) — activation minimale.
    Ces tables (schools / school_users / governance_roles) sont synchronisées ⇒ la config
    redescend au serveur LAN au prochain drain (mode hybride activé côté LAN).

  Propriétés : IDEMPOTENT (réexécutable sans corruption), CONTRÔLÉ (préflight lecture seule
  + confirmation), JOURNALISÉ (packaging/logs/enable-hybrid-*.log), détecte une école DÉJÀ
  hybride. Ne crée/supprime AUCUNE donnée métier : ne change que la config de déploiement.

  N'exécute AUCUNE migration Supabase. Les 5 migrations H1→H7 et les edge functions
  events-pull/events-push doivent déjà être en place sur l'instance (elles le sont sur la
  prod). Sur une NOUVELLE instance, les appliquer d'abord (voir docs/RECETTE_HYBRID.md).

  Usage :
    cd packaging
    powershell -ExecutionPolicy Bypass -File enable-hybrid.ps1 -SchoolId <UUID>
    # options :
    #   -DryRun                         : préflight seul, aucune écriture
    #   -GrantDecisionRightsToRole fondatrice
    #   -RemoteAccessEmails "a@x.com,b@y.com"
    #   -Yes                            : n'affiche pas la confirmation (scripté)
    #   -Revert                         : retire la clé finance de la policy (retour Cloud)

  Exemple MAARIF (rôles + accès distant déjà prêts en base) :
    powershell -ExecutionPolicy Bypass -File enable-hybrid.ps1 -SchoolId 369fa0e3-318f-4130-94b3-6f14d007ca85
#>
param(
  [Parameter(Mandatory = $true)][string] $SchoolId,
  [string] $GrantDecisionRightsToRole,
  [string] $RemoteAccessEmails,
  [switch] $DryRun,
  [switch] $Revert,
  [switch] $Yes
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root = Split-Path -Parent $Here
$LogDir = Join-Path $Here 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Log = Join-Path $LogDir "enable-hybrid-$stamp.log"

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color; Add-Content -Path $Log -Value $msg -Encoding utf8 }

# --- Validation de l'identifiant (anti-injection : on n'interpole qu'un UUID validé) ---
if ($SchoolId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
  throw "SchoolId invalide (UUID attendu) : $SchoolId"
}
$sid = $SchoolId.ToLower()

# --- La CLI supabase doit être installée et liée ---
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "CLI 'supabase' introuvable. Installez-la et exécutez 'supabase link' depuis le dépôt."
}

# Exécute un fichier SQL via la CLI liée ; renvoie la sortie brute.
# Note PS 5.1 : la CLI supabase écrit « Initialising login role... » sur stderr à
# chaque appel (bénin). On neutralise localement ErrorActionPreference pour que ce
# flux ne soit pas transformé en erreur terminante ; seul $LASTEXITCODE fait foi.
function Invoke-Sql($sql, $label) {
  $tmp = Join-Path $env:TEMP "nc_hybrid_$([guid]::NewGuid().ToString('N')).sql"
  # UTF-8 SANS BOM : PostgreSQL refuse un BOM en tête de requête (« syntax error at
  # or near ﻿SELECT »). Set-Content -Encoding utf8 (PS 5.1) en ajoute un → on écrit
  # via .NET avec un encodage UTF8 explicitement sans BOM.
  [System.IO.File]::WriteAllText($tmp, $sql, (New-Object System.Text.UTF8Encoding($false)))
  try {
    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $out = & supabase db query --linked -f $tmp 2>&1 | Out-String
    $ErrorActionPreference = $eap
    if ($LASTEXITCODE -ne 0) { Say "[ERREUR] $label a échoué :" 'Red'; Say $out 'Red'; throw "$label a échoué." }
    return $out
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

Say "=== enable-hybrid.ps1 — école $sid — $stamp ===" 'Cyan'
Say "Journal : $Log"

# ════════════════════════════════════════════════════════════════════════════
# REVERT : retire la clé finance de la policy (retour en mode Cloud), autres clés
# préservées. Idempotent.
# ════════════════════════════════════════════════════════════════════════════
if ($Revert) {
  Say "Retour en mode CLOUD pour $sid (retrait de la clé finance de deployment_policy)…" 'Yellow'
  $sql = @"
UPDATE schools
SET deployment_policy = NULLIF(COALESCE(deployment_policy, '{}'::jsonb) - 'finance', '{}'::jsonb)
WHERE id = '$sid';
SELECT id, name, deployment_policy FROM schools WHERE id = '$sid';
"@
  $out = Invoke-Sql $sql 'REVERT'
  Say $out 'Green'
  Say "[OK] Clé finance retirée. La finance redevient écrivable côté Cloud." 'Green'
  return
}

# ════════════════════════════════════════════════════════════════════════════
# 1. PRÉFLIGHT (lecture seule) — état courant, détection déjà-hybride.
# ════════════════════════════════════════════════════════════════════════════
Say "`n--- Préflight (lecture seule) ---" 'Cyan'
$pre = @"
SELECT jsonb_pretty(jsonb_build_object(
  'ecole', (SELECT jsonb_build_object('id', id, 'name', name, 'policy', deployment_policy)
            FROM schools WHERE id = '$sid'),
  'deja_hybride', (SELECT deployment_policy #>> '{finance,execution}' = 'lan'
            FROM schools WHERE id = '$sid'),
  'roles_decideurs', (SELECT jsonb_agg(code ORDER BY code) FROM governance_roles
            WHERE school_id = '$sid'
            AND (permissions ? 'expense.approve' OR permissions ? 'budget.approve')),
  'decideurs', (SELECT jsonb_agg(jsonb_build_object('email', au.email, 'role', ugr.role, 'remote', su.remote_access_allowed) ORDER BY ugr.role)
            FROM user_governance_roles ugr
            JOIN school_users su ON su.user_id = ugr.user_id AND su.school_id = ugr.school_id
            LEFT JOIN auth.users au ON au.id = ugr.user_id
            WHERE ugr.school_id = '$sid')
)) AS preflight;
"@
$preOut = Invoke-Sql $pre 'PRÉFLIGHT'
Say $preOut

if ($preOut -notmatch [regex]::Escape($sid)) {
  throw "École $sid introuvable côté Cloud. Vérifiez l'identifiant."
}
if ($preOut -match '"deja_hybride": true') {
  Say "[INFO] Cette école est DÉJÀ en mode hybride (finance=lan). La ré-exécution est sûre (idempotente)." 'Yellow'
}

if ($DryRun) {
  Say "`n[DRY-RUN] Aucune écriture effectuée. Retirez -DryRun pour appliquer." 'Yellow'
  return
}

# --- Confirmation (contrôle) ---
if (-not $Yes) {
  Write-Host ""
  $ans = Read-Host "Activer le mode hybride pour $sid ? (tapez OUI pour confirmer)"
  if ($ans -ne 'OUI') { Say "Annulé par l'utilisateur." 'Yellow'; return }
}

# ════════════════════════════════════════════════════════════════════════════
# 2. APPLICATION (idempotente, journalisée par RAISE NOTICE)
# ════════════════════════════════════════════════════════════════════════════
# Clause remote_access : soit la liste d'emails fournie, soit (défaut) tous les
# comptes portant un rôle qui détient un droit de décision.
if ($RemoteAccessEmails) {
  $emails = ($RemoteAccessEmails -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  foreach ($e in $emails) {
    if ($e -notmatch '^\S+@\S+\.\S+$') { throw "Email invalide : $e" }
  }
  $inList = ($emails | ForEach-Object { "'" + ($_.Replace("'", "''")) + "'" }) -join ', '
  $remoteClause = @"
  UPDATE school_users su SET remote_access_allowed = true
  FROM auth.users au
  WHERE su.school_id = v_sid AND au.id = su.user_id AND au.email IN ($inList);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'remote_access_allowed activé sur % compte(s) (liste explicite).', n;
"@
} else {
  $remoteClause = @"
  UPDATE school_users su SET remote_access_allowed = true
  WHERE su.school_id = v_sid AND su.user_id IN (
    SELECT ugr.user_id FROM user_governance_roles ugr
    JOIN governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role
    WHERE ugr.school_id = v_sid
      AND (gr.permissions ? 'expense.approve' OR gr.permissions ? 'budget.approve'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'remote_access_allowed activé sur % décideur(s) (rôles détenteurs de droits).', n;
"@
}

# Clause (optionnelle) d'injection des droits de décision sur un rôle.
$grantClause = ''
if ($GrantDecisionRightsToRole) {
  if ($GrantDecisionRightsToRole -notmatch '^[a-z_]{2,40}$') { throw "Nom de rôle invalide : $GrantDecisionRightsToRole" }
  $grantClause = @"
  UPDATE governance_roles
  SET permissions = (SELECT jsonb_agg(DISTINCT p ORDER BY p)
    FROM jsonb_array_elements_text(
      permissions || '["expense.approve","expense.reject","budget.approve","budget.annual.revise","budget.reallocate.decide"]'::jsonb) AS p)
  WHERE school_id = v_sid AND code = '$GrantDecisionRightsToRole';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Droits de décision injectés sur le rôle % (% ligne).', '$GrantDecisionRightsToRole', n;
"@
}

$apply = @"
DO `$`$
DECLARE v_sid uuid := '$sid'; v_name text; n int;
BEGIN
  SELECT name INTO v_name FROM schools WHERE id = v_sid;
  IF v_name IS NULL THEN RAISE EXCEPTION 'École introuvable : %', v_sid; END IF;
  RAISE NOTICE 'École : % (%)', v_name, v_sid;

$grantClause
$remoteClause

  UPDATE schools
  SET deployment_policy = COALESCE(deployment_policy, '{}'::jsonb)
    || '{"finance":{"execution":"lan","governance":"cloud"}}'::jsonb
  WHERE id = v_sid;
  RAISE NOTICE 'deployment_policy : finance=lan + gouvernance=cloud (autres clés préservées).';
END `$`$;

-- Post-contrôle
SELECT jsonb_pretty(jsonb_build_object(
  'policy', (SELECT deployment_policy FROM schools WHERE id = '$sid'),
  'decideurs_distants', (SELECT count(*) FROM school_users WHERE school_id = '$sid' AND remote_access_allowed),
  'roles_decideurs', (SELECT jsonb_agg(code ORDER BY code) FROM governance_roles
        WHERE school_id = '$sid' AND (permissions ? 'expense.approve' OR permissions ? 'budget.approve'))
)) AS resultat;
"@

Say "`n--- Application ---" 'Cyan'
$out = Invoke-Sql $apply 'ACTIVATION'
Say $out 'Green'

Say "`n[OK] $sid est configurée HYBRIDE côté Cloud." 'Green'
Say "Étapes côté LAN :" 'Cyan'
Say "  1. Migrer l'école Cloud -> LAN via l'assistant (si pas déjà fait) — crée le jeton scellé."
Say "  2. Activer la synchro hybride : dans l'app (Paramètres -> Mode hybride -> Activer)"
Say "     OU lancer 'C:\Program Files\NotesCam\start-hybrid.cmd' en Administrateur."
Say "  3. La policy redescend au LAN à la 1re synchro ; les intentions distantes sont"
Say "     alors drainées et appliquées par le LAN (finance LAN-authoritative)."
Say "`nRollback : enable-hybrid.ps1 -SchoolId $sid -Revert" 'DarkGray'
