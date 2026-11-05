// RETIRER UN CRITÈRE NE LE RETIRE QUE POUR LA CLASSE **ET LA COMPÉTENCE** EN COURS
// — garde-fou de CODE.
//
// Deux demandes du 2026-11-05. Le geste « Critères évalués → retirer » écrivait d'abord un masque
// d'ÉCOLE (« Pratique » retiré en CE1 disparaissait en CM2), puis un masque de CLASSE (« retiré à une
// compétence, ça masque pour toute la classe »). Il écrit maintenant (classe, compétence, critère).
//
// Le store parle au réseau : on garde ici le CÂBLAGE. Le calcul est tenu par
// core/_primCriteresClasse.test.mjs, et le chemin du serveur d'école par
// server/_criteres_classe_masques.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ws = lire('../components/grades/PrimCompetenceWorkspace.jsx');

test('le geste de l’écran ne touche plus le masque d’ÉCOLE pour retirer un critère', () => {
  assert.doesNotMatch(ws, /onMasquer=\{\(l\) => removeRef\('prim_crit'/);
  assert.doesNotMatch(ws, /onSupprimer=\{\(l\) => removeRef\('prim_crit'/);
  assert.match(ws, /onMasquer=\{masquerCritere\}/);
  assert.match(ws, /onSupprimer=\{masquerCritere\}/);
  assert.match(ws, /masquerCritereClasse\(classId, competenceId, l\.id\)/);
});

test('réafficher : un masque d’école déjà posé reste un geste d’école, le reste est par compétence', () => {
  assert.match(ws, /\(masquesCritEcole \|\| \[\]\)\.includes\(l\.id\)\) \{ await restoreRef\('prim_crit', l\.id\)/);
  assert.match(ws, /restaurerCritereClasse\(classId, competenceId, l\.id\)/);
});

test('tant que la table du Cloud n’existe pas, on refuse au lieu de masquer pour toute l’école', () => {
  assert.match(ws, /la mise à jour du Cloud doit d’abord être appliquée/);
  const store = lire('./schoolStore.js');
  assert.match(store, /masquerCritereClasse: async \(classId, competenceId, critereId\)/);
  assert.match(store, /if \(!\(await setCritereMasqueClasse\(schoolId, classId, competenceId, critereId, true\)\)\) return \{ error: 'refus' \};/);
  // Et le service écrit bien la compétence dans la clé, des deux côtés du geste.
  const svc = lire('../lib/referentielEcole.js');
  assert.match(svc, /onConflict: 'school_id,class_id,competence_id,critere_id'/);
  assert.match(svc, /\.eq\('competence_id', competenceId\)\.eq\('critere_id', critereId\)/);
  assert.match(svc, /select\('class_id, competence_id, critere_id'\)/);
});

test('AVANT D’AGIR, l’écran dit la portée du geste et le nombre de notes concernées', () => {
  // La phrase doit nommer la compétence ET la classe, et promettre que rien n’est supprimé.
  assert.match(ws, /messageMasque=\{messageMasqueCritere\}/);
  assert.match(ws, /const messageMasqueCritere = \(l, n\) => t\(/);
  assert.match(ws, /SANS être supprimées/);
  assert.match(ws, /nbNotes=\{\(l\) => notesParCritere\[l\.id\] \|\| 0\}/);
  // Le compte est celui de CETTE classe et de CETTE compétence, pas celui de l’école.
  assert.match(ws, /notesDuCritere\(primNotes, ids, competenceId, cr\.id\)/);
  // L’INFOBULLE du « × » aussi : « Masquer dans cette école » est devenu faux pour les
  // critères du primaire, et un survol qui annonce trop large fait renoncer à un geste juste.
  // `includes` plutôt qu'une expression régulière : le texte cherché est plein de
  // parenthèses et d'accolades, et l'échapper trois fois est le plus court chemin
  // vers un banc qui se croit vert.
  assert.ok(ws.includes('titreMasquer={() => t('), 'la saisie passe son infobulle');
  assert.match(ws, /Retirer en \$\{nomCompetence\(\)\}, pour cette classe seulement/);
  // Et l’éditeur sait recevoir ces phrases sans les imposer aux autres écrans.
  const editeur = lire('../components/grades/ReferentielEditor.jsx');
  assert.match(editeur, /messageMasque = null,/);
  assert.match(editeur, /titreMasquer = null,/);
  assert.ok(editeur.includes("titreMasquer?.() || t('Masquer dans cette école'"),
    'l’éditeur retombe sur sa phrase par défaut pour les écrans dont le masque EST celui de l’école');
});

test('bulletin, rapport de classe et PV reçoivent un RÉSOLVEUR, pas une liste plate', () => {
  for (const f of ['../pages/Bulletins.jsx', '../pages/Reports.jsx', '../components/documents/PvWorkspace.jsx']) {
    const src = lire(f);
    assert.match(src, /resolveurCriteresMasques\(primCriteresMasquesEcole, primCritParClasse, classId\)/, f);
    assert.doesNotMatch(src, /criteresMasquesPourClasse\(primCriteresMasquesEcole, primCritParClasse, classId\)/, f);
  }
  // La saisie, elle, travaille sur UNE compétence : elle a la liste, et le résolveur pour
  // la feuille imprimée qui parcourt les onze.
  assert.match(ws, /criteresMasquesPourClasse\(masquesCritEcole, critParClasse, classId, competenceId\)/);
  assert.match(ws, /resolveurCriteresMasques\(masquesCritEcole, critParClasse, classId\)/);
  // Et le moteur accepte l’un comme l’autre.
  assert.match(lire('../core/primEngine.js'), /typeof masques === 'function' \? \(masques\(competenceId\) \|\| \[\]\) : \(masques \|\| \[\]\)/);
});

test('l’ORDRE des déclarations : les masques sont calculés APRÈS `competenceId`', () => {
  // Relevé sur l’écran réel le 2026-11-05 : le tableau de dépendances d’un useMemo est
  // évalué à sa ligne. Placé au-dessus du useState, il lève « Cannot access 'P' before
  // initialization » et la page reste blanche — invisible au build comme aux bancs de texte.
  const iEtat = ws.indexOf('const [competenceId, setCompetenceId] = useState');
  const iMasques = ws.indexOf('const masquesCrit = useMemo');
  const iResolveur = ws.indexOf('const masquesCritPour = useMemo');
  const iEleves = ws.indexOf('const classStudents = useMemo');
  const iNotes = ws.indexOf('const notesParCritere = useMemo');
  assert.ok(iEtat > 0 && iMasques > iEtat, `masquesCrit (${iMasques}) doit suivre competenceId (${iEtat})`);
  assert.ok(iResolveur > iEtat, `masquesCritPour (${iResolveur}) doit suivre competenceId (${iEtat})`);
  assert.ok(iEleves > 0 && iNotes > iEleves, `notesParCritere (${iNotes}) doit suivre classStudents (${iEleves})`);
});

test('le chargement lit aussi les masques par classe (et ne masque rien en cas d’échec)', () => {
  const store = lire('./schoolStore.js');
  assert.match(store, /if \(kind === 'prim_crit'\) \{\n\s+const parClasse = await fetchCriteresMasquesClasse\(schoolId\);/);
  assert.match(store, /else set\(\{ criteresMasquesClasseDispo: false \}\);/);
});

test('la migration Cloud, la table LAN et la liste des tables autorisées portent la compétence', () => {
  const sql = lire('../../supabase_prim_criteres_classe_masques.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.prim_criteres_classe_masques/);
  assert.match(sql, /PRIMARY KEY \(school_id, class_id, competence_id, critere_id\)/);
  // Une ancienne forme non vide doit ARRÊTER la migration, pas être devinée.
  assert.match(sql, /RAISE EXCEPTION 'prim_criteres_classe_masques existe SANS competence_id/);
  const lan = lire('../../server/schema.sql');
  assert.match(lan, /CREATE TABLE IF NOT EXISTS prim_criteres_classe_masques/);
  assert.match(lan, /PRIMARY KEY \(school_id, class_id, competence_id, critere_id\)/);
  assert.match(lire('../../server/db.js'), /'prim_criteres_classe_masques',/);
});

test('MASQUER NE SUPPRIME RIEN : aucun effacement de note sur ce chemin', () => {
  const store = lire('./schoolStore.js');
  const bloc = store.slice(store.indexOf('masquerCritereClasse: async'),
    store.indexOf('masquerCompetenceClasse: async'));
  assert.doesNotMatch(bloc, /prim_notes/);
  assert.doesNotMatch(bloc, /delete|supprim/i);
  // Le SQL le dit à l'école, en toutes lettres.
  assert.match(lire('../../supabase_prim_criteres_classe_masques.sql'), /Les notes déjà saisies RESTENT EN BASE/);
});
