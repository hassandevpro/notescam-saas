@echo off
REM ===================================================================
REM  NotesCam - APPLIQUER UNE MISE A JOUR DEJA INSTALLEE
REM ===================================================================
REM  Installer NotesCam-Setup.exe remplace les FICHIERS. Le serveur, lui,
REM  continue de tourner avec l'ancien code charge en memoire. Or les
REM  tables et colonnes neuves sont posees AU DEMARRAGE du serveur :
REM  tant qu'il n'a pas redemarre, les ecrans refusent exactement comme
REM  avant, et on croit que la mise a jour n'a rien change.
REM
REM  Ce fichier fait le geste manquant, dans cet ordre :
REM    1. il arrete le service ;
REM    2. il sauvegarde la base et VERIFIE la sauvegarde ;
REM    3. si la sauvegarde n'est pas verifiee, il remet le service en
REM       marche et s'arrete - l'application n'est pas touchee ;
REM    4. sinon il redemarre, puis il controle que tout est en place.
REM
REM  A LANCER EN ADMINISTRATEUR (clic droit, "Executer en tant
REM  qu'administrateur"). Le service tourne sous le compte SYSTEME :
REM  sans elevation, il ne peut pas etre arrete.
REM
REM  Ce fichier est en ASCII et en CRLF, comme les autres .cmd livres :
REM  cmd.exe analyse mal un fichier en fins de ligne Unix et finit par
REM  executer les commentaires.
REM ===================================================================
setlocal
set "BASE=C:\ProgramData\NotesCam\data\notescam.db"
set "APP=C:\Program Files\NotesCam"
set "NODE=%APP%\node\node.exe"
set "TACHE=NotesCam LAN Server"

echo.
echo   NotesCam - application d'une mise a jour deja installee
echo   ======================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo   [ARRET] Cette fenetre n'est PAS administrateur.
  echo.
  echo   Fermez-la, puis clic droit sur ce fichier,
  echo   "Executer en tant qu'administrateur".
  echo.
  pause
  exit /b 1
)

if not exist "%NODE%" (
  echo   [ARRET] node.exe introuvable : "%NODE%"
  echo   NotesCam n'est pas installe a l'emplacement attendu.
  echo.
  pause
  exit /b 1
)

echo   Version actuellement EN MARCHE :
"%NODE%" -e "fetch('http://localhost:8080/api/version').then(r=>r.json()).then(j=>console.log('     '+j.data.version)).catch(()=>console.log('     serveur non joignable (deja arrete ?)'))"
echo.

echo   1. Arret du service...
schtasks /end /tn "%TACHE%" >nul 2>&1
timeout /t 2 /nobreak >nul
REM La tache lance un node.exe fils : arreter la tache ne le tue pas
REM toujours. On termine ce qui tient encore le port 8080.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8080 .*LISTENING"') do (
  echo      arret du processus %%P qui tenait le port 8080
  taskkill /pid %%P /f >nul 2>&1
)
timeout /t 2 /nobreak >nul
netstat -ano | findstr /r /c:":8080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo   [ARRET] Le port 8080 est toujours occupe. Rien n'a ete modifie.
  echo.
  pause
  exit /b 1
)
echo      service arrete, port 8080 libre.
echo.

echo   2. Sauvegarde de la base, puis verification...
"%NODE%" "%~dp0sauvegarder-et-redemarrer.mjs" "%BASE%"
if errorlevel 2 (
  echo.
  echo   [ARRET] Sauvegarde NON verifiee. Je remets le service en marche
  echo           SANS rien avoir modifie.
  schtasks /run /tn "%TACHE%" >nul 2>&1
  echo.
  pause
  exit /b 2
)

echo   3. Redemarrage du service...
schtasks /run /tn "%TACHE%" >nul 2>&1
if errorlevel 1 (
  echo      tache planifiee absente - lancement direct du serveur.
  start "NotesCam" /b "%APP%\start-server.cmd"
)

echo      attente de la reponse du serveur. Jusqu'a 90 secondes : c'est
echo      au demarrage que les tables neuves sont posees.
set /a n=0
:attendre
set /a n+=1
timeout /t 3 /nobreak >nul
"%NODE%" -e "fetch('http://localhost:8080/api/version').then(r=>r.json()).then(j=>{console.log('     serveur en marche : '+j.data.version);process.exit(0)}).catch(()=>process.exit(1))" && goto pret
if %n% LSS 30 goto attendre
echo   [ARRET] Le serveur n'a pas repondu. Consultez le journal :
echo           C:\ProgramData\NotesCam\server.log
echo.
pause
exit /b 1

:pret
echo.
echo   4. Controle de ce que la base porte VRAIMENT :
echo.
"%NODE%" "%~dp0verifier-correctifs.mjs" "C:/ProgramData/NotesCam/data/notescam.db"
set CODE=%errorlevel%

echo.
if "%CODE%"=="0" (
  echo   ==============================================================
  echo    TERMINE. Sur chaque poste qui utilise NotesCam, rechargez la
  echo    page avec Ctrl+Shift+R : le navigateur garde l'ancienne
  echo    interface en cache, et c'est la cause la plus frequente d'un
  echo    refus qui persiste alors que le serveur est a jour.
  echo   ==============================================================
) else (
  echo   Des correctifs manquent encore. Envoyez cette fenetre entiere
  echo   a l'editeur - n'essayez pas de reparer.
)
echo.
pause
endlocal
