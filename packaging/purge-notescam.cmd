@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
REM ============================================================================
REM  purge-notescam.cmd  —  Desinstallation TOTALE de NotesCam (edition LAN)
REM ============================================================================
REM  Contrairement au desinstalleur normal (qui PRESERVE les donnees), ce script
REM  EFFACE TOUT : programme + service + pare-feu + TOUTES LES DONNEES
REM  (base SQLite, jeton d'ecole, cles, sauvegardes, fichiers, logs).
REM  Resultat : machine vierge. Apres reinstallation, l'ancien compte n'existe plus.
REM
REM  >>> OPERATION IRREVERSIBLE — machines de demo / test / recette. <<<
REM
REM  USAGE (clic droit > "Executer en tant qu'administrateur", ou invite admin) :
REM      purge-notescam.cmd                 (demande confirmation)
REM      purge-notescam.cmd /F              (sans confirmation)
REM      purge-notescam.cmd /B:C:\chemin    (sauvegarde la base avant purge)
REM ============================================================================

set "TASKNAME=NotesCam LAN Server"
set "FWRULE=NotesCam LAN"
set "DATADIR=C:\ProgramData\NotesCam"
set "INSTALLDIR=%ProgramFiles%\NotesCam"
set "APPID={8B5F2E14-9C3A-4D7B-9E21-3F7A2C9D5E10}"
set "FORCE="
set "BACKUP="

REM --- Analyse des arguments -------------------------------------------------
:parse
if "%~1"=="" goto endparse
if /i "%~1"=="/F"     ( set "FORCE=1" & shift & goto parse )
if /i "%~1"=="-Force" ( set "FORCE=1" & shift & goto parse )
set "A=%~1"
if /i "!A:~0,3!"=="/B:" ( set "BACKUP=!A:~3!" & shift & goto parse )
shift
goto parse
:endparse

REM --- 0. Droits administrateur ----------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [ERREUR] Ce script doit etre lance en ADMINISTRATEUR.
  echo            Clic droit sur le fichier ^> "Executer en tant qu'administrateur".
  echo.
  pause
  exit /b 1
)

REM --- 1. Confirmation --------------------------------------------------------
echo.
echo   ============================================================
echo    PURGE TOTALE DE NOTESCAM SUR CETTE MACHINE
echo   ============================================================
echo    Seront DEFINITIVEMENT supprimes :
echo      - le programme       : %INSTALLDIR%
echo      - la tache planifiee : %TASKNAME%
echo      - la regle pare-feu  : %FWRULE%
echo      - TOUTES LES DONNEES : %DATADIR%
echo        (base notescam.db, jeton d'ecole, cles, sauvegardes, fichiers, logs)
echo.
if not defined FORCE (
  set "ANS="
  set /p "ANS=  Tapez  SUPPRIMER  pour confirmer (autre = annuler) : "
  if /i not "!ANS!"=="SUPPRIMER" (
    echo   [!] Annule. Aucune modification effectuee.
    exit /b 0
  )
)

REM --- 2. Sauvegarde optionnelle de la base ----------------------------------
if defined BACKUP (
  if exist "%DATADIR%\data\notescam.db" (
    for /f %%i in ('wmic os get localdatetime ^| find "."') do set "LDT=%%i"
    set "STAMP=!LDT:~0,8!-!LDT:~8,6!"
    if not exist "!BACKUP!" mkdir "!BACKUP!"
    copy /Y "%DATADIR%\data\notescam.db" "!BACKUP!\notescam-purge-!STAMP!.db" >nul
    echo   [OK] Base sauvegardee : !BACKUP!\notescam-purge-!STAMP!.db
  ) else (
    echo   [!] Aucune base a sauvegarder.
  )
)

REM --- 3. Arret tache planifiee + processus serveur --------------------------
echo.
echo [1/6] Arret du service et des processus serveur...
schtasks /End    /TN "%TASKNAME%" >nul 2>&1
schtasks /Delete /TN "%TASKNAME%" /F >nul 2>&1
if errorlevel 1 (echo   [!] Tache planifiee absente.) else (echo   [OK] Tache "%TASKNAME%" supprimee.)
REM Ne tue que les node.exe de NotesCam (par ligne de commande), pas les autres.
wmic process where "name='node.exe' and commandline like '%%NotesCam%%'" call terminate >nul 2>&1
wmic process where "name='node.exe' and commandline like '%%index.js%%'"  call terminate >nul 2>&1
echo   [OK] Processus serveur NotesCam arretes (si presents).

REM --- 4. Regle pare-feu ------------------------------------------------------
echo.
echo [2/6] Retrait de la regle pare-feu...
netsh advfirewall firewall delete rule name="%FWRULE%" >nul 2>&1
if errorlevel 1 (echo   [!] Regle pare-feu absente.) else (echo   [OK] Regle "%FWRULE%" retiree.)

REM --- 5. Desinstallation du programme (cle Inno Setup) ----------------------
echo.
echo [3/6] Desinstallation du programme...
call :UNINSTALL "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\%APPID%_is1"
call :UNINSTALL "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\%APPID%_is1"

REM --- 6. Suppression du dossier programme (residus) -------------------------
echo.
echo [4/6] Suppression du dossier programme...
if exist "%INSTALLDIR%" (
  rmdir /S /Q "%INSTALLDIR%" 2>nul
  if exist "%INSTALLDIR%" (
    echo   [!] Dossier verrouille. Redemarre puis relance ce script.
  ) else (
    echo   [OK] Supprime : %INSTALLDIR%
  )
) else (
  echo   [!] Dossier programme deja absent.
)

REM --- 7. SUPPRESSION DES DONNEES (= efface le compte / l'ecole) --------------
echo.
echo [5/6] Suppression des DONNEES (base, jeton d'ecole, cles, sauvegardes)...
if exist "%DATADIR%" (
  rmdir /S /Q "%DATADIR%" 2>nul
  if exist "%DATADIR%" (
    echo   [!] Donnees verrouillees. Ferme le processus (ou redemarre) et relance.
  ) else (
    echo   [OK] Supprime : %DATADIR%   -^> l'ancien compte n'existe plus.
  )
) else (
  echo   [!] Dossier de donnees deja absent.
)

REM --- 8. Raccourcis ----------------------------------------------------------
echo.
echo [6/6] Nettoyage des raccourcis...
rmdir /S /Q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\NotesCam" 2>nul
del /F /Q "%PUBLIC%\Desktop\NotesCam (LAN).url" 2>nul
del /F /Q "%USERPROFILE%\Desktop\NotesCam (LAN).url" 2>nul
echo   [OK] Raccourcis retires.

REM --- Termine ----------------------------------------------------------------
echo.
echo   ============================================================
echo    PURGE TERMINEE — la machine est vierge de NotesCam.
echo   ============================================================
echo.
echo   NOTE navigateur : l'app LAN est une web-app (http://localhost:8080).
echo   Une session/cache peut rester dans le navigateur. Pour repartir 100%% propre,
echo   vide le cache du site localhost:8080 ou ouvre-le en navigation privee
echo   apres reinstallation.
echo.
if not defined FORCE pause
exit /b 0

REM ============================================================================
REM  Sous-routine : desinstalle via l'UninstallString d'une cle Inno (_is1)
REM ============================================================================
:UNINSTALL
reg query %1 /v UninstallString >nul 2>&1
if errorlevel 1 goto :eof
set "US="
for /f "tokens=2,*" %%A in ('reg query %1 /v UninstallString ^| find /i "UninstallString"') do set "US=%%B"
if not defined US goto :UNINSKEY
set "US=!US:"=!"
echo   Desinstalleur : "!US!"
"!US!" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
REM L'uninstaller Inno se relance puis se supprime : on attend (max ~60 s).
set /a _N=0
:WAITUNINS
if not exist "%INSTALLDIR%\unins000.exe" goto :UNINSDONE
set /a _N+=1
if !_N! geq 60 goto :UNINSDONE
timeout /t 1 /nobreak >nul
goto :WAITUNINS
:UNINSDONE
echo   [OK] Programme desinstalle.
:UNINSKEY
reg delete %1 /f >nul 2>&1
goto :eof
