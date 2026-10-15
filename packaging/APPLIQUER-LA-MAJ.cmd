@echo off
rem ============================================================================
rem  NotesCam — APPLIQUER LA MISE A JOUR
rem
rem  DOUBLE-CLIQUE CE FICHIER.
rem
rem  Windows demandera l'autorisation administrateur : c'est normal, les
rem  fichiers de l'application sont dans Program Files.
rem
rem  Ce qui se passe ensuite, tout seul :
rem    1. une copie de surete de la base de l'ecole est faite ;
rem    2. le serveur est arrete une minute ;
rem    3. les fichiers de l'application sont remplaces ;
rem    4. le serveur redemarre et le script VERIFIE qu'il repond.
rem
rem  La base de l'ecole (eleves, notes, frais) n'est JAMAIS supprimee.
rem
rem  Si quelque chose echoue, le script s'arrete AVANT d'avoir rien modifie et
rem  affiche pourquoi. Dans ce cas : fais une photo de l'ecran et envoie-la a
rem  l'editeur.
rem ============================================================================

set "ICI=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ICI%appliquer-maj.ps1" %*

rem Si PowerShell n'a meme pas pu demarrer, on garde la fenetre ouverte : le
rem .ps1 fait sa propre pause en fin de course, mais pas s'il n'a jamais tourne.
if errorlevel 1 (
  echo.
  echo Le script n'a pas pu s'executer. Code : %errorlevel%
  echo Envoie cette information a l'editeur.
  pause
)
