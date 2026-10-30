#!/usr/bin/env bash
# Déploiement de la 0.3.26 sur le serveur LAN d'une école déjà appairée.
#
# POURQUOI UN SCRIPT ET PAS install.sh TOUT SEUL
# ──────────────────────────────────────────────
# `install.sh` remplace l'application et conserve /var/lib/notescam/data, mais il
# NE SAUVEGARDE PAS la base. Ici le service est arrêté AVANT la copie, la copie
# est consolidée (VACUUM INTO) et elle est VÉRIFIÉE. Une sauvegarde non vérifiée
# n'est pas une sauvegarde.
#
# CE QUE LA 0.3.26 CHANGE
# ───────────────────────
# ELLE NE FAIT QU UNE CHOSE : elle repare la page blanche que la 0.3.24 et la
# 0.3.25 provoquaient sur l ECRAN D ACCUEIL DE L ADMINISTRATEUR. Installez-la
# si vous avez l une de ces deux versions.
#
#   Le tableau par classe lisait le reglage d ecole (`school`) dans un
#   composant qui ne le recoit pas : une VARIABLE LIBRE, introduite le 26/10
#   en portant le barème du bulletin dans neuf fichiers. Au rendu, « school is
#   not defined », et React demonte tout l affichage. Tous les postes
#   tombaient, parce que tous ouvrent le meme ecran apres la connexion.
#
#   LA 0.3.25 NE LA CORRIGEAIT PAS : elle a seulement rendu la panne lisible,
#   et c est son ecran d erreur qui a donne le nom de la variable en une
#   minute, la ou deux heures de recherche n avaient rien donne.
#
#   Le barème se calcule desormais la ou `school` existe, et voyage avec la
#   ligne de statistiques. Un test colocalise refuse le retour de la faute
#   (src/components/dashboard/_variablesLibres.test.mjs).
#
# Tout le reste est identique a la 0.3.25, repris integralement ci-dessous.
# Elle porte TOUT ce que portait la 0.3.24 (jamais envoyée : construite le
# 26/10, remplacée par celle-ci le 27/10 avant tout envoi — NE PAS DISTRIBUER
# la 0.3.24), et elle y ajoute d'abord ceci :
#
#   0. UNE PANNE D'AFFICHAGE NE DONNE PLUS UNE PAGE BLANCHE.
#      Signalé le 27/10/2026 : « le logiciel ne s'ouvre pas après avoir entré
#      les informations de connexion, la page reste blanche, sur n'importe quel
#      poste ». La page de CONNEXION s'affichait — l'application démarrait donc,
#      et c'est le premier écran APRÈS la connexion qui tombait.
#
#      CETTE VERSION NE CORRIGE PAS CE DÉFAUT-LÀ : sa cause n'est pas établie.
#      Elle corrige ce qui le rendait indiagnosticable. L'application n'avait
#      AUCUN garde-fou de rendu, nulle part, et React démonte l'arbre entier
#      quand le rendu jette : il ne restait pas un mot, pas un bouton, pas un
#      code — rien à nous transmettre, et personne dans une école n'a de raison
#      de savoir ouvrir la console du navigateur.
#
#      L'écran affiche maintenant, en français : qu'il y a une panne, le message
#      d'erreur, LA VERSION QUE LE SERVEUR ANNONCE, un bouton « Copier » pour
#      nous envoyer le bloc par message, et deux sorties (recharger, revenir à la
#      connexion). Il NE VIDE AUCUN STOCKAGE et NE DÉCONNECTE PERSONNE : la file
#      de synchronisation hors ligne vit dans le navigateur du poste.
#
#      SI L'ÉCRAN BLANC EST TOUJOURS LÀ APRÈS CETTE MISE À JOUR, il sera désormais
#      BAVARD : demander la photo de l'écran, ou le bloc copié. C'est ce qui nous
#      manquait.
#
#   0 bis. L'ÉCRAN DES CLASSES NE PROMET PLUS UN BARÈME QU'IL NE TIENT PAS.
#      Le choix du système annonçait « EN — notes sur 100 » / « FR — notes sur
#      20 ». C'était faux dès qu'une classe anglophone notait sur /20 — le cas de
#      FORM1 et FORM2 : le réglage le plus visible de l'écran contredisait le
#      barème réellement appliqué. Il affiche le SOUS-SYSTÈME, qui est un fait ;
#      le barème se lit sur la fiche de la classe, d'où il vient (cf. point 3).
#
#   0 ter. UNE SEULE PAIRE DE BOUTONS D'ÉCHANGE PAR ÉCRAN DE SAISIE.
#      « Exporter mes notes (fichier) » / « Importer les notes d'un enseignant »
#      doublonnaient les boutons déjà présents en haut de l'écran. Retiré là ;
#      l'échange par fichier complet reste sur les écrans de saisie par
#      compétence, où il est seul.
#
# ET CE QUE LA 0.3.24 APPORTAIT, repris intégralement ci-dessous :
# La 0.3.25 ne touche NI au schéma de la base, NI à la synchronisation : aucune table,
# aucune colonne, aucun curseur. Il n'y a donc PAS de rattrapage à attendre, à la
# différence des 0.3.16, 0.3.19 et 0.3.23. C'est une version d'écrans et de
# bulletins. Elle contient tout ce que contenait la 0.3.23.
#
#   1. LES MATIÈRES ANGLOPHONES APPARAISSENT DANS LE COMPTE DE L'ENSEIGNANT.
#      Signalé par l'administration le 26/10/2026 : « c'est uniquement les
#      matières francophones qui apparaissent dans le compte enseignant ». En
#      classe bilingue, le référentiel porte les DEUX matières du couple de
#      traduction : « Mathematics » touchait la ligne anglaise par son nom ET la
#      ligne française par sa traduction officielle, et le départage se faisait
#      toujours pour le français. L'enseignant de la section anglaise se voyait
#      donc servir les matières de la section française. Le nom propre d'une
#      ligne passe désormais devant la TRADUCTION d'une autre. Rien ne change en
#      classe monolingue : la ligne anglaise n'existe pas, la traduction reste le
#      seul rapprochement possible et joue comme avant.
#
#   2. UNE MATIÈRE DÉCOCHÉE DANS LA CLASSE NE REVIENT PLUS.
#      Signalé le 26/10/2026 : « il y a les matières qu'on décoche dans classe, ça
#      revient toujours ». Relevé sur FORM1 et FORM2 : quatre doublons — ICT en
#      face de Computer Science, Literature in English en face de English
#      Literature, ML en face de Manual Labour, Français intensif en face de
#      French Language. Le bouton « Ajouter le programme manquant » comparait les
#      LIBELLÉS EXACTS : « ICT » n'étant pas « Computer Science », il la croyait
#      absente et la reproposait indéfiniment. Le rapprochement se fait
#      maintenant par ENSEIGNEMENT, sur des groupes de synonymes. Rien n'est
#      renommé ni supprimé : les doublons déjà posés restent à décocher une
#      dernière fois, et ils ne reviendront pas. ILS PORTENT 0 NOTE, c'est
#      vérifié — le décochage est donc sans perte.
#
#   3. LE BARÈME D'UN BULLETIN VIENT DE LA CLASSE, PLUS DE SA LANGUE.
#      Relevé le 26/10/2026 : FORM1 et FORM2 sont anglophones (matières saisies en
#      anglais, programme bilingue spécial, notes sur /20) mais portaient
#      `system = 'FR'` — leur bulletin sortait donc EN FRANÇAIS. Les basculer en
#      anglais sans ce correctif aurait multiplié chaque note par 5 : le barème se
#      déduisait de la LANGUE (/20 en français, /100 en anglais). Il se lit
#      désormais dans la classe (`grade_max`), et la langue ne sert plus que de
#      valeur par défaut. Les huit endroits qui le déduisaient de la langue — le
#      bulletin, la fiche élève, le portail parent, les rapports, le modèle PDF,
#      les deux blocs du tableau de bord — lisent la même règle.
#
#      CE QUE L'ÉCOLE DOIT FAIRE, et le logiciel ne peut pas le deviner : régler
#      FORM1 et FORM2 sur « anglais » ET sur un barème de 20, LES DEUX ENSEMBLE.
#      Leur `grade_max` vaut 100 aujourd'hui alors que leurs notes sont sur /20 :
#      laissé tel quel, leur bulletin sortirait sur /100. Si une séquence de la
#      classe est verrouillée, le changement est refusé — déverrouiller d'abord.
#
#   4. AU PRIMAIRE, UNE COLONNE OUVERTE À LA MAIN SE REFERME À LA MAIN.
#      Signalé le 26/10/2026, essayé sur « Practical » : « quand je change le
#      barème et que j'essaie de revenir à zéro, ça refuse ». C'était exact, et le
#      refus était MUET — le champ remettait l'ancienne valeur sans un mot. Un
#      critère que le barème national ignore (« Pratique » sur 1A, 1B et 2A) naît
#      à zéro : l'école pouvait l'ouvrir, jamais le refermer. Poser 0 signifie
#      désormais « pas de barème d'école ici » et rend la colonne au barème
#      officiel — donc fermée quand le national n'en a pas. Refermer une colonne
#      qui porte une saisie reste refusé, mais le refus est maintenant expliqué et
#      nomme les élèves à corriger.
#
#   5. LE CLASSEUR EXCEL DU RAPPORT DE CLASSE DIT CE QUE DIT LA FEUILLE IMPRIMÉE.
#      Signalé par l'informaticien le 26/10/2026, photo du papier à l'appui : « le
#      fichier importé sur Excel n'affiche pas tous les détails, comme celle
#      imprimée ». Il manquait l'en-tête (établissement, année, classe, période,
#      effectif, date), les chiffres de la classe, le BARÈME de chaque matière —
#      « SVT /20 » et non « SVT », ce qui rend deux colonnes indiscernables quand
#      les échelles diffèrent — et le tableau « Résultats par matière », qui
#      partait dans un second fichier. Les deux tableaux sont maintenant dans le
#      même classeur.
#
# ELLE PORTE AUSSI CE QUI A ÉTÉ CORRIGÉ DEPUIS LA 0.3.23
# ──────────────────────────────────────────────────────
#   6. LES LIGNES SANS DATE DESCENDENT ENFIN. C'est l'unique échec du journal
#      d'installation de la 0.3.23 : la descente écarte par construction les
#      lignes sans date de modification. Mesuré le 24/10/2026 : 60 dépenses et
#      10 des 11 écritures de caisse de GENIUS, et 4 215 notes par compétences
#      sur toute la plateforme. Le Cloud a été corrigé le 24/10/2026 ; ce paquet
#      ferme la seconde moitié (aucune ligne neuve ne repart sans date).
#      CONSÉQUENCE NORMALE : au prochain cycle, ~70 lignes descendent chez
#      GENIUS. Ce sont les leurs, pas des doublons — qu'ils ne ressaisissent rien.
#   7. LE COEFFICIENT DU PREMIER CYCLE compte vraiment : le chiffre saisi va
#      maintenant dans le référentiel, que le bulletin lit, et non seulement
#      dans la matière de la classe, qu'il ignore.
#   8. L'IMPORT ET L'EXPORT DU SECONDAIRE choisissent leur portée, comme le
#      premier cycle depuis la 0.3.23.
#   9. UN REFUS DE DROITS EST DIT EN FRANÇAIS dans la file de synchronisation,
#      et une écriture appartenant à un AUTRE établissement n'est plus comptée
#      comme un refus du serveur.
#  10. UNE DÉPENSE SANS LIGNE BUDGÉTAIRE N'EST PLUS INVISIBLE : les 60 dépenses
#      de GENIUS pendent au budget « Reprise de caisse 2025-2026 » sans
#      imputation, et l'écran les excluait trois fois.
#
# CE QUE LE SCRIPT NE FAIT PAS
# ───────────────────────────
#   • il ne supprime aucune base et ne réinitialise aucune file ;
#   • il ne refait aucun appairage et ne réécrit aucune clé ;
#   • il n'écrit aucune donnée métier ;
#   • il ne lance aucune synchronisation forcée.
#
# CRITÈRES D'ARRÊT. Le script s'arrête de lui-même, AVANT de toucher à
# l'application, si la sauvegarde n'est pas vérifiable. Après l'installation, il
# compare et rend un code de sortie non nul au moindre écart : le code ≠ 0 est le
# signal d'appeler l'éditeur, PAS de tenter une réparation.
#
# Usage, en root, depuis le dossier contenant l'archive :
#   sudo ./deploy-0.3.24.sh notescam-linux-x64-0.3.24.tar.gz
#
set -uo pipefail

ARCHIVE="${1:-}"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:$PORT"
DATA=/var/lib/notescam/data
DB="$DATA/notescam.db"
NODE=/opt/notescam/node/bin/node
VERSION=0.3.26

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
titre() { printf '\n=== %s ===\n' "$*"; }

ko=0
verifie() { # verifie "libellé" "obtenu" "attendu"
  if [[ "$2" == "$3" ]]; then vert "  PASS  $1 ($2)"
  else rouge "  FAIL  $1 — obtenu: '$2', attendu: '$3'"; ko=$((ko+1)); fi
}

[[ $EUID -eq 0 ]] || { rouge "À lancer en root : sudo $0 <archive.tar.gz>"; exit 1; }
[[ -f "$ARCHIVE" ]] || { rouge "Archive introuvable : $ARCHIVE"; exit 1; }
[[ -f "$DB" ]]      || { rouge "Base introuvable : $DB — ce script met à JOUR une installation existante."; exit 1; }

# Interroge la base SANS dépendre du paquet sqlite3 (souvent absent d'un serveur
# d'école). Le node embarqué sait le faire : `node:sqlite` est dans le runtime.
#
# ATTENTION AUX INDICES. Avec `node -e`, il n'y a PAS de chemin de script dans
# process.argv : le premier argument est argv[1]. Avec `node script.js`, c'est
# argv[2].
#
# Le JS passe par un heredoc : il contient des apostrophes, qui fermeraient
# prématurément une chaîne entre quotes simples dans le shell.
JS_LIRE="$(cat <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
for (const r of db.prepare(process.argv[2]).all()) console.log(Object.values(r).join('|'));
JS
)"
JS_COPIER="$(cat <<'JS'
// VACUUM INTO : copie COHÉRENTE d'une base en mode WAL, sans toucher la source.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
db.exec("VACUUM INTO '" + process.argv[2].replace(/'/g, "''") + "'");
JS
)"
sqf() { "$NODE" -e "$JS_LIRE" "$1" "$2" 2>/dev/null; }

COMPTAGES="SELECT (SELECT COUNT(*) FROM students) || '|' ||
                  (SELECT COUNT(*) FROM grades) || '|' ||
                  (SELECT COUNT(*) FROM fee_payments) || '|' ||
                  (SELECT COUNT(*) FROM budget_expenses) || '|' ||
                  (SELECT COUNT(*) FROM sync_outbox) AS c"

titre "0. État AVANT"
VER_AVANT="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null || echo '<serveur arrêté>')"
SCHOOL_AVANT="$(curl -fsS --max-time 5 "$BASE/api/pair/status" 2>/dev/null | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
echo "  version       : $VER_AVANT"
echo "  school_id     : ${SCHOOL_AVANT:-<non lu>}"
echo "  jeton d'école : $([[ -f "$DATA/server-token.key" ]] && echo présent || echo ABSENT)"

titre "1. Arrêt du service (avant la copie : une copie à chaud peut être déchirée)"
systemctl stop notescam
sleep 2
echo "  service : $(systemctl is-active notescam)"

titre "2. Sauvegarde VÉRIFIABLE de la base"
AVANT="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|depenses|file = $AVANT"
HORO="$(date +%Y%m%d%H%M%S)"
COPIE="$DATA/notescam.db.avant-$VERSION-$HORO"
"$NODE" -e "$JS_COPIER" "$DB" "$COPIE" \
  || { rouge "  La copie a échoué — RIEN n'a été modifié."; systemctl start notescam; exit 1; }
chown notescam:notescam "$COPIE" 2>/dev/null
echo "  copie : $COPIE ($(stat -c%s "$COPIE") octets)"

INTEG="$(sqf "$COPIE" "PRAGMA integrity_check")"
COPIE_CPT="$(sqf "$COPIE" "$COMPTAGES")"
verifie "integrity_check de la copie" "$INTEG" "ok"
verifie "comptages identiques dans la copie" "$COPIE_CPT" "$AVANT"
if [[ $ko -ne 0 ]]; then
  rouge "SAUVEGARDE NON VÉRIFIÉE — on s'arrête ici. L'application n'a PAS été touchée."
  systemctl start notescam
  exit 2
fi
vert "  Sauvegarde vérifiée. On peut installer."

# Lecture SEULE, pour savoir quoi dire à l'école à la fin. Cette version remet le
# curseur de descente à zéro : si la file est déjà engorgée, le rattrapage
# attendra derrière elle, et c'est le dédoublonnage qu'il faut faire d'abord.
titre "2 bis. État de la file de poussée (mesure, aucune écriture)"
FILE_TOTAL="$(sqf "$DB" "SELECT COUNT(*) FROM sync_outbox")"
FILE_DISTINCT="$(sqf "$DB" "SELECT COUNT(DISTINCT tablename || '|' || row_id) FROM sync_outbox")"
echo "  entrées ............. ${FILE_TOTAL:-<non lu>}"
echo "  pointeurs distincts . ${FILE_DISTINCT:-<non lu>}"
ENGORGEE=0
if [[ -n "${FILE_TOTAL:-}" && -n "${FILE_DISTINCT:-}" && "$FILE_DISTINCT" -gt 0 ]]; then
  if [[ "$FILE_TOTAL" -gt $(( FILE_DISTINCT * 3 )) && "$FILE_TOTAL" -gt 10000 ]]; then
    ENGORGEE=1
    jaune "  File ENGORGÉE : $FILE_TOTAL entrées pour $FILE_DISTINCT pointeurs utiles."
    jaune "  À traiter APRÈS cette mise à jour, avec son propre script :"
    jaune "      sudo ./dedoublonner-file-poussee.sh --simulation   # mesure seule"
    jaune "      sudo ./dedoublonner-file-poussee.sh"
    jaune "  Ce script-ci n'y touche pas."
  else
    vert "  PASS  file sans engorgement notable"
  fi
fi
APC_AVANT="$(sqf "$DB" "SELECT (SELECT COUNT(*) FROM apc_matieres) || '|' || (SELECT COUNT(*) FROM apc_classe_matieres)")"
echo "  matières APC | rattachements = ${APC_AVANT:-<non lu>}"

titre "3. Installation"
TMP="$(mktemp -d)"
tar xzf "$ARCHIVE" -C "$TMP" || { rouge "Archive illisible"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
DOSSIER="$(find "$TMP" -maxdepth 1 -type d -name 'notescam-linux-x64*' | head -1)"
[[ -d "$DOSSIER" ]] || { rouge "Contenu d'archive inattendu"; systemctl start notescam; rm -rf "$TMP"; exit 1; }
# Archive construite sous Windows : les .sh peuvent être en CRLF, et Linux refuse
# alors le shebang (« /usr/bin/env: 'bash\r' »). On normalise.
n=0
while IFS= read -r -d '' f; do
  if grep -qU $'\r' "$f" 2>/dev/null; then sed -i 's/\r$//' "$f"; n=$((n+1)); fi
done < <(find "$DOSSIER" -maxdepth 2 -name '*.sh' -type f -print0)
[[ $n -gt 0 ]] && echo "  (${n} script(s) normalisé(s) CRLF -> LF)"
chmod +x "$DOSSIER"/*.sh 2>/dev/null
( cd "$DOSSIER" && ./install.sh "$PORT" ) || { rouge "install.sh a échoué"; rm -rf "$TMP"; exit 1; }
rm -rf "$TMP"

titre "4. Ce que les 0.3.23 et 0.3.19 apportent est-il en place ?"
# Marqueurs choisis dans le code NEUF et vérifiés présents dans le bundle
# construit : des libellés d'interface, qui survivent à la minification là où les
# noms de fonctions non. Un paquet qui ne les porte pas est périmé, quelle que
# soit la version qu'il annonce.
DIST=/opt/notescam/app/dist/assets
SRV=/opt/notescam/app/server

# LE CORRECTIF QUI JUSTIFIE CETTE VERSION. Il n'ajoute AUCUN libellé : il ajoute
# l'identifiant de la matière à la clé des lignes d'élèves, ce qui force la
# reconstruction des cases de saisie. On le cherche donc par sa FORME —
# `${matiere}:${eleve.id}` — avec une expression régulière, parce que les noms de
# variables changent à chaque minification alors que la forme, elle, ne change
# pas. Vérifié sur le bundle construit avant livraison : deux occurrences, une
# par écran de saisie.
if grep -rqsE '\$\{[A-Za-z_$0-9]+\}:\$\{[A-Za-z_$0-9]+\.id\}' "$DIST"; then
  vert "  PASS  saisie : la clé de ligne porte la matière (la note ne peut plus changer de matière)"
else
  rouge "  FAIL  dist : la clé de ligne n'a PAS la matière — le défaut no 1 est TOUJOURS LÀ. N'allez pas plus loin."
  ko=$((ko+1))
fi
grep -rqsF '"francais","french"' "$DIST" \
  && vert "  PASS  matières : les paires de traduction sont séparées" \
  || { rouge "  FAIL  dist : une matière locale couvrirait encore les deux langues"; ko=$((ko+1)); }
grep -rqsF "Regional Delegation for the" "$DIST" \
  && vert "  PASS  en-tête : l'anglais officiel dit « for the <région> »" \
  || { rouge "  FAIL  dist : l'en-tête anglais n'est pas corrigé"; ko=$((ko+1)); }
# I16 : une matiere cochee dans la classe est RATTACHEE a son niveau. Le
# marqueur est une chaine de JOURNAL, qui survit a la minification la ou les
# noms de fonctions non. Sans ce rattachement, le chinois reste non saisissable
# en 5eme et en 6eme, alors qu il est coche dans la classe.
grep -rqsF "rattacherMatiereAuNiveau rattachement" "$DIST" \
  && vert "  PASS  matieres : une matiere cochee est rattachee au niveau de la classe" \
  || { rouge "  FAIL  dist : le rattachement au niveau est ABSENT - le chinois resterait non saisissable"; ko=$((ko+1)); }

# ── I19 : LE CONTROLE QUI DISTINGUE CETTE VERSION DE LA 0.3.22 ─────────────
#
# La 0.3.22 filtrait le referentiel par une requete « or » que le serveur de
# l ecole ne sait pas faire : la lecture du referentiel echouait ENTIEREMENT et
# l ecran restait sur « Chargement du referentiel APC... » pour toujours. Le
# marqueur du defaut est la chaine du filtre, qui ne doit plus etre la.
# C est un controle EN NEGATIF : trouver cette chaine veut dire qu on est en
# train d installer un paquet 0.3.22, et il faut s arreter.
grep -rqsF "school_id.is.null" "$DIST" \
  && { rouge "  FAIL  dist : le filtre « or » de la 0.3.22 est TOUJOURS LA - la saisie du premier cycle serait BLOQUEE. N installez pas ce paquet."; ko=$((ko+1)); } \
  || vert "  PASS  referentiel : plus aucun filtre que le serveur de l ecole ne sait pas faire"

# I19 bis : le rattachement ecrit avec la BONNE cle. apc_classe_matieres n a pas
# de colonne « id » : sans cible explicite, la base locale refusait l ecriture et
# le correctif ci-dessus (I16) ne pouvait pas aboutir.
grep -rqsF "classe_id,matiere_id" "$DIST" \
  && vert "  PASS  matieres : le rattachement vise la cle reelle (classe, matiere)" \
  || { rouge "  FAIL  dist : la cle du rattachement est ABSENTE - l ecriture serait refusee par la base locale"; ko=$((ko+1)); }

# I20 : l import de notes CHOISIT sa portee. MARQUEUR CORRIGE LE 2026-10-27 :
# l ancien cherchait « Une matière à la fois », un libelle que 5e407fb avait DEJA
# remplace quand la 0.3.23 est partie — le panneau offre desormais le choix entre
# tout le classeur et une seule matiere. Ce controle echouait donc a CHAQUE
# deploiement depuis la 0.3.23, sur un correctif bel et bien present : releve
# dans le journal de deploiement de l ecole le 27/10. Une fausse alerte
# discredite les quarante autres. On verifie les DEUX libelles du choix, vus
# dans le bundle construit avant livraison.
grep -rqsF "Toutes les matières du classeur" "$DIST" \
  && vert "  PASS  import : la portee « tout le classeur » est proposee" \
  || { rouge "  FAIL  dist : le choix de portee est ABSENT a l import"; ko=$((ko+1)); }
grep -rqsF "les autres colonnes du classeur sont ignorées" "$DIST" \
  && vert "  PASS  import : la portee « une seule matiere » ignore les colonnes voisines" \
  || { rouge "  FAIL  dist : l import prendrait encore TOUTES les colonnes du classeur"; ko=$((ko+1)); }

# LA RÈGLE DE CURSEUR, côté serveur. Sans elle, `cash_movements` naîtrait vide et
# resterait vide : c'est le contrôle qui protège les onze écritures de caisse.
grep -qF 'table entière' "$SRV/db.js" \
  && vert "  PASS  db.js : une TABLE neuve sur une table synchronisée remet le curseur à zéro" \
  || { rouge "  FAIL  db.js : la règle ne couvre que les COLONNES — le journal de caisse resterait vide"; ko=$((ko+1)); }
grep -qF 'TABLES_CREEES' "$SRV/db.js" \
  && vert "  PASS  db.js : les tables créées au démarrage sont bien relevées" \
  || { rouge "  FAIL  db.js : rien ne relève les tables créées — la règle ne peut pas se déclencher"; ko=$((ko+1)); }
grep -rqsF "Carnet détaillé" "$DIST" \
  && vert "  PASS  réglages : le bouton « Bulletin du primaire » est livré" \
  || { rouge "  FAIL  dist : « Carnet détaillé » introuvable — le bouton manquera"; ko=$((ko+1)); }
grep -rqsF "COMMUNIQUER EN FRANÇAIS ET EN ANGLAIS" "$DIST" \
  && vert "  PASS  carnet : les six regroupements officiels sont livrés" \
  || { rouge "  FAIL  dist : les regroupements du carnet sont ABSENTS"; ko=$((ko+1)); }
grep -rqsF "Travail académique" "$DIST" \
  && vert "  PASS  carnet : la ligne « Travail académique » est livrée" \
  || { rouge "  FAIL  dist : « Travail académique » ABSENT du carnet"; ko=$((ko+1)); }
grep -rqsF "rejoindront le domaine" "$DIST" \
  && vert "  PASS  matière maison : son classement est annoncé à la création" \
  || { rouge "  FAIL  dist : l'avis de classement est ABSENT"; ko=$((ko+1)); }
grep -rqsF "langue vivante" "$DIST" \
  && vert "  PASS  référentiel : le créneau « langue vivante » accueille la langue choisie" \
  || { rouge "  FAIL  dist : le créneau « langue vivante » est ABSENT — l'espagnol irait en « Autres »"; ko=$((ko+1)); }
grep -rqsF "ne sont pas couvertes par les matières cochées" "$DIST" \
  && vert "  PASS  saisie : ce que le périmètre de la classe écarte est ANNONCÉ" \
  || { rouge "  FAIL  dist : le filtre de périmètre serait invisible"; ko=$((ko+1)); }

titre "4 (0.3.26). Le correctif de CETTE version est-il dans le paquet ?"
# MARQUEUR NEGATIF, ET IL EST FIABLE — contrairement a ce qu on pourrait croire
# d un bundle minifie. La minification renomme les variables LOCALES, mais elle
# ne peut PAS renommer un global libre : elle ne sait pas ce qu il designe. La
# forme fautive « ...(school) » survit donc telle quelle. Verifie sur les deux
# archives livrables : le morceau Dashboard de la 0.3.25 en porte EXACTEMENT une,
# celui de la 0.3.26 aucune. C est l empreinte meme du defaut.
if ls "$DIST"/Dashboard-*.js >/dev/null 2>&1; then
  if grep -ohE '\([A-Za-z_$]*school\)' "$DIST"/Dashboard-*.js | grep -q .; then
    rouge "  FAIL  dist : le tableau de bord lit encore un « school » LIBRE — la page blanchira"
    ko=$((ko+1))
  else
    vert "  PASS  tableau de bord : plus aucune reference libre a « school »"
  fi
else
  rouge "  FAIL  dist : le morceau Dashboard est introuvable"; ko=$((ko+1))
fi
# Et le controle qui vaut tous les greps, parce que c est le chemin exact qui
# blanchissait :
jaune "  À FAIRE  ouvrez /app avec un compte ADMINISTRATEUR : le tableau de bord doit s'afficher"

titre "4 bis (0.3.25). Ce que la 0.3.25 apportait est bien là"
# Mêmes règles de choix que partout ici : des libellés d'interface, qui survivent
# à la minification là où les noms de fonctions non. Les trois marqueurs ci-dessous
# ont été vérifiés présents dans le bundle construit avant livraison.
grep -rqsF "L'application s'est arrêtée" "$DIST" \
  && vert "  PASS  écran : une panne d'affichage s'annonce au lieu de blanchir" \
  || { rouge "  FAIL  dist : le garde-fou est ABSENT — une panne redonnerait une page blanche muette"; ko=$((ko+1)); }
grep -rqsF "Détail de la panne" "$DIST" \
  && vert "  PASS  écran : le message d'erreur est AFFICHÉ et copiable" \
  || { rouge "  FAIL  dist : l'école n'aurait rien à nous transmettre"; ko=$((ko+1)); }
grep -rqsF "Chargement interrompu" "$DIST" \
  && vert "  PASS  écran : un morceau non téléchargé a sa propre phrase (rechargement)" \
  || { rouge "  FAIL  dist : un simple redémarrage serait signalé comme un défaut"; ko=$((ko+1)); }
# LE RETRAIT DE « EN — notes sur 100 » NE SE PROUVE PAS ICI, et il faut le dire :
# un libellé RETIRÉ de l'interface survit comme CLÉ dans les tables de traduction
# (src/lib/i18n_es.js, i18n_tr.js), donc un marqueur négatif échouerait alors que
# le correctif est bien là. Vérifié à la main dans ce bundle : plus aucun écran ne
# l'emploie. Son contrôle est à l'écran, et il est dans le VERDICT.

titre "4 ter (0.3.24). Ce que la 0.3.24 apportait est bien là"
# Mêmes règles de choix que ci-dessus : des libellés d'interface, qui survivent à
# la minification là où les noms de fonctions non. Les quatre marqueurs ci-dessous
# ont été vérifiés présents dans le bundle construit avant livraison.
grep -rqsF "0 referme la colonne" "$DIST" \
  && vert "  PASS  primaire : une colonne ouverte à la main peut être refermée (0)" \
  || { rouge "  FAIL  dist : le barème refuserait encore de revenir à zéro"; ko=$((ko+1)); }
grep -rqsF "Remise à zéro refusée" "$DIST" \
  && vert "  PASS  primaire : le refus de fermeture est EXPLIQUÉ et nomme les élèves" \
  || { rouge "  FAIL  dist : le refus serait encore muet"; ko=$((ko+1)); }
grep -rqsF "computer studies" "$DIST" \
  && vert "  PASS  matières : ICT = Computer Science (une décochée ne revient plus)" \
  || { rouge "  FAIL  dist : les groupes de synonymes sont ABSENTS - les doublons reviendraient"; ko=$((ko+1)); }
grep -rqsF "literature in english" "$DIST" \
  && vert "  PASS  matières : Literature in English = English Literature" \
  || { rouge "  FAIL  dist : le groupe de la littérature est ABSENT"; ko=$((ko+1)); }
grep -rqsF "Résultats par matière" "$DIST" \
  && vert "  PASS  rapport : le classeur Excel porte le second tableau" \
  || { rouge "  FAIL  dist : le classeur ne porterait toujours qu'un tableau"; ko=$((ko+1)); }
# Le barème du bulletin est une règle PURE : elle ne laisse aucun libellé derrière
# elle, donc aucun marqueur honnête ne peut la prouver dans un bundle minifié. Son
# contrôle est à faire à l'écran, et il est dans le VERDICT ci-dessous.

titre "4 quater. Le serveur local accepte-t-il les matières de l'école ?"
# Le garde-fou `guardReferentielNational` est le miroir, côté LAN, de la RLS du
# Cloud : il protège les lignes NATIONALES (school_id NULL) et ouvre les lignes
# de l'école. Sans ces deux tables dans sa liste ouverte, créer une matière
# échouerait ICI alors qu'elle passe au Cloud — exactement le défaut que cette
# version corrige.
grep -qF "apc_matieres: 'matière'" "$SRV/query.js" \
  && vert "  PASS  query.js ouvre apc_matieres aux lignes de l'école" \
  || { rouge "  FAIL  query.js : apc_matieres n'est pas ouverte — création de matière refusée en local"; ko=$((ko+1)); }
grep -qF "apc_classe_matieres: 'matière'" "$SRV/query.js" \
  && vert "  PASS  query.js ouvre apc_classe_matieres (le rattachement à la classe)" \
  || { rouge "  FAIL  query.js : apc_classe_matieres n'est pas ouverte — la matière ne s'attacherait pas"; ko=$((ko+1)); }
grep -qE "^ensureColumn\('apc_matieres', *'school_id'" "$SRV/db.js" \
  && vert "  PASS  db.js posera apc_matieres.school_id" \
  || { rouge "  FAIL  db.js : apc_matieres.school_id ne sera pas posée"; ko=$((ko+1)); }
grep -qE "^ensureColumn\('apc_classe_matieres', *'school_id'" "$SRV/db.js" \
  && vert "  PASS  db.js posera apc_classe_matieres.school_id" \
  || { rouge "  FAIL  db.js : apc_classe_matieres.school_id ne sera pas posée"; ko=$((ko+1)); }
grep -qF "prim_bulletin_mode" "$SRV/db.js" \
  && vert "  PASS  db.js posera schools.prim_bulletin_mode (le réglage du carnet)" \
  || { rouge "  FAIL  db.js : prim_bulletin_mode ne sera pas posée — le bouton ne retiendrait rien"; ko=$((ko+1)); }

titre "4 quinquies. Ce que la 0.3.18 apportait est toujours là"
grep -rqs "Classe bilingue" "$DIST" \
  && vert "  PASS  classes bilingues : la case est livrée" \
  || { rouge "  FAIL  dist : « Classe bilingue » introuvable — interface périmée"; ko=$((ko+1)); }
grep -rqs "Fusionner avec" "$DIST" \
  && vert "  PASS  classes bilingues : le choix de la classe jumelle est livré" \
  || { rouge "  FAIL  dist : « Fusionner avec » ABSENT — la fusion ne sera pas proposée"; ko=$((ko+1)); }
grep -rqs "student_fees_student_id_academic_year" "$DIST" \
  && vert "  PASS  frais : le rattrapage du doublon (élève, année) est livré" \
  || { rouge "  FAIL  dist : le rattrapage des frais est ABSENT — la file restera bloquée"; ko=$((ko+1)); }
grep -rqsF "academic_year/i" "$DIST" \
  && vert "  PASS  frais : le message SQLite du serveur local est reconnu" \
  || { rouge "  FAIL  dist : la détection SQLite est ABSENTE — correctif inerte ici"; ko=$((ko+1)); }

titre "4 sexies. Ce que la 0.3.17 apportait est toujours là"
grep -rqs "Exporter Excel" "$DIST" \
  && vert "  PASS  les exports s'annoncent en Excel" \
  || { rouge "  FAIL  dist : « Exporter Excel » introuvable — interface périmée"; ko=$((ko+1)); }
grep -rqs "seuls les classeurs Excel" "$DIST" \
  && vert "  PASS  l'import refuse ce qui n'est pas un classeur, avec son message" \
  || { rouge "  FAIL  dist : le refus « classeur Excel » est ABSENT"; ko=$((ko+1)); }
grep -rqs "Feuilles vues" "$DIST" \
  && vert "  PASS  bulletins du second cycle : l'import du classeur est livré" \
  || { rouge "  FAIL  dist : l'import des bulletins du second cycle est ABSENT"; ko=$((ko+1)); }
# Le dist livré doit être celui de CETTE construction : sinon l'école garderait
# l'ancienne interface par-dessus le nouveau serveur.
grep -q '"edition"[[:space:]]*:[[:space:]]*"lan"' /opt/notescam/app/dist/edition.json 2>/dev/null \
  && vert "  PASS  interface : build LAN estampillé ($(grep -o '"built_at"[^,}]*' /opt/notescam/app/dist/edition.json))" \
  || { rouge "  FAIL  dist/edition.json absent ou non-LAN — interface douteuse"; ko=$((ko+1)); }

titre "4 septies. Ce que la 0.3.16 avait débloqué est toujours là"
# Ces contrôles ne vérifient pas une nouveauté : ils gardent fermé ce qui a déjà
# coûté une intervention sur site. Un paquet qui les perd est un paquet périmé.
grep -q "'cash_movements'" "$SRV/syncVerify.js" \
  && vert "  PASS  syncVerify.js compare la caisse" \
  || { rouge "  FAIL  syncVerify.js : cash_movements ABSENTE"; ko=$((ko+1)); }
grep -q "'signalements'" "$SRV/syncVerify.js" \
  && vert "  PASS  syncVerify.js compare les signalements" \
  || { rouge "  FAIL  syncVerify.js : signalements ABSENTE"; ko=$((ko+1)); }
grep -q "rejected" "$SRV/cloudSync.js" \
  && vert "  PASS  cloudSync.js conserve les lignes refusées par le Cloud" \
  || { rouge "  FAIL  cloudSync.js : le mécanisme de refus est ABSENT"; ko=$((ko+1)); }
grep -q "TOMB_CHUNK" "$SRV/syncRepair.js" \
  && vert "  PASS  syncRepair.js découpe les lots de tombstones" \
  || { rouge "  FAIL  syncRepair.js : découpage ABSENT"; ko=$((ko+1)); }
grep -q "update_my_profile" "$SRV/rpc.js" \
  && vert "  PASS  écran « Mon profil » : les RPC sont présentes" \
  || { rouge "  FAIL  rpc.js : update_my_profile ABSENTE — le profil restera non modifiable"; ko=$((ko+1)); }
grep -q "guardReferentielNational" "$SRV/query.js" \
  && vert "  PASS  référentiel : le national est protégé, le reste est ouvert" \
  || { rouge "  FAIL  query.js : guardReferentielNational ABSENTE"; ko=$((ko+1)); }
grep -q "prim_competences_masques" "$SRV/db.js" \
  && vert "  PASS  « Modifier les compétences » : les tables de masques sont posées" \
  || { rouge "  FAIL  db.js : les tables de masques du référentiel sont ABSENTES"; ko=$((ko+1)); }
# La colonne de balance brute doit RESTER ABSENTE tant que la migration Cloud
# n'est pas passée : une colonne que le Cloud ignore fait refuser la poussée.
# Le motif vise une ligne ACTIVE, ancrée en début de ligne : db.js garde en
# commentaire les deux appels à rétablir le jour où la migration passera.
if grep -qE "^ensureColumn\('(budget_expenses|cash_movements)', *'source_balance_raw'" "$SRV/db.js"; then
  rouge "  FAIL  db.js poserait source_balance_raw — paquet périmé, NE PAS l'utiliser"; ko=$((ko+1))
else
  vert "  PASS  source_balance_raw n'est pas posée (migration Cloud en attente)"
fi

titre "5. Service et base APRÈS"
for _ in $(seq 1 40); do curl -fsS --max-time 2 "$BASE/" >/dev/null 2>&1 && break; sleep 1; done
verifie "service actif" "$(systemctl is-active notescam)" "active"
verifie "page d'accueil" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/")" "200"
VER_APRES="$(curl -fsS --max-time 5 "$BASE/api/version" 2>/dev/null)"
echo "  /api/version : $VER_APRES"
# Le numéro cherché vient de $VERSION. Dans deploy-0.3.16.sh ce motif était écrit
# en dur et cherchait « 0.3.15 » sous un message annonçant 0.3.16 : le contrôle
# passait au vert sur une installation RESTÉE en arrière. Une seule source
# désormais, et le message la cite.
if echo "$VER_APRES" | grep -q "${VERSION//./\\.}"; then
  vert "  PASS  version $VERSION annoncée"
else
  rouge "  FAIL  la version annoncée n'est pas $VERSION"; ko=$((ko+1))
fi

# LES COLONNES SONT-ELLES VRAIMENT LÀ ? Les contrôles 4 bis lisent le CODE ; ici
# on lit la BASE, après que le serveur a démarré et exécuté ses `ensureColumn`.
# C'est la seule preuve qui compte : du code qui pose une colonne et une colonne
# posée sont deux choses différentes.
titre "5 bis. Les colonnes (0.3.19) et les tables (0.3.23) sont-elles posées ?"
colonne() { # colonne <table> <colonne>
  if sqf "$DB" "PRAGMA table_info($1)" | grep -q "|$2|"; then
    vert "  PASS  $1.$2 est en base"
  else
    rouge "  FAIL  $1.$2 MANQUE — l'école ne pourra pas créer ses matières"; ko=$((ko+1))
  fi
}
colonne apc_matieres        school_id
colonne apc_classe_matieres school_id
colonne schools             prim_bulletin_mode

# Les CINQ tables de la 0.3.23. Du code qui crée une table et une table créée
# sont deux choses différentes : c'est la seule preuve qui compte.
table_posee() { # table_posee <table> <à quoi elle sert>
  if [[ -n "$(sqf "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$1'")" ]]; then
    vert "  PASS  table $1 en base ($2)"
  else
    rouge "  FAIL  table $1 MANQUE — $2"; ko=$((ko+1))
  fi
}
table_posee cash_movements           "le journal de caisse serait inaccessible"
table_posee referentiel_libelles     "les libellés de matières de l'école"
table_posee apc_competences_masques  "les compétences masquées par la classe"
table_posee prim_competences_masques "idem, primaire"
table_posee mat_domaines_masques     "idem, maternelle"

# LE CURSEUR A-T-IL ÉTÉ REMIS À ZÉRO ? C'est ce qui décide si les écritures de
# caisse du Cloud redescendront. Absent = remis à zéro.
#
# MAIS CE CONTRÔLE NE VAUT QUE SI LES TABLES VIENNENT DE NAÎTRE. Corrigé le
# 2026-10-24, après l'installation chez THE GENIUS : leur serveur venait de la
# 0.3.21, qui avait DÉJÀ créé les cinq tables et DÉJÀ remis le curseur à zéro à
# ce moment-là. Rien de neuf n'apparaissait donc, le curseur ne devait PAS être
# remis à zéro — et le script criait quand même. Une alarme qui se déclenche
# quand tout va bien finit par être ignorée le jour où elle a raison.
#
# La question est donc : le curseur porte-t-il DÉJÀ une position pour
# `cash_movements` ? Si oui, cette table a déjà été descendue au moins une fois,
# et un curseur non vide est l'état NORMAL.
CURSEUR="$(sqf "$DB" "SELECT value FROM sync_cursor WHERE name='pull_at'")"
if [[ -z "$CURSEUR" ]]; then
  vert "  PASS  curseur de descente remis à zéro — le prochain cycle ramènera la caisse"
elif echo "$CURSEUR" | grep -q 'cash_movements'; then
  vert "  PASS  curseur déjà positionné sur cash_movements (tables créées par une version antérieure)"
  # ── ET MAINTENANT LE CONTRÔLE QUI COMPTE VRAIMENT ──────────────────────
  # Un curseur en place ne dit RIEN de ce qui est arrivé. Mesuré chez THE
  # GENIUS le 2026-10-24 : dix des onze écritures de caisse du Cloud avaient
  # `updated_at` à NULL, et la descente écarte les lignes sans date — elles
  # étaient donc invisibles POUR TOUJOURS, curseur ou pas. On regarde donc la
  # table elle-même, et on le dit sans l'appeler un échec du déploiement :
  # la correction est côté Cloud, pas sur ce poste.
  CAISSE="$(sqf "$DB" "SELECT count(*) FROM cash_movements")"
  DEPENSES="$(sqf "$DB" "SELECT count(*) FROM budget_expenses")"
  jaune "  À COMPARER  journal de caisse : ${CAISSE:-0} écriture(s) · dépenses : ${DEPENSES:-0}"
  jaune "        Comparez ces deux comptes à ceux du Cloud. S'ils sont INFÉRIEURS,"
  jaune "        ce n'est pas ce déploiement : une ligne du Cloud sans 'updated_at'"
  jaune "        n'est JAMAIS envoyée (la descente écarte les lignes sans date), et"
  jaune "        aucune remise à zéro du curseur n'y change quoi que ce soit."
  jaune "        Relevé chez une école le 2026-10-24 : 10 écritures sur 11 et 60"
  jaune "        dépenses sur 60 étaient dans ce cas. La correction est côté Cloud."
  jaune "        Signalez-le à l'éditeur, et NE RESSAISISSEZ RIEN."
else
  rouge "  FAIL  curseur de descente TOUJOURS à '$CURSEUR' alors que les tables viennent de naître"
  rouge "        — la caisse resterait vide. Appelez l'éditeur."
  ko=$((ko+1))
fi

APRES="$(sqf "$DB" "$COMPTAGES")"
echo "  eleves|notes|versements|depenses|file = $APRES"
# La FILE peut légitimement varier (elle se vide ou s'alimente). Les quatre
# premiers comptages, eux, ne doivent pas DIMINUER : une mise à jour n'efface
# aucune donnée.
for i in 1 2 3 4; do
  a="$(echo "$AVANT" | cut -d'|' -f$i)"; b="$(echo "$APRES" | cut -d'|' -f$i)"
  nom="$(echo "eleves notes versements depenses" | cut -d' ' -f$i)"
  if [[ "$b" -lt "$a" ]]; then rouge "  FAIL  $nom : $a -> $b (DIMINUTION)"; ko=$((ko+1));
  else vert "  PASS  $nom : $a -> $b"; fi
done
verifie "integrity_check de la base vive" "$(sqf "$DB" "PRAGMA integrity_check")" "ok"
verifie "jeton d'école toujours présent" "$([[ -f "$DATA/server-token.key" ]] && echo oui || echo non)" "oui"
SCHOOL_APRES="$(curl -fsS --max-time 5 "$BASE/api/pair/status" 2>/dev/null | grep -o '"schoolId":"[^"]*"' | cut -d'"' -f4)"
if [[ -n "$SCHOOL_AVANT" ]]; then verifie "school_id inchangé" "$SCHOOL_APRES" "$SCHOOL_AVANT"
else echo "  school_id après installation : ${SCHOOL_APRES:-<vide>}"; fi
APC_APRES="$(sqf "$DB" "SELECT (SELECT COUNT(*) FROM apc_matieres) || '|' || (SELECT COUNT(*) FROM apc_classe_matieres)")"
echo "  matières APC | rattachements : ${APC_AVANT:-<non lu>} -> ${APC_APRES:-<non lu>}"

titre "VERDICT"
if [[ $ko -eq 0 ]]; then
  vert "Toutes les vérifications locales sont PASS."
  echo
  jaune "CETTE VERSION NE TOUCHE NI AU SCHÉMA NI À LA SYNCHRONISATION."
  echo "Aucune table, aucune colonne, aucun curseur remis à zéro : il n'y a PAS de"
  echo "rattrapage à attendre, contrairement aux 0.3.16, 0.3.19 et 0.3.23. Si un long"
  echo "rattrapage démarre quand même, c'est un reste de la version précédente."
  echo
  jaune "TROIS CHOSES À FAIRE AVEC L'ÉCOLE, ET LE LOGICIEL NE PEUT PAS LES DEVINER :"
  echo "1. FORM1 et FORM2 : les régler sur l'anglais ET sur un barème de 20, LES DEUX"
  echo "   ENSEMBLE (Classes -> Modifier la classe). Leur barème vaut 100 aujourd'hui"
  echo "   alors que leurs notes sont sur /20 : si on ne corrige que la langue, leur"
  echo "   bulletin sortira sur /100. Si une séquence est verrouillée, le changement"
  echo "   est refusé — déverrouiller d'abord."
  echo "2. Les quatre doublons de FORM1/FORM2 (Computer Science, English Literature,"
  echo "   Manual Labour / ML, French Language) sont à décocher une DERNIÈRE fois."
  echo "   Ils portent 0 note, le décochage ne perd rien, et ils ne reviendront plus."
  echo "   C'est l'école qui dit lequel du couple elle garde."
  echo "3. Citizenship et History de FORM1/FORM2 sont saisies sur /100 alors que le"
  echo "   reste de la classe est sur /20. À remettre à 20 dans les matières de la"
  echo "   classe, sinon ces deux colonnes resteront hors échelle."
  if [[ "$ENGORGEE" -eq 1 ]]; then
    echo
    jaune "LA FILE DE POUSSÉE EST ENGORGÉE (voir l'étape 2 bis)."
    echo "Le rattrapage attendra derrière elle. Dédoublonnez-la, avec son script :"
    echo "    sudo ./dedoublonner-file-poussee.sh --simulation   # mesure seule"
    echo "    sudo ./dedoublonner-file-poussee.sh"
  fi
  echo
  echo "À vérifier depuis un poste de l'école, après un Ctrl+Shift+R :"
  echo "  · LE CONTRÔLE DE CETTE VERSION. Ouvrez le compte d'un enseignant de la"
  echo "    section ANGLAISE d'une classe bilingue : ses matières sont en anglais,"
  echo "    plus celles de la section française."
  echo "  · Classes -> FORM2 -> Matières : décochez un doublon, enregistrez, revenez."
  echo "    Il ne doit PAS être revenu, et « Ajouter le programme manquant » ne doit"
  echo "    plus le proposer."
  echo "  · LE BARÈME, une fois FORM1/FORM2 réglées en anglais ET sur 20 : leur"
  echo "    bulletin sort en ANGLAIS et sur /20. Comparez une note du bulletin à la"
  echo "    note saisie : elles doivent être IDENTIQUES, pas multipliées par 5. Et la"
  echo "    même moyenne doit s'afficher sur la fiche de l'élève et au tableau de"
  echo "    bord — c'est le point qui prouve que les huit écrans lisent la même règle."
  echo "  · Primaire -> saisie par compétence : posez un barème sur « Pratique »,"
  echo "    puis remettez 0. La colonne doit se refermer et reprendre son repère « à"
  echo "    définir ». Avec une note dans la colonne, le refus doit être AFFICHÉ et"
  echo "    nommer l'élève."
  echo "  · Rapports -> un rapport de classe -> export Excel : le classeur porte"
  echo "    l'en-tête, les chiffres de la classe, « Matière /barème » et le tableau"
  echo "    « Résultats par matière » dans le MÊME fichier."
  echo "  · Les notes déjà saisies sont toujours là. Cette version change ce qui"
  echo "    s'AFFICHE et ce qu'on peut RÉGLER ; le seul chiffre qui bouge est celui"
  echo "    des classes dont le barème n'était pas respecté."
  exit 0
else
  rouge "$ko contrôle(s) en échec."
  echo "N'essayez RIEN d'autre : envoyez cette sortie complète à l'éditeur."
  echo "La sauvegarde vérifiée est dans : $COPIE"
  exit 3
fi
