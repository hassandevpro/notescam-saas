<#
  Fabrique le PAQUET de mise à jour à emporter sur une autre machine.

  À lancer sur le poste de DÉVELOPPEMENT, depuis le dépôt. Produit un .zip
  autonome qu'on copie sur une clé USB : sur le PC de l'école, il n'y a plus
  qu'à dézipper et double-cliquer APPLIQUER-LA-MAJ.cmd. Aucun Node, aucun npm,
  aucun dépôt n'est nécessaire là-bas — tout est déjà compilé.

  Pourquoi pas l'installateur .exe : il réinstalle tout (node embarqué, service,
  pare-feu, ~50 Mo) et exige de reconstruire l'installeur. Ce paquet ne porte
  que ce qui change — l'interface et le serveur — et pèse quelques Mo.

  Ce que le paquet contient :
      dist\                 l'interface, compilée en édition LAN
      server\               le serveur Fastify (dont db.js, qui pose les colonnes)
      src\                  les moteurs partagés, lus à l'exécution
      package.json          pour le numéro de version
      appliquer-maj.ps1     le script qui applique
      APPLIQUER-LA-MAJ.cmd  à double-cliquer
      LISEZ-MOI.txt         la notice pour l'administrateur de l'école

  Ce que le paquet NE contient JAMAIS :
      server\data\, server\data-demo\, *.db  — des bases de développement, et
      parfois la sauvegarde d'un AUTRE établissement. Les emporter serait une
      fuite de données d'une école vers une autre.

  Usage :
      powershell -ExecutionPolicy Bypass -File packaging\preparer-maj-usb.ps1
      powershell -ExecutionPolicy Bypass -File packaging\preparer-maj-usb.ps1 -SkipBuild
#>

param(
  [switch] $SkipBuild,
  [string] $OutDir = ''
)

$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK]  $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "[!]   $m"  -ForegroundColor Yellow }
function Die($m)  { Write-Host "[KO]  $m" -ForegroundColor Red; exit 1 }

function Invoke-Natif([scriptblock] $bloc) {
  $avant = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $bloc } finally { $ErrorActionPreference = $avant }
}

Step 'Reperage du depot'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $Repo 'vite.config.js'))) {
  Die "Depot introuvable : $Repo ne contient pas vite.config.js."
}
Ok $Repo

$version = '0.0.0'
try { $version = (Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json).version } catch { }
Ok "version $version"

# ── 1. Compilation ─────────────────────────────────────────────────────────
Step 'Compilation (edition LAN)'
if ($SkipBuild) {
  Warn 'Ignoree (-SkipBuild) : le dist\ actuel du depot sera empaquete tel quel.'
} else {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die 'npm introuvable sur ce poste.' }
  Push-Location $Repo
  try {
    Invoke-Natif { cmd /c 'npm run build:lan' }
    if ($LASTEXITCODE -ne 0) { Die "Compilation echouee (code $LASTEXITCODE)." }
  } finally { Pop-Location }
  Ok 'Compilation terminee.'
}

# ── 2. GARDE-FOU : ne JAMAIS empaqueter un dist cloud ──────────────────────
# Un paquet cloud livre a une ecole est bien pire qu'un paquet absent : l'ecole
# saisit, voit un succes, et ses donnees ne sont nulle part dans sa base.
Step "Verification de l edition compilee"
$DistSrc = Join-Path $Repo 'dist'
if (-not (Test-Path (Join-Path $DistSrc 'index.html'))) { Die "$DistSrc\index.html absent." }
$edition = 'unknown'
$stamp = Join-Path $DistSrc 'edition.json'
if (Test-Path $stamp) {
  try { $edition = (Get-Content $stamp -Raw | ConvertFrom-Json).edition } catch { }
}
if ($edition -eq 'unknown' -and (Get-ChildItem (Join-Path $DistSrc 'assets') -Filter 'vendor-supabase-*.js' -ErrorAction SilentlyContinue)) {
  $edition = 'cloud'
}
if ($edition -ne 'lan') {
  Die "dist\ n'est pas en edition LAN (detecte : $edition). Lance 'npm run build:lan' puis recommence."
}
Ok 'dist\ est en edition LAN.'

# ── 3. Assemblage ──────────────────────────────────────────────────────────
Step 'Assemblage du paquet'
if (-not $OutDir) { $OutDir = Join-Path $Repo 'packaging\Output-maj' }
$nom   = "notescam-maj-$version-$(Get-Date -Format 'yyyyMMdd')"
$stage = Join-Path $OutDir $nom
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($d in @('dist','server','src')) {
  $from = Join-Path $Repo $d
  $to   = Join-Path $stage $d
  if (-not (Test-Path $from)) { Die "$d\ absent du depot." }
  $opts = @('/E')
  if ($d -eq 'server') {
    # Voir l'en-tete : jamais de donnees d'ecole dans un paquet.
    $opts += @('/XD', (Join-Path $from 'data'), (Join-Path $from 'data-demo'))
    $opts += @('/XF', '*.db', '*.db-wal', '*.db-shm', '*.key', '*.pem')
  }
  $log = Invoke-Natif { robocopy $from $to @opts /NFL /NDL /NJH /NJS /NP /R:2 /W:1 }
  if ($LASTEXITCODE -ge 8) { Die "Copie de $d\ echouee (robocopy $LASTEXITCODE).`n$log" }
  Ok "$d\"
}
Copy-Item (Join-Path $Repo 'package.json') $stage -Force
Copy-Item (Join-Path $PSScriptRoot 'appliquer-maj.ps1')    $stage -Force
Copy-Item (Join-Path $PSScriptRoot 'APPLIQUER-LA-MAJ.cmd') $stage -Force
Ok 'scripts et package.json'

# ── 4. Contrôle : aucune donnée d'école ne s'est glissée dedans ────────────
Step 'Controle du contenu'
$interdits = Get-ChildItem $stage -Recurse -Include '*.db','*.db-wal','*.db-shm','*.key','*.pem' -ErrorAction SilentlyContinue
if ($interdits) {
  $interdits | ForEach-Object { Write-Host "   $($_.FullName)" -ForegroundColor Red }
  Remove-Item $stage -Recurse -Force
  Die 'Des fichiers de donnees se sont glisses dans le paquet. Paquet detruit, rien ne sort.'
}
Ok 'Aucune base, aucune cle : le paquet ne porte que du code.'

# ── 5. Notice pour l'école ─────────────────────────────────────────────────
$lisezmoi = @"
========================================================================
NotesCam - mise a jour $version
Notice pour l'administrateur du PC serveur de l'ecole
========================================================================

CE QUE CETTE MISE A JOUR CORRIGE
--------------------------------
Des notes saisies sur un poste hors ligne pouvaient DISPARAITRE.

La cause : l'application supprimait les saisies non transmises de plus de
48 heures, et elle le faisait au DEMARRAGE, AVANT meme d'essayer de les
envoyer. Une saisie faite le vendredi soir sur un poste sans reseau etait
donc detruite a l'ouverture du lundi matin, sans avoir jamais ete envoyee
une seule fois, et sans aucun message.

Desormais, une saisie non transmise n'est JAMAIS supprimee :

  - l'application essaie d'abord d'envoyer ; elle n'ecarte plus rien avant ;
  - une saisie que le serveur refuse reste conservee sur le poste et reste
    visible, au lieu de disparaitre ;
  - le bouton qui "vidait la file d'attente" ne detruit plus rien : il met
    de cote, apres telechargement d'une copie, et un administrateur peut
    tout remettre en file.

A FAIRE APRES L'INSTALLATION  --  IMPORTANT
-------------------------------------------
Sur CHAQUE poste d'enseignant qui a saisi des notes, relevez la preuve des
saisies non transmises :

  1. Ouvrez NotesCam sur le poste de l'enseignant.
  2. En haut de l'ecran, cliquez sur l'indicateur de synchronisation.
  3. Cliquez sur "Telecharger la preuve des saisies".
  4. Conservez le fichier .json obtenu et transmettez-le a l'editeur.

Ce releve est le seul moyen de savoir s'il reste des notes bloquees sur un
poste. Faites-le AVANT toute autre manipulation. Ce bouton n'existe qu'a
partir de cette mise a jour.

CE QUI N'EST PAS TOUCHE
-----------------------
  - Aucune donnee scolaire n'est modifiee (eleves, notes, frais).
  - La base de donnees est CONSERVEE. Une copie de surete est faite
    automatiquement AVANT la mise a jour.
  - Le rattachement de l'ecole au cloud est conserve : aucun nouvel
    appairage, aucun code a saisir.
  - Les comptes et les mots de passe ne sont ni lus ni modifies.
  - Aucune migration de base n'est necessaire, ni sur le serveur de l'ecole
    ni dans le cloud.

CE QUE CETTE MISE A JOUR NE FAIT PAS
------------------------------------
Elle empeche les pertes a venir. Elle ne retrouve PAS les notes deja
disparues : celles-la sont perdues. Si des notes anciennes manquent,
signalez-le a l'editeur en joignant le fichier de preuve.

CE QU'IL VOUS FAUT
------------------
  - Ce dossier, dezippe quelque part (le Bureau convient).
  - Le PC SERVEUR de l'ecole (celui ou NotesCam est installe).
  - Le mot de passe administrateur Windows de ce PC.
  - Environ 2 minutes. Le service sera indisponible ~1 minute.

A faire de preference en dehors des heures de saisie des notes.

INSTALLATION - UNE SEULE ACTION
-------------------------------
  1. Dezippez ce dossier sur le PC serveur.
  2. Double-cliquez sur :  APPLIQUER-LA-MAJ.cmd
  3. Repondez OUI a la demande d'autorisation administrateur.

Et c'est tout. Le script fait le reste et affiche son resultat.

RESULTAT ATTENDU
----------------
Une suite de lignes [OK], puis :

  "La mise a jour est appliquee a cette installation."

Verification en 30 secondes : ouvrez NotesCam sur un poste d'enseignant et
cliquez sur l'indicateur de synchronisation, en haut de l'ecran. Le bouton
"Telecharger la preuve des saisies" doit apparaitre.

Au premier chargement, chaque navigateur met a jour son stockage local.
C'est automatique et sans perte ; cela peut prendre une seconde de plus.

SI CA ECHOUE
------------
Le script s'arrete AVANT d'avoir modifie quoi que ce soit et affiche la
raison en rouge. L'installation reste alors exactement comme avant.

Faites une photo de l'ecran et envoyez-la a l'editeur. N'essayez aucune
reparation de vous-meme, et ne restaurez pas la copie de surete seul.

La copie de surete de la base se trouve dans :
    C:\ProgramData\NotesCam\data\notescam.db.avant-maj-<horodatage>
"@
Set-Content -Path (Join-Path $stage 'LISEZ-MOI.txt') -Value $lisezmoi -Encoding utf8
Ok 'LISEZ-MOI.txt'

# ── 6. Zip ─────────────────────────────────────────────────────────────────
Step 'Compression'
$zip = Join-Path $OutDir "$nom.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$mo = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Ok "$zip  ($mo Mo)"

Step 'TERMINE'
Write-Host 'Fichier a emporter sur la clef USB :' -ForegroundColor Green
Write-Host "    $zip" -ForegroundColor White
Write-Host ''
Write-Host 'Sur le PC de l ecole : dezipper, puis double-cliquer' -ForegroundColor Gray
Write-Host 'APPLIQUER-LA-MAJ.cmd. Rien d autre a installer la-bas.' -ForegroundColor Gray
Write-Host ''
Write-Host "Le dossier non compresse reste disponible ici, si tu preferes" -ForegroundColor DarkGray
Write-Host "copier le dossier plutot que le zip :" -ForegroundColor DarkGray
Write-Host "    $stage" -ForegroundColor DarkGray
