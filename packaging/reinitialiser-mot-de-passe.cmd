@echo off
REM ==========================================================================
REM  NotesCam (LAN) - reinitialiser un mot de passe oublie, HORS LIGNE.
REM
REM  A lancer SUR LE PC SERVEUR de l'ecole. Double-clic suffit : l'outil liste
REM  les comptes, demande lequel reinitialiser, et affiche le nouveau mot de
REM  passe. Rien n'est envoye sur Internet. Le serveur peut rester allume.
REM
REM  DEUX FACONS DE S'EN SERVIR
REM   1) Installe : ce fichier est dans le dossier d'installation (menu
REM      Demarrer > NotesCam > Reinitialiser un mot de passe).
REM   2) Cle USB (ecole installee AVANT cet outil) : copier sur la cle ce
REM      fichier + reset-password-cli.mjs + resetPassword.js, puis lancer le
REM      .cmd. Il prend node.exe et la base DANS l'installation presente, et
REM      n'ecrit rien dans Program Files.
REM ==========================================================================
title NotesCam - reinitialiser un mot de passe

REM --- Droits administrateur : la base vit dans ProgramData, ecrite par le
REM     compte SYSTEME. Sans elevation, l'ecriture serait refusee.
net session >nul 2>&1
if errorlevel 1 (
  echo Elevation des droits administrateur...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b 0
)

set "DATA=%ProgramData%\NotesCam\data"

REM --- Trouver l'installation (node.exe embarque + dossier server) ---------
set "DIR=%~dp0"
if exist "%DIR%node\node.exe" if exist "%DIR%app\server\db.js" goto FOUND
set "DIR=%ProgramFiles%\NotesCam\"
if exist "%DIR%node\node.exe" if exist "%DIR%app\server\db.js" goto FOUND

echo.
echo [ERREUR] Installation NotesCam introuvable.
echo          Attendu : "%ProgramFiles%\NotesCam\node\node.exe"
echo          Lancer ce fichier depuis le dossier d'installation, ou verifier
echo          que NotesCam est bien installe sur ce PC.
echo.
pause
exit /b 1

:FOUND
REM --- L'outil : celui de la cle USB s'il est a cote, sinon celui installe --
set "CLI=%DIR%app\server\reset-password-cli.mjs"
if exist "%~dp0reset-password-cli.mjs" set "CLI=%~dp0reset-password-cli.mjs"

echo.
echo   Installation   : %DIR%
echo   Base de donnees: %DATA%
echo.
"%DIR%node\node.exe" "%CLI%" --app-dir "%DIR%app\server" --data-dir "%DATA%" %*
echo.
pause
