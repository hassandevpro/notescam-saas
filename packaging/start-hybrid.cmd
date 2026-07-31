@echo off
REM ============================================================================
REM  NotesCam LAN — LANCEUR DE TEST « HYBRIDE »
REM  Démarre le serveur LAN AVEC la synchro Cloud activée (NOTESCAM_CLOUD_SYNC=1),
REM  ce qui draine les intentions distantes (gouvernance : Fondatrice à distance ->
REM  Cloud -> LAN -> application -> confirmation) et la réplication continue.
REM
REM  À placer dans le dossier d'installation, à côté de node\ et app\
REM  (par défaut : C:\Program Files\NotesCam). Lancer en tant qu'ADMINISTRATEUR.
REM
REM  Prérequis :
REM   1. NotesCam LAN installé.
REM   2. École déjà MIGRÉE Cloud -> LAN (l'assistant « Activer/Migrer » a créé
REM      le jeton scellé server-token.key dans le dossier de données). Sans ce
REM      jeton, la synchro ne démarre pas (c'est voulu : sécurité).
REM   3. Côté Cloud, la politique hybride de l'école est posée
REM      (voir enable-hybrid-maarif.ps1).
REM ============================================================================
setlocal

set "NOTESCAM_DATA_DIR=C:\ProgramData\NotesCam\data"
set "PORT=8080"
set "HOST=0.0.0.0"
set "NOTESCAM_CLOUD_SYNC=1"

if not exist "%NOTESCAM_DATA_DIR%" mkdir "%NOTESCAM_DATA_DIR%" >nul 2>&1

echo ============================================================
echo   NotesCam LAN - MODE HYBRIDE
echo   NOTESCAM_CLOUD_SYNC = 1  (drain des intentions distantes)
echo   Donnees : %NOTESCAM_DATA_DIR%
echo   Ecoute  : http://%HOST%:%PORT%
echo ------------------------------------------------------------
if not exist "%NOTESCAM_DATA_DIR%\server-token.key" (
  echo   [ATTENTION] server-token.key introuvable : l'ecole n'a pas
  echo   encore ete migree Cloud -^> LAN. La synchro Cloud restera INACTIVE
  echo   tant que la migration n'a pas ete faite via l'assistant.
  echo ------------------------------------------------------------
)
echo   Ctrl+C pour arreter.  (Si le service tourne deja sur le port 8080,
echo   arretez-le d'abord : schtasks /End /TN NotesCamServer   ou via services.msc)
echo ============================================================
echo.

"%~dp0node\node.exe" "%~dp0app\server\index.js"

endlocal
