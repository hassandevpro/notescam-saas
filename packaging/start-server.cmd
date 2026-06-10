@echo off
REM Lanceur du serveur NotesCam LAN. Exécuté par la tâche planifiée (au boot,
REM compte SYSTEM). %~dp0 = dossier d'installation (se termine par un \).

REM Données hors de Program Files (non inscriptible) -> ProgramData.
set "NOTESCAM_DATA_DIR=C:\ProgramData\NotesCam\data"
set "PORT=8080"
set "HOST=0.0.0.0"

if not exist "C:\ProgramData\NotesCam" mkdir "C:\ProgramData\NotesCam"

REM node.exe portable embarqué + serveur. Journalisation simple avec rotation
REM grossière (on repart à zéro si le log dépasse ~5 Mo).
set "LOG=C:\ProgramData\NotesCam\server.log"
for %%A in ("%LOG%") do if exist "%LOG%" if %%~zA GTR 5000000 del "%LOG%"

"%~dp0node\node.exe" "%~dp0app\server\index.js" >> "%LOG%" 2>&1
