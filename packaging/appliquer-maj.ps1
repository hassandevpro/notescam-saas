<#
  Applique une mise à jour NotesCam LAN à l'installation de CE PC, sans
  repasser par l'installateur .exe.

  DEUX MODES, détectés automatiquement :

    • MODE PAQUET  — le script trouve dist\, server\ et src\ À CÔTÉ DE LUI.
      C'est le cas sur un PC d'école : on copie le dossier (clé USB) et on
      lance. Aucun Node, aucun npm, aucun dépôt n'est nécessaire : les
      fichiers sont déjà compilés.

    • MODE DÉPÔT   — le script est dans packaging\ d'un dépôt NotesCam.
      Il recompile alors la SPA en édition LAN (npm run build:lan) avant de
      copier. C'est le mode du poste de développement.

  CE QU'IL NE TOUCHE JAMAIS :
    - la base de l'école (C:\ProgramData\NotesCam) — une copie est faite avant ;
    - le rattachement au cloud, la licence, les comptes ;
    - node.exe embarqué, la tâche planifiée, la règle de pare-feu.

  GARDE-FOU PRINCIPAL. Le script REFUSE de copier un `dist\` compilé en édition
  CLOUD. C'est le défaut constaté le 2026-10-01 : la SPA cloud parle à Supabase
  et jamais à `/api/db`, donc sans Internet l'école « n'arrive plus à
  enregistrer », et avec Internet ses données partent dans le cloud au lieu de
  sa base locale. Aucun message ne le signalait à l'écran.

  Usage — le plus simple est de double-cliquer APPLIQUER-LA-MAJ.cmd.
  Sinon :
      powershell -ExecutionPolicy Bypass -File appliquer-maj.ps1

  Options :
      -SkipBuild     en mode dépôt, réutilise le dist\ existant (pas de npm)
      -Port 8080     port du serveur, si ce n'est pas 8080
      -NoBackup      n'archive pas la base avant (déconseillé)
#>

param(
  [switch] $SkipBuild,
  [int]    $Port = 8080,
  [switch] $NoBackup
)

$ErrorActionPreference = 'Stop'

$TaskName   = 'NotesCam LAN Server'
$InstallDir = Join-Path ${env:ProgramFiles} 'NotesCam'
$AppDir     = Join-Path $InstallDir 'app'
$NodeExe    = Join-Path $InstallDir 'node\node.exe'
$DataDir    = 'C:\ProgramData\NotesCam'
$DbDir      = Join-Path $DataDir 'data'
$Db         = Join-Path $DbDir 'notescam.db'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK]  $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "[!]   $m"  -ForegroundColor Yellow }
function Die($m)  {
  Write-Host "[KO]  $m" -ForegroundColor Red
  Write-Host "`nRien n'a ete applique. L'installation est intacte." -ForegroundColor Red
  Write-Host "`nAppuie sur Entree pour fermer..."
  [void](Read-Host)
  exit 1
}

# ── Auto-élévation : la copie dans Program Files exige l'administrateur ──────
$moi = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $moi.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Elevation en administrateur...' -ForegroundColor Yellow
  # `$args` est une variable AUTOMATIQUE de PowerShell : on ne l'ecrase pas.
  $argv = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"")
  if ($SkipBuild) { $argv += '-SkipBuild' }
  if ($NoBackup)  { $argv += '-NoBackup' }
  $argv += @('-Port', $Port)
  Start-Process powershell -Verb RunAs -ArgumentList $argv
  exit 0
}

# Appelle un executable natif SANS qu'une simple ligne sur stderr fasse echouer
# le script. En PowerShell 5.1, `$ErrorActionPreference = 'Stop'` transforme la
# stderr d'un .exe en NativeCommandError : vite ecrit sa progression sur stderr,
# et le script mourait au milieu d'une compilation parfaitement reussie.
function Invoke-Natif([scriptblock] $bloc) {
  $avant = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $bloc } finally { $ErrorActionPreference = $avant }
}

Write-Host @'
+---------------------------------------------------------------+
|  NotesCam — appliquer une mise a jour a ce PC                  |
|  La base de l ecole n est jamais touchee.                      |
+---------------------------------------------------------------+
'@ -ForegroundColor Cyan

# ── 0. Quel mode ? Où est la source ? ──────────────────────────────────────
Step 'Reperage'
$Mode = ''
$Source = ''
if (Test-Path (Join-Path $PSScriptRoot 'dist\index.html')) {
  $Mode = 'paquet'
  $Source = $PSScriptRoot
  Ok "Mode PAQUET — fichiers deja compilis, pris a cote du script."
} elseif (Test-Path (Join-Path $PSScriptRoot '..\vite.config.js')) {
  $Mode = 'depot'
  $Source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Ok "Mode DEPOT — $Source"
} else {
  Die @"
Impossible de savoir quoi appliquer.
Ce script doit se trouver SOIT a cote d'un dossier dist\ (paquet de mise a jour),
SOIT dans packaging\ d'un depot NotesCam. Ni l'un ni l'autre n'a ete trouve ici :
  $PSScriptRoot
"@
}

if (-not (Test-Path $AppDir)) {
  Die @"
NotesCam n'est pas installe sur ce PC ($AppDir absent).
Ce script met a JOUR une installation existante ; il n'en cree pas.
Pour une premiere installation, utilise l'installateur NotesCam-Setup.exe.
"@
}
Ok "Installation: $AppDir"

# Version actuellement installee, pour la trace.
$verAvant = '(inconnue)'
$pkgInstalle = Join-Path $AppDir 'package.json'
if (Test-Path $pkgInstalle) {
  try { $verAvant = (Get-Content $pkgInstalle -Raw | ConvertFrom-Json).version } catch { }
}
Write-Host "         version installee : $verAvant" -ForegroundColor DarkGray

# ── 1. Compilation (mode dépôt seulement) ──────────────────────────────────
if ($Mode -eq 'depot') {
  Step 'Compilation (edition LAN)'
  if ($SkipBuild) {
    Warn 'Compilation ignoree (-SkipBuild) : le dist\ actuel du depot sera copie tel quel.'
  } else {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
      Die "npm introuvable. Soit tu installes Node, soit tu compiles ailleurs et tu relances avec -SkipBuild."
    }
    Write-Host '  npm run build:lan ...' -ForegroundColor DarkGray
    Push-Location $Source
    try {
      # cmd /c : npm est un .cmd, pas un .exe.
      Invoke-Natif { cmd /c 'npm run build:lan' }
      if ($LASTEXITCODE -ne 0) { Die "La compilation a echoue (code $LASTEXITCODE). Rien n'a ete copie." }
    } finally { Pop-Location }
    Ok 'Compilation terminee.'
  }
}

# ── 2. GARDE-FOU : refuser un dist cloud ───────────────────────────────────
Step "Verification de l edition a installer"
$DistSrc = Join-Path $Source 'dist'
if (-not (Test-Path (Join-Path $DistSrc 'index.html'))) { Die "$DistSrc\index.html absent : il n'y a rien a copier." }

$edition = 'unknown'
$stamp = Join-Path $DistSrc 'edition.json'
if (Test-Path $stamp) {
  try { $edition = (Get-Content $stamp -Raw | ConvertFrom-Json).edition } catch { $edition = 'unknown' }
}
if ($edition -eq 'unknown') {
  # Repli pour un dist sans estampille : le morceau vendor-supabase-*.js n'est
  # emis QUE par le build cloud (vite.config.js ne force ce manualChunk qu'hors
  # mode `lan`).
  if (Get-ChildItem (Join-Path $DistSrc 'assets') -Filter 'vendor-supabase-*.js' -ErrorAction SilentlyContinue) {
    $edition = 'cloud'
  }
}
if ($edition -eq 'cloud') {
  Die @"
dist\ est un build CLOUD.
Cette interface ecrit dans Supabase, PAS dans la base de l'ecole : sans Internet
elle 'refuse d'enregistrer', et avec Internet les donnees partent dans le cloud
au lieu du serveur de l'ecole.
En mode depot : lance 'npm run build:lan' puis recommence.
En mode paquet : le paquet est mal fabrique, redemande-le.
"@
}
if ($edition -eq 'lan') { Ok 'dist\ est bien en edition LAN (estampille edition.json).' }
else { Warn 'dist\ sans estampille d edition, mais aucun chunk vendor-supabase : traite comme LAN.' }

# ── 3. Copie de sûreté de la base ──────────────────────────────────────────
Step 'Copie de surete de la base'
if ($NoBackup) {
  Warn 'Ignoree (-NoBackup).'
} elseif (-not (Test-Path $Db)) {
  Warn "Aucune base a $Db (installation encore vierge) : rien a sauvegarder."
} else {
  $horo = Get-Date -Format 'yyyyMMddHHmmss'
  $dest = Join-Path $DbDir "notescam.db.avant-maj-$horo"
  Copy-Item $Db $dest -Force
  foreach ($suff in @('-wal','-shm')) {
    if (Test-Path "$Db$suff") { Copy-Item "$Db$suff" "$dest$suff" -Force }
  }
  Ok "Base archivee : $dest"
  Write-Host '         (ne la supprime pas et ne la restaure pas seul : appelle l editeur)' -ForegroundColor DarkGray
}

# ── 4. Arrêt du serveur (pour libérer les fichiers) ────────────────────────
Step 'Arret du serveur'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  try { Stop-ScheduledTask -TaskName $TaskName } catch { }
  Ok "Tache planifiee '$TaskName' arretee."
} else {
  Warn "Tache planifiee '$TaskName' absente (serveur lance a la main ?)."
}
# Tout node.exe qui tient encore le port : sinon la copie echoue sur un verrou.
foreach ($c in (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
  try { Stop-Process -Id $c.OwningProcess -Force -Confirm:$false; Ok "Processus $($c.OwningProcess) (port $Port) arrete." }
  catch { Warn "Echec arret du processus $($c.OwningProcess) : $_" }
}
# Windows ne libere pas le verrou de fichier instantanement.
$libre = $false
foreach ($i in 1..10) {
  if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { $libre = $true; break }
  Start-Sleep -Milliseconds 500
}
if ($libre) { Ok "Port $Port libere." } else { Warn "Le port $Port semble encore occupe : la copie peut echouer." }

# ── 5. Copie des fichiers ──────────────────────────────────────────────────
# dist\  : la SPA compilee (l'interface)
# server\: le serveur Fastify + db.js, qui POSE LES NOUVELLES COLONNES au boot
# src\   : les moteurs partages, lus a l'execution par le serveur (hybride H1-H7)
Step 'Copie dans l installation'
foreach ($d in @('dist','server','src')) {
  $from = Join-Path $Source $d
  $to   = Join-Path $AppDir $d
  if (-not (Test-Path $from)) { Warn "$d\ absent de la source : ignore."; continue }
  if (-not (Test-Path $to))   { New-Item -ItemType Directory -Path $to -Force | Out-Null }

  # /MIR reflete aussi les SUPPRESSIONS, ce qui est voulu pour dist\ (les
  # anciens assets au nom hashe doivent partir) mais pas pour server\ ni src\.
  if ($d -eq 'dist') { $opts = @('/MIR') } else { $opts = @('/E') }

  # EXCLUSIONS pour server\ : un depot contient des DONNEES qui n'ont rien a
  # faire dans une installation d'ecole —
  #   data\, data-demo\  bases de developpement ;
  #   *.db               dont des sauvegardes d'AUTRES etablissements.
  # Les copier serait au mieux du bruit, au pire une fuite de donnees d'une
  # ecole vers une autre. (Un paquet bien fabrique ne les contient deja pas :
  # l'exclusion est la ceinture, preparer-maj-usb.ps1 est les bretelles.)
  if ($d -eq 'server') {
    $opts += @('/XD', (Join-Path $from 'data'), (Join-Path $from 'data-demo'))
    $opts += @('/XF', '*.db', '*.db-wal', '*.db-shm')
  }

  # robocopy rend 0-7 en succes (1 = fichiers copies, 2 = extras, 3 = les deux…)
  # et >=8 en echec reel. Un test `-ne 0` ferait echouer toute copie normale.
  $log = Invoke-Natif { robocopy $from $to @opts /NFL /NDL /NJH /NJS /NP /R:2 /W:1 }
  if ($LASTEXITCODE -ge 8) { Die "Copie de $d\ echouee (robocopy $LASTEXITCODE).`n$log" }
  Ok "$d\ copie."
}
# package.json : porte le numero de version que ce script affiche.
$pkgSrc = Join-Path $Source 'package.json'
if (Test-Path $pkgSrc) { Copy-Item $pkgSrc (Join-Path $AppDir 'package.json') -Force; Ok 'package.json copie.' }

# ── 6. Redémarrage ─────────────────────────────────────────────────────────
Step 'Redemarrage du serveur'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Start-ScheduledTask -TaskName $TaskName
  Ok 'Tache planifiee relancee.'
} else {
  Warn "Pas de tache planifiee : lance le serveur a la main ($InstallDir\start-server.cmd)."
}

# ── 7. Vérifications ───────────────────────────────────────────────────────
Step 'Verifications'
$code = ''
foreach ($i in 1..24) {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
    $code = $r.StatusCode
    break
  } catch { Start-Sleep -Milliseconds 750 }
}
if ($code -eq 200) { Ok "http://127.0.0.1:$Port/ repond HTTP 200." }
else { Warn "Le serveur ne repond pas encore. Diagnostic : $InstallDir\start-server.cmd" }

# Preuve que `server\db.js` a bien tourne : les colonnes ajoutees existent.
# C'est le seul controle qui distingue « fichiers copies » de « migration faite ».
#
# LA BASE EST LUE EN DIRECT, sans copie.
#
# Une version precedente de ce script copiait la base, au motif qu'une base en
# mode WAL detenue par le serveur rendait SQLITE_NOTADB. C'ETAIT FAUX, et le
# diagnostic l'etait aussi : le « file is not a database » venait de ce que le
# script passait `process.argv[1]` a DatabaseSync. Pour `node script.js <base>`,
# argv[1] est LE SCRIPT LUI-MEME — node ouvrait donc le fichier .js comme base
# de donnees. Verifie le 2026-10-12 : avec argv[2], la base vive s'ouvre sans
# difficulte pendant que le serveur tourne (232 eleves relus), car WAL accepte
# un second lecteur.
if ((Test-Path $NodeExe) -and (Test-Path $Db)) {
  $checkDir = Join-Path $env:TEMP 'notescam-maj-check'
  if (Test-Path $checkDir) { Remove-Item $checkDir -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $checkDir -Force | Out-Null
  try {
    $js = @'
const { DatabaseSync } = require("node:sqlite");
// argv[0]=node, argv[1]=ce script, argv[2]=la base.
const db = new DatabaseSync(process.argv[2]);
const cols = db.prepare("PRAGMA table_info(students)").all().map(r => r.name);
const attendus = ["quartier","ecole_origine","statut_etablissement","lieu_naissance",
                  "adresse","contact_urgence","nom_pere","profession_pere",
                  "nom_mere","profession_mere","tuteur","parent_phone","sport_aptitude"];
const manquantes = attendus.filter(c => !cols.includes(c));
console.log(JSON.stringify({ total: cols.length, manquantes }));
'@
    $script = Join-Path $checkDir 'check.js'
    Set-Content -Path $script -Value $js -Encoding utf8
    $out = & $NodeExe $script $Db
    $res = $out | ConvertFrom-Json
    if ($res.manquantes.Count -eq 0) {
      Ok "Dossier eleve complet : les 13 colonnes sont en base ($($res.total) colonnes sur students)."
    } else {
      Warn "Colonnes encore absentes : $($res.manquantes -join ', ')"
      Warn 'Elles sont posees au DEMARRAGE par server\db.js. Si le serveur vient tout'
      Warn 'juste de redemarrer, attends 10 s et relance ce script (-SkipBuild).'
    }
  } catch {
    Warn "Controle des colonnes impossible : $_"
  } finally {
    Remove-Item $checkDir -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Warn 'Controle des colonnes ignore (node embarque ou base introuvable).'
}

# ── Bilan ──────────────────────────────────────────────────────────────────
Step 'TERMINE'
Write-Host 'La mise a jour est appliquee a cette installation.' -ForegroundColor Green
Write-Host ''
Write-Host "A verifier : ouvre http://localhost:$Port puis Eleves > Ajouter." -ForegroundColor Gray
Write-Host 'Les champs « Quartier de residence » et « Ancien etablissement »' -ForegroundColor Gray
Write-Host 'doivent apparaitre dans le formulaire.' -ForegroundColor Gray
Write-Host ''
Write-Host 'CE QUE CE SCRIPT NE PEUT PAS FAIRE :' -ForegroundColor Yellow
Write-Host '  Si cette ecole utilise AUSSI l edition cloud (Supabase), le cloud a' -ForegroundColor Yellow
Write-Host '  besoin de sa migration, a passer UNE SEULE FOIS par l editeur :' -ForegroundColor Yellow
Write-Host '      supabase_student_quartier_origine.sql' -ForegroundColor White
Write-Host '  Sans elle, quartier et ancien etablissement sont jetes EN SILENCE' -ForegroundColor Yellow
Write-Host '  cote cloud, a l ecriture comme a la synchronisation.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Appuie sur Entree pour fermer...'
[void](Read-Host)
