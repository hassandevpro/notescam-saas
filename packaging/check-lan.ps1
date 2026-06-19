<#
  Diagnostic réseau NotesCam LAN — à lancer sur le PC serveur.

  Affiche l'URL exacte à taper sur les autres appareils, teste le serveur et
  le pare-feu, et détecte les pièges classiques (adresses APIPA inutilisables,
  hotspot téléphone avec isolation des clients, profil réseau « Public »).

  Lecture seule : n'exige PAS d'élévation administrateur, ne modifie rien.

  Usage :
    powershell -ExecutionPolicy Bypass -File check-lan.ps1
    powershell -ExecutionPolicy Bypass -File check-lan.ps1 -Port 8080
#>

param([int] $Port = 8080)

$ErrorActionPreference = 'SilentlyContinue'

function Title($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[OK]  $m" -ForegroundColor Green }
function Bad($m)   { Write-Host "[KO]  $m" -ForegroundColor Red }
function Warn($m)  { Write-Host "[!]   $m" -ForegroundColor Yellow }

$problems = @()

# --- 1. Le serveur écoute-t-il ? -------------------------------------
Title "Serveur NotesCam (port $Port)"
$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  $anyAddr = $listen | Where-Object { $_.LocalAddress -in @('0.0.0.0','::') }
  if ($anyAddr) {
    Ok "Le serveur écoute sur 0.0.0.0:$Port (accessible depuis tout le réseau)."
  } else {
    Warn "Le serveur écoute sur $($listen[0].LocalAddress):$Port — PAS sur 0.0.0.0."
    $problems += "Le serveur n'écoute pas sur toutes les interfaces (HOST devrait être 0.0.0.0)."
  }
} else {
  Bad "Aucun service n'écoute sur le port $Port."
  $problems += "Serveur non démarré : vérifie la tâche planifiée 'NotesCam LAN Server'."
}

# --- 2. Adresses IP exploitables -------------------------------------
Title "Adresses réseau de ce PC"
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -ne '127.0.0.1' }

$usable = @()
foreach ($ip in $ips) {
  $addr  = $ip.IPAddress
  $alias = $ip.InterfaceAlias
  if ($addr -like '169.254.*') {
    Write-Host ("  {0,-16} {1,-30} APIPA (inutilisable)" -f $addr, $alias) -ForegroundColor DarkGray
  } else {
    $usable += [pscustomobject]@{ IP = $addr; Alias = $alias }
    Write-Host ("  {0,-16} {1,-30} UTILISABLE" -f $addr, $alias) -ForegroundColor Green
  }
}
if ($usable.Count -eq 0) {
  Bad "Aucune adresse réseau utilisable (toutes en 169.254.* = pas de réseau)."
  $problems += "Le PC n'a pas d'adresse réseau valide : connecte-le au Wi-Fi/routeur de l'école."
}

# --- 3. URL à utiliser sur les autres appareils ----------------------
Title "URL à taper sur les autres appareils"
if ($usable.Count -gt 0) {
  foreach ($u in $usable) {
    $hot = if ($u.Alias -match 'AndroidAP|AP\d|hotspot') { "  <- hotspot téléphone (risque d'isolation, voir plus bas)" } else { "" }
    Write-Host ("  http://{0}:{1}{2}" -f $u.IP, $Port, $hot) -ForegroundColor White
  }
  Write-Host "`n  (sur le PC serveur lui-même : http://localhost:$Port)" -ForegroundColor DarkGray
} else {
  Warn "Aucune URL réseau disponible (voir ci-dessus)."
}

# --- 4. Test HTTP local + réseau -------------------------------------
Title "Test de réponse du serveur"
function Test-Url($url) {
  try {
    $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 8
    Ok "$url -> HTTP $($r.StatusCode)"
    return $true
  } catch {
    Bad "$url -> ÉCHEC : $($_.Exception.Message)"
    return $false
  }
}
$null = Test-Url "http://127.0.0.1:$Port/"
foreach ($u in $usable) { $null = Test-Url ("http://{0}:{1}/" -f $u.IP, $Port) }

# --- 5. Pare-feu ------------------------------------------------------
Title "Pare-feu Windows"
$rule = Get-NetFirewallRule -DisplayName 'NotesCam LAN' -ErrorAction SilentlyContinue
if ($rule) {
  $enabled = ($rule.Enabled -eq 'True' -or $rule.Enabled -eq $true)
  $pf = $rule | Get-NetFirewallPortFilter
  if ($enabled) { Ok "Règle 'NotesCam LAN' active (Inbound, TCP $($pf.LocalPort), profil $($rule.Profile))." }
  else { Bad "Règle 'NotesCam LAN' présente mais DÉSACTIVÉE."; $problems += "Active la règle pare-feu 'NotesCam LAN'." }
} else {
  Bad "Aucune règle pare-feu 'NotesCam LAN'."
  $problems += "Pare-feu non configuré : relance l'installateur ou install-service.ps1 (admin)."
}

# --- 6. Profil réseau (Public bloque l'entrant) ----------------------
Title "Profil des connexions réseau"
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($p in $profiles) {
  if ($p.NetworkCategory -eq 'Public') {
    Warn "$($p.Name) : profil PUBLIC (peut bloquer l'accès entrant)."
    $problems += "Réseau '$($p.Name)' en Public : passe-le en Privé (Paramètres > Réseau)."
  } else {
    Ok "$($p.Name) : profil $($p.NetworkCategory)."
  }
}

# --- 7. Détection hotspot / isolation --------------------------------
# Indices de hotspot : nom d'interface OU nom du réseau (SSID) du type
# « AndroidAP2811 », « iPhone de … », « hotspot », « AP2 », etc.
$HOTSPOT_RX = 'AndroidAP|hotspot|iPhone|\bAP\d'
$profileHot = $profiles | Where-Object { $_.Name -match $HOTSPOT_RX }
$aliasHot   = $usable    | Where-Object { $_.Alias -match $HOTSPOT_RX }
$hotspot    = @($profileHot) + @($aliasHot)
$hotName    = if ($profileHot) { $profileHot[0].Name } elseif ($aliasHot) { $aliasHot[0].Alias } else { '' }
if ($hotspot.Count -gt 0) {
  Title "Avertissement : partage de connexion (hotspot)"
  Warn "Tu utilises un partage de connexion téléphone ($hotName)."
  Warn "Beaucoup de hotspots Android ISOLENT les appareils entre eux : le PC voit"
  Warn "Internet, mais les autres appareils ne peuvent pas l'atteindre."
  $pingIp = if ($usable.Count -gt 0) { $usable[0].IP } else { '<IP-du-PC>' }
  Warn "Test : depuis l'autre appareil, fais 'ping $pingIp'. Si le ping"
  Warn "échoue alors que le serveur répond en local, c'est l'isolation du hotspot."
  Warn "Solution : utilise un vrai routeur / box Wi-Fi (pas le partage téléphone)."
}

# --- Bilan -----------------------------------------------------------
Title "Bilan"
if ($problems.Count -eq 0) {
  Ok "Côté serveur, tout est correct."
  if ($usable.Count -gt 0) {
    Write-Host "Sur les autres appareils (connectés au MÊME réseau), ouvre :" -ForegroundColor Cyan
    foreach ($u in $usable) { Write-Host ("   http://{0}:{1}" -f $u.IP, $Port) -ForegroundColor White }
  }
  if ($hotspot) { Write-Host "Si ça ne marche pas : voir l'avertissement hotspot ci-dessus." -ForegroundColor Yellow }
} else {
  Warn "Points à corriger :"
  $problems | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
}

Write-Host "`nAppuie sur Entrée pour fermer…"
[void](Read-Host)
