# Corrige l'activation Cloud bloquée à l'étape « Tenant » :
#   provision-tenant rejetait l'école car ge_grade_max était envoyé à null
#   (null explicite court-circuite le DEFAULT NOT NULL côté Postgres).
# Ce script : arrête le serveur, applique le correctif au code packagé
# (retrait des clés nulles avant l'upsert école), puis redémarre.
#
# À LANCER EN ADMINISTRATEUR :
#   powershell -ExecutionPolicy Bypass -File "<chemin>\_fix_ge_grade_max.ps1"

$ErrorActionPreference = 'Stop'
$TaskName = 'NotesCam LAN Server'
$File     = 'C:\Program Files\NotesCam\app\server\activateCloud.js'

Write-Host '== Correctif activation Cloud (ge_grade_max) =='

# 1) Arrêt du serveur (libère le verrou base + le fichier code).
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Write-Host "Tache '$TaskName' stoppee."
}
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like 'C:\Program Files\NotesCam\*' } |
  ForEach-Object { Stop-Process -Id $_.Id -Force; Write-Host "Process node $($_.Id) arrete." }
Start-Sleep -Seconds 2

# 2) Patch idempotent du code packagé.
if (-not (Test-Path $File)) { throw "Introuvable : $File" }
# Lecture/ecriture en UTF-8 explicite (PS 5.1 lirait sinon en ANSI -> accents casses).
$c = [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8)
if ($c -match 'schoolPayload') {
  Write-Host 'Code deja corrige (schoolPayload present).'
} else {
  $pat = "(?ms)  const provision = await provisionTenant\(url, accessToken, \{\r?\n    school,\r?\n    admin_email: email,"
  $rep = @'
  const schoolPayload = Object.fromEntries(
    Object.entries(school).filter(([, v]) => v !== null && v !== undefined),
  );
  const provision = await provisionTenant(url, accessToken, {
    school: schoolPayload,
    admin_email: email,
'@
  $new = [regex]::Replace($c, $pat, $rep.Replace('$','$$'))
  if ($new -eq $c) { throw 'Bloc cible introuvable : code packagé different de celui attendu.' }
  Copy-Item $File "$File.bak" -Force
  [System.IO.File]::WriteAllText($File, $new, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Correctif applique (sauvegarde : $File.bak)."
}

# 3) Redemarrage du serveur.
Start-ScheduledTask -TaskName $TaskName
Write-Host "Tache '$TaskName' redemarree."
Write-Host ''
Write-Host 'Termine. Rouvrez l''assistant et relancez « Activer NotesCam Cloud » :'
Write-Host 'la migration est reprenable, elle repartira de l''etape Tenant.'
