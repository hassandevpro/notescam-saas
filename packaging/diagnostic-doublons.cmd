@echo off
REM Pourquoi un eleve apparait plusieurs fois sur ce poste. Lecture seule : ne
REM corrige rien, ne supprime rien. Pas besoin d'etre administrateur.
setlocal
set "NODE=%ProgramFiles%\NotesCam\node\node.exe"
if not exist "%NODE%" set "NODE=%ProgramFiles(x86)%\NotesCam\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0diagnostic-doublons.mjs" %*
echo.
pause
