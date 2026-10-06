// LA LISTE DES ÉLÈVES PORTE SON ENSEIGNANT PRINCIPAL
//
// Demande de THE GENIUS (01/10/2026) : la liste imprimée doit nommer le
// titulaire de la classe, comme le font déjà les bulletins et les procès-verbaux.
// Ce qui se vérifie ici, c'est le DOCUMENT — pas la fonction de libellé, déjà
// couverte par _headTeachers.test.mjs.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_studentListDoc.test.mjs
import { studentListHtml } from './studentListDoc.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const ECOLE = { id: 'e1', name: 'THE GENIUS', language: 'bilingue', country: 'cameroon' };

const CLASSES = [
  // Deux titulaires, secondaire francophone.
  { id: 'c1', name: '6eme',    level: '6ème',    system: 'FR', teacher_id: 't1', teacher2_id: 't2' },
  // Un seul titulaire, primaire francophone.
  { id: 'c2', name: 'CE1',     level: 'CE1',     system: 'FR', teacher_id: 't3' },
  // Deux titulaires, primaire anglophone.
  { id: 'c3', name: 'Class 3', level: 'Class 3', system: 'EN', teacher_id: 't1', teacher2_id: 't3' },
  // Aucun titulaire — l'état de 21 des 24 classes de l'école demandeuse.
  { id: 'c4', name: 'SIL',     level: 'SIL',     system: 'FR' },
];

const PROFS = [
  { id: 't1', name: 'MBARGA Paul' },
  { id: 't2', name: 'NGONO ép. MBALLA, Marie' },
  { id: 't3', name: 'ATANGANA Félicité' },
];

const eleve = (id, class_id, name) => ({ id, class_id, name, gender: 'Masculin' });
const ELEVES = [
  eleve('s1', 'c1', 'ZOUA Patrick'),
  eleve('s2', 'c2', 'KAMGA Larissa'),
  eleve('s3', 'c3', 'BIYA MVONDO Steve'),
  eleve('s4', 'c4', 'MEKA Sandra'),
];

const rendre = (o = {}) => studentListHtml({
  students: ELEVES, classes: CLASSES, teachers: PROFS, school: ECOLE, units: [], ...o,
});

const html = rendre();

// ── Le nom, et le libellé accordé au nombre ET au niveau ────────────────────
ok(html.includes('P. principaux : <strong>MBARGA Paul · NGONO ép. MBALLA, Marie</strong>'),
  '1. secondaire, deux titulaires : « P. principaux », les deux noms');
ok(html.includes('Enseignant(e) : <strong>ATANGANA Félicité</strong>'),
  '2. fondamental, un titulaire : « Enseignant(e) », pas « P. principal »');
ok(html.includes('Class teachers : <strong>MBARGA Paul · ATANGANA Félicité</strong>'),
  '3. classe anglophone : le libellé suit la CLASSE, pas la langue du document');

// ── Une classe sans titulaire n'imprime pas une ligne vide ──────────────────
const sectionSil = html.slice(html.indexOf('>SIL<'));
ok(!sectionSil.includes('class="class-teacher"'),
  '4. classe sans titulaire : aucune ligne, plutôt qu’un « P. principal : » vide');
ok((html.match(/class="class-teacher"/g) || []).length === 3,
  '5. une ligne par classe qui en a un, pas une de plus',
  (html.match(/class="class-teacher"/g) || []).length);

// ── La ligne appartient à SA classe ─────────────────────────────────────────
// Le groupe est bâti sur le nom de la classe ; si la classe se perdait en route,
// le titulaire du groupe suivant se retrouverait sous l'en-tête précédent.
const bloc6eme = html.slice(html.indexOf('>6eme<'), html.indexOf('>CE1<'));
ok(bloc6eme.includes('MBARGA Paul · NGONO ép. MBALLA, Marie') && !bloc6eme.includes('ATANGANA'),
  '6. chaque titulaire est sous l’en-tête de sa propre classe');

// ── Impression d'UNE classe (filtre) ────────────────────────────────────────
const uneClasse = rendre({ students: [ELEVES[0]], classFilter: 'c1' });
ok(uneClasse.includes('P. principaux : <strong>MBARGA Paul · NGONO ép. MBALLA, Marie</strong>'),
  '7. liste filtrée sur une classe : le titulaire y est aussi');

// ── Rien ne casse si l'école n'a pas encore d'enseignants ───────────────────
const sansProfs = rendre({ teachers: [] });
ok(!sansProfs.includes('class="class-teacher"'),
  '8. aucun enseignant enregistré : document inchangé, sans identifiant brut');
ok(sansProfs.includes('LISTE DES ÉLÈVES') && sansProfs.includes('ZOUA Patrick'),
  '9. … et le document reste complet');

// ── Guinée Équatoriale : document espagnol ──────────────────────────────────
const ge = rendre({ school: { ...ECOLE, country_system: 'guinea_eq' } });
ok(ge.includes('Titulares : <strong>MBARGA Paul · NGONO ép. MBALLA, Marie</strong>'),
  '10. document espagnol : libellé espagnol, y compris pour une classe « EN »');

console.log(`\n=== ${fail ? 'ÉCHEC' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
