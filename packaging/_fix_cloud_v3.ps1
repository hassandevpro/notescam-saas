# Correctif activation Cloud v3 — anti-blocage « 0% — migration en cours… ».
#
# Cause : aucun appel reseau de l'activation (auth Supabase + fonction edge
# provision-tenant) n'avait de timeout. Si l'un pend, la requete /run ne se
# resout jamais et l'assistant reste fige a 0%, sans erreur.
#
# Ce script patche le serveur PACKAGE installe (server\activateCloud.js) :
#   - ajoute un garde-fou withTimeout(30 s) sur signUp / signInWithPassword ;
#   - borne le fetch provision-tenant avec un AbortController (abandon reel).
# Resultat : soit la migration avance, soit elle echoue en 30 s MAX avec un
# message clair (la reprise reste possible, le push etant idempotent).
#
# Idempotent. A LANCER EN ADMINISTRATEUR :
#   powershell -ExecutionPolicy Bypass -File "<chemin>\_fix_cloud_v3.ps1"

$ErrorActionPreference = 'Stop'
$Log      = 'C:\ProgramData\NotesCam\_patch.log'
$TaskName = 'NotesCam LAN Server'
$File     = 'C:\Program Files\NotesCam\app\server\activateCloud.js'
function W($m){ $t=(Get-Date).ToString('s'); Add-Content -Path $Log -Value "$t  $m"; Write-Host $m }

try {
  New-Item -ItemType Directory -Force 'C:\ProgramData\NotesCam' | Out-Null
  Add-Content -Path $Log -Value "== Correctif Cloud v3 (timeouts reseau) =="
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

  # 2) Patch idempotent. Lecture/ecriture UTF-8, normalisation des fins de ligne
  #    en LF pour que les remplacements multi-lignes correspondent a coup sur.
  $c = [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8)
  if ($c -match 'withTimeout') {
    W "Code deja corrige (withTimeout present) — rien a faire."
  } else {
    $c = $c.Replace("`r`n", "`n")

    # 2a) Helper withTimeout, insere juste apres 'const CHUNK = 500;'.
    $anchorChunk = 'const CHUNK = 500;'
    if ($c.IndexOf($anchorChunk) -lt 0) { throw "Ancre 'const CHUNK = 500;' introuvable." }
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

    # 2b) Wrap signUp.
    $oSignup = 'await supa.auth.signUp({ email, password });'
    $nSignup = 'await withTimeout(supa.auth.signUp({ email, password }), ''Creation du compte cloud'');'
    if ($c.IndexOf($oSignup) -lt 0) { throw "Ancre signUp introuvable." }
    $c = $c.Replace($oSignup, $nSignup)

    # 2c) Wrap signInWithPassword de verifyCloud (client 'supa').
    $oVerify = 'await supa.auth.signInWithPassword({ email, password });'
    $nVerify = 'await withTimeout(supa.auth.signInWithPassword({ email, password }), ''Connexion cloud'');'
    if ($c.IndexOf($oVerify) -lt 0) { throw "Ancre signInWithPassword (verify) introuvable." }
    $c = $c.Replace($oVerify, $nVerify)

    # 2d) Wrap signInWithPassword de runCloudActivation (client 'authClient').
    $oRun = 'await authClient.auth.signInWithPassword({ email, password });'
    $nRun = 'await withTimeout(authClient.auth.signInWithPassword({ email, password }), ''Connexion cloud'');'
    if ($c.IndexOf($oRun) -lt 0) { throw "Ancre signInWithPassword (run) introuvable." }
    $c = $c.Replace($oRun, $nRun)

    # 2e) Borne le fetch provision-tenant avec un AbortController (abandon reel).
    $oFetch = @(
      '  const res = await fetch(`${url}/functions/v1/provision-tenant`, {',
      '    method: ''POST'',',
      '    headers: { Authorization: `Bearer ${accessToken}`, ''Content-Type'': ''application/json'' },',
      '    body: JSON.stringify(payload),',
      '  });'
    ) -join "`n"
    if ($c.IndexOf($oFetch) -lt 0) { throw "Bloc fetch provision-tenant introuvable." }
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

    Copy-Item $File "$File.bak" -Force
    [System.IO.File]::WriteAllText($File, $c, (New-Object System.Text.UTF8Encoding $false))
    W "Correctif applique (sauvegarde : $File.bak)."

    # Verification syntaxe si node est joignable.
    $node = Join-Path 'C:\Program Files\NotesCam' 'node.exe'
    if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if ($node) {
      & $node --check $File
      if ($LASTEXITCODE -eq 0) { W "node --check OK." } else { W "ATTENTION: node --check a echoue (code $LASTEXITCODE)." }
    }
  }

  # 3) Relance du serveur (tache planifiee si presente, sinon lanceur .cmd).
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
