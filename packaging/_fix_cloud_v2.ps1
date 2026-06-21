# Correctif activation Cloud v2 (machine sans tache planifiee).
# Patche le serveur package installe (retrait des cles nulles avant l'upsert
# ecole -> corrige ge_grade_max), tue le node qui ecoute sur 8080, relance.
# Journalise TOUT dans C:\ProgramData\NotesCam\_patch.log
$ErrorActionPreference = 'Stop'
$Log = 'C:\ProgramData\NotesCam\_patch.log'
function W($m){ $t=(Get-Date).ToString('s'); Add-Content -Path $Log -Value "$t  $m"; Write-Host $m }
try {
  New-Item -ItemType Directory -Force 'C:\ProgramData\NotesCam' | Out-Null
  Set-Content -Path $Log -Value "== Correctif Cloud v2 =="
  $File = 'C:\Program Files\NotesCam\app\server\activateCloud.js'
  if (-not (Test-Path $File)) { throw "Introuvable: $File" }

  # 1) Arret du serveur (le node qui ecoute sur 8080).
  $conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force; W "Process $($c.OwningProcess) (port 8080) arrete." } catch { W "Echec arret $($c.OwningProcess): $_" }
  }
  Start-Sleep -Seconds 2

  # 2) Patch idempotent (remplacement LITTERAL, insensible aux fins de ligne).
  $c = [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8)
  if ($c -match 'schoolPayload') {
    W "Code deja corrige (schoolPayload present)."
  } else {
    $eol = if ($c -match "`r`n") { "`r`n" } else { "`n" }
    $anchor = '  const provision = await provisionTenant(url, accessToken, {'
    if ($c.IndexOf($anchor) -lt 0) { throw "Ancre provisionTenant introuvable." }
    if ($c.IndexOf('    school,') -lt 0) { throw "Ligne 'school,' introuvable." }
    $insert = '  const schoolPayload = Object.fromEntries(' + $eol +
              '    Object.entries(school).filter(([, v]) => v !== null && v !== undefined),' + $eol +
              '  );' + $eol + $anchor
    $c = $c.Replace($anchor, $insert)
    $c = $c.Replace('    school,', '    school: schoolPayload,')
    Copy-Item $File "$File.bak" -Force
    [System.IO.File]::WriteAllText($File, $c, (New-Object System.Text.UTF8Encoding $false))
    W "Correctif applique (sauvegarde: $File.bak)."
  }

  # 3) Relance du serveur (detache), meme lanceur que d'habitude.
  $cmd = 'C:\Program Files\NotesCam\start-server.cmd'
  Start-Process -FilePath $cmd -WindowStyle Hidden
  W "Serveur relance via start-server.cmd."
  Start-Sleep -Seconds 3
  $now = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
  if ($now) { W "OK: un process ecoute de nouveau sur 8080 (PID $($now.OwningProcess))." } else { W "ATTENTION: rien n'ecoute encore sur 8080 (le serveur met peut-etre qq s a demarrer)." }
  W "TERMINE."
} catch {
  W "ERREUR: $_"
  exit 1
}
