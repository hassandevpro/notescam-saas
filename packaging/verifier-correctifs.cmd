@echo off
REM Controle de la mise a jour NotesCam sur CE poste. Lecture seule : ne modifie
REM rien, n'exige pas d'etre administrateur. Utilise le Node embarque par
REM l'installation, donc aucun prerequis a installer.
setlocal
set "NODE=%ProgramFiles%\NotesCam\node\node.exe"
if not exist "%NODE%" set "NODE=%ProgramFiles(x86)%\NotesCam\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0verifier-correctifs.mjs" %*
echo.
pause
