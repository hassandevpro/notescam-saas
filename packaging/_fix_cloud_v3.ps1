# Correctif activation Cloud v3 — resout « 0% — migration en cours… ».
#
# Applique au serveur PACKAGE installe (server\activateCloud.js) DEUX correctifs,
# chacun idempotent et independant :
#   Fix A  schoolPayload : retire les cles nulles avant l'upsert ecole. Sans lui,
#          ge_grade_max=null court-circuite le DEFAULT NOT NULL cote Postgres et
#          provision-tenant rejette l'ecole (blocage a l'etape « Tenant »).
#   Fix B  timeouts reseau : withTimeout(30 s) sur auth Supabase + AbortController
#          sur le fetch provision-tenant. Sans lui, un appel qui pend fige la
#          requete /run et l'assistant reste a 0% sans erreur.
#
# A LANCER EN ADMINISTRATEUR (ecriture dans C:\Program Files) :
#   powershell -ExecutionPolicy Bypass -File "<chemin>\_fix_cloud_v3.ps1"

$ErrorActionPreference = 'Stop'
$Log      = 'C:\ProgramData\NotesCam\_patch.log'
$TaskName = 'NotesCam LAN Server'
$File     = 'C:\Program Files\NotesCam\app\server\activateCloud.js'
function W($m){ $t=(Get-Date).ToString('s'); Add-Content -Path $Log -Value "$t  $m"; Write-Host $m }

try {
  New-Item -ItemType Directory -Force 'C:\ProgramData\NotesCam' | Out-Null
  Add-Content -Path $Log -Value "== Correctif Cloud v3 (schoolPayload + timeouts) =="
  if (-not (Test-Path $File)) { throw "Introuvable : $File" }

  # 1) Arret du serveur (tache planifiee + tout node qui ecoute sur 8080).
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    W "Tache '$TaskName' stoppee."
  }
  $conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force; W "Process $($c.OwningProcess) (port 8080) arrete." } catch { W "Echec arret $($c.OwningProcess): $_" }
  }
  Start-Sleep -Seconds 2

  # 2) Patch idempotent. Lecture UTF-8, fins de ligne normalisees en LF pour que
  #    les remplacements multi-lignes correspondent a coup sur.
  $c = [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8)
  $before = $c.Replace("`r`n", "`n")
  $c = $before

  # --- Fix A : schoolPayload (retrait des cles nulles avant l'upsert ecole) ---
  if ($c -match 'schoolPayload') {
    W "Fix A (schoolPayload) deja present."
  } else {
    $anchorProv = '  const provision = await provisionTenant(url, accessToken, {'
    if ($c.IndexOf($anchorProv) -lt 0) { throw "Fix A : ancre provisionTenant introuvable." }
    if ($c.IndexOf('    school,') -lt 0) { throw "Fix A : ligne 'school,' introuvable." }
    $insA = @(
      '  const schoolPayload = Object.fromEntries(',
      '    Object.entries(school).filter(([, v]) => v !== null && v !== undefined),',
      '  );',
      '  const provision = await provisionTenant(url, accessToken, {'
    ) -join "`n"
    $c = $c.Replace($anchorProv, $insA)
    $c = $c.Replace('    school,', '    school: schoolPayload,')
    W "Fix A applique (schoolPayload)."
  }

  # --- Fix B : timeouts reseau ------------------------------------------------
  if ($c -match 'withTimeout') {
    W "Fix B (timeouts) deja present."
  } else {
    # B1) Helper withTimeout, insere juste apres 'const CHUNK = 500;'.
    $anchorChunk = 'const CHUNK = 500;'
    if ($c.IndexOf($anchorChunk) -lt 0) { throw "Fix B : ancre 'const CHUNK = 500;' introuvable." }
    $helper = @(
      'const CHUNK = 500;',
      '',
      '// Garde-fou reseau : aucun appel distant ne doit pouvoir bloquer indefiniment',
      '// (sinon l''assistant reste fige a 0%). Un depassement remonte une erreur claire.',
      'const NET_TIMEOUT_MS = 30000;',
      'function withTimeout(promise, label, ms = NET_TIMEOUT_MS) {',
      '  let timer;',
      '  const guard = new Promise((_, rej) => {',
      '    timer = setTimeout(() => rej(new Error(label + '' : delai depasse (reseau ?).'')), ms);',
      '  });',
      '  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));',
      '}'
    ) -join "`n"
    $c = $c.Replace($anchorChunk, $helper)

    # B2) Wrap signUp.
    $oSignup = 'await supa.auth.signUp({ email, password });'
    if ($c.IndexOf($oSignup) -lt 0) { throw "Fix B : ancre signUp introuvable." }
    $c = $c.Replace($oSignup, 'await withTimeout(supa.auth.signUp({ email, password }), ''Creation du compte cloud'');')

    # B3) Wrap signInWithPassword de verifyCloud (client 'supa').
    $oVerify = 'await supa.auth.signInWithPassword({ email, password });'
    if ($c.IndexOf($oVerify) -lt 0) { throw "Fix B : ancre signInWithPassword (verify) introuvable." }
    $c = $c.Replace($oVerify, 'await withTimeout(supa.auth.signInWithPassword({ email, password }), ''Connexion cloud'');')

    # B4) Wrap signInWithPassword de runCloudActivation (client 'authClient').
    $oRun = 'await authClient.auth.signInWithPassword({ email, password });'
    if ($c.IndexOf($oRun) -lt 0) { throw "Fix B : ancre signInWithPassword (run) introuvable." }
    $c = $c.Replace($oRun, 'await withTimeout(authClient.auth.signInWithPassword({ email, password }), ''Connexion cloud'');')

    # B5) Borne le fetch provision-tenant avec un AbortController (abandon reel).
    $oFetch = @(
      '  const res = await fetch(`${url}/functions/v1/provision-tenant`, {',
      '    method: ''POST'',',
      '    headers: { Authorization: `Bearer ${accessToken}`, ''Content-Type'': ''application/json'' },',
      '    body: JSON.stringify(payload),',
      '  });'
    ) -join "`n"
    if ($c.IndexOf($oFetch) -lt 0) { throw "Fix B : bloc fetch provision-tenant introuvable." }
    $nFetch = @(
      '  const ctrl = new AbortController();',
      '  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);',
      '  let res;',
      '  try {',
      '    res = await fetch(`${url}/functions/v1/provision-tenant`, {',
      '      method: ''POST'',',
      '      headers: { Authorization: `Bearer ${accessToken}`, ''Content-Type'': ''application/json'' },',
      '      body: JSON.stringify(payload),',
      '      signal: ctrl.signal,',
      '    });',
      '  } catch (e) {',
      '    throw new Error(''Provision tenant : '' + (e && e.name === ''AbortError'' ? ''delai depasse (reseau ?)'' : ((e && e.message) || ''echec reseau'')));',
      '  } finally {',
      '    clearTimeout(timer);',
      '  }'
    ) -join "`n"
    $c = $c.Replace($oFetch, $nFetch)
    W "Fix B applique (timeouts)."
  }

  # 3) Ecriture si modifie + verification syntaxe.
  if ($c -ne $before) {
    Copy-Item $File "$File.bak" -Force
    [System.IO.File]::WriteAllText($File, $c, (New-Object System.Text.UTF8Encoding $false))
    W "Correctif ecrit (sauvegarde : $File.bak)."
    $node = Join-Path 'C:\Program Files\NotesCam' 'node.exe'
    if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if ($node) {
      & $node --check $File
      if ($LASTEXITCODE -eq 0) { W "node --check OK." } else { W "ATTENTION: node --check a echoue (code $LASTEXITCODE) — restaurez $File.bak." }
    }
  } else {
    W "Rien a modifier (deja a jour)."
  }

  # 4) Relance du serveur (tache planifiee si presente, sinon lanceur .cmd).
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $TaskName
    W "Tache '$TaskName' redemarree."
  } else {
    $cmd = 'C:\Program Files\NotesCam\start-server.cmd'
    if (Test-Path $cmd) { Start-Process -FilePath $cmd -WindowStyle Hidden; W "Serveur relance via start-server.cmd." }
    else { W "ATTENTION: ni tache planifiee ni start-server.cmd — relancez le serveur manuellement." }
  }
  Start-Sleep -Seconds 3
  $now = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
  if ($now) { W "OK: un process ecoute de nouveau sur 8080 (PID $($now.OwningProcess))." } else { W "Info: rien n'ecoute encore sur 8080 (demarrage en cours ?)." }
  W "TERMINE. Rouvrez l'assistant et relancez « Activer NotesCam Cloud » (reprise sure)."
} catch {
  W "ERREUR: $_"
  exit 1
}
