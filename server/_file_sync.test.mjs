// Test — RÉPLICATION DES FICHIERS LAN → Cloud (server/fileSync.js).
//
// Incident terrain (GENIUS, octobre 2026) : 79 photos d'élèves référencées au
// Cloud, ZÉRO présente dans le bucket. La synchro répliquait les LIGNES mais pas
// les FICHIERS — les deux stockages n'ont jamais été réconciliés. Les écoles nées
// dans le Cloud n'avaient pas le problème (leur navigateur téléverse directement),
// ce qui a masqué le défaut pendant des mois.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'nc-fsync-'));
process.env.NOTESCAM_DATA_DIR = DATA;
process.env.NOTESCAM_FILES_DIR = join(DATA, 'files');
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db, FILES_DIR } = await import('./db.js');
const { repliquerFichiers, aMonter } = await import('./fileSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

const ECOLE = '6b68407b-3d2e-426b-81ff-c4e68e66120a';
const dossier = join(FILES_DIR, 'school-assets', ECOLE, 'students');
mkdirSync(dossier, { recursive: true });

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run(ECOLE, 'GENIUS');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('cA', ECOLE, '6eme');
const eleve = (id, fichier) => {
  db.prepare('INSERT INTO students (id, school_id, class_id, name, photo_url) VALUES (?,?,?,?,?)')
    .run(id, ECOLE, 'cA', id, fichier ? `/files/school-assets/${ECOLE}/students/${fichier}?v=1` : null);
};
const ecrire = (nom, contenu) => writeFileSync(join(dossier, nom), contenu);

eleve('e1', 'a.jpg'); ecrire('a.jpg', 'AAA');          // à monter
eleve('e2', 'b.jpg'); ecrire('b.jpg', 'BBB');          // à monter
eleve('e3', 'c.jpg'); ecrire('c.jpg', 'CCC');          // DÉJÀ au cloud
eleve('e4', 'perdu.jpg');                               // référencé, absent du disque
eleve('e5', 'vide.jpg'); ecrire('vide.jpg', '');        // fichier vide
eleve('e6', null);                                      // sans photo
ecrire('orphelin.jpg', 'ZZZ');                          // sur disque, non référencé

const cheminCloud = `${ECOLE}/students/c.jpg`;
const televerses = [];
const demandes = [];
const edge = async (body) => {
  if (body.action === 'inventory') return { files: [{ path: cheminCloud, size: 3 }] };
  if (body.action === 'upload-url') { demandes.push(body.path); return { signedUrl: `https://sign/${body.path}`, token: 't' }; }
  throw new Error('action ' + body.action);
};
const televerse = async (url, contenu, mime) => { televerses.push({ url, taille: contenu.length, mime }); };

// ── Plan, sans rien téléverser ────────────────────────────────────────────────
{
  const p = aMonter([{ path: cheminCloud }]);
  // 'perdu.jpg' est référencé mais absent du disque : il n'est PAS planifié —
  // le téléverser est impossible, et il est compté à part (assertion 4).
  ok(p.manquants.length === 3, '1. seuls les fichiers réellement présents sont planifiés', p.manquants);
  ok(!p.manquants.includes(cheminCloud), '2. celui déjà présent au Cloud n\'est pas replanifié', p.manquants);
  ok(!p.manquants.some((x) => x.endsWith('orphelin.jpg')), '3. un orphelin du disque ne monte JAMAIS (bande passante)', p.manquants);
  ok(p.absentsDuDisque === 1, '4. la référence sans fichier local est comptée, pas téléversée', p.absentsDuDisque);
}

// ── Cycle réel ────────────────────────────────────────────────────────────────
const r = await repliquerFichiers({ edge, televerse });
ok(r.montes === 2, '5. seuls les fichiers réellement présents et non vides montent', r);
const noms = televerses.map((t) => t.url.split('/').pop());
ok(noms.includes('a.jpg') && noms.includes('b.jpg'), '6. ce sont bien a.jpg et b.jpg', noms);
ok(televerses.every((t) => t.mime === 'image/jpeg'), '7. le type MIME est déduit de l\'extension', televerses);
ok(r.ignores.some((i) => i.motif === 'fichier_vide'), '8. un fichier VIDE est écarté (n\'écrase pas une copie valable)', r.ignores);
ok(r.absentsDuDisque === 1, '9. la référence sans fichier local est signalée dans le rapport', r.absentsDuDisque);
ok(demandes.every((p) => p.startsWith(`${ECOLE}/`)), '10. chaque URL demandée est dans le dossier de l\'école', demandes);

// ── Idempotence : un second cycle ne remonte rien ────────────────────────────
{
  const edge2 = async (body) => {
    if (body.action === 'inventory') return { files: [{ path: cheminCloud }, { path: `${ECOLE}/students/a.jpg` }, { path: `${ECOLE}/students/b.jpg` }] };
    if (body.action === 'upload-url') return { signedUrl: 'https://sign/x', token: 't' };
    throw new Error('x');
  };
  const avant = televerses.length;
  const r2 = await repliquerFichiers({ edge: edge2, televerse });
  ok(r2.montes === 0 && televerses.length === avant, '11. second cycle : rien n\'est retéléversé', r2);
}

// ── Bornage : une école très en retard ne sature pas sa connexion ────────────
{
  for (let i = 0; i < 10; i++) { eleve('x' + i, `x${i}.jpg`); ecrire(`x${i}.jpg`, 'X'); }
  const r3 = await repliquerFichiers({ edge, televerse, maxParCycle: 3 });
  // La borne porte sur les fichiers TRAITÉS, pas seulement téléversés : 'vide.jpg'
  // consomme une place du lot puis est écarté. C'est voulu — c'est le coût d'examen
  // qu'on borne, pas le nombre de succès.
  ok(r3.montes + r3.ignores.length === 3, '12. au plus maxParCycle fichiers TRAITÉS par cycle', { m: r3.montes, i: r3.ignores.length });
  ok(r3.restants > 0, '13. le reliquat est annoncé, pas oublié', r3.restants);
}

// ── Best-effort : une panne de fichiers ne casse jamais la synchro ───────────
{
  const edgeKo = async () => { throw new Error('reseau indisponible'); };
  const r4 = await repliquerFichiers({ edge: edgeKo, televerse });
  ok(r4.montes === 0 && r4.erreurs.length === 1, '14. panne réseau : rapport d\'erreur, aucune exception', r4);
}
{
  const televerseKo = async (url) => { if (url.endsWith('a.jpg')) throw new Error('503'); televerses.push({ url }); };
  const r5 = await repliquerFichiers({ edge, televerse: televerseKo, maxParCycle: 50 });
  ok(r5.erreurs.length >= 1 && r5.montes >= 1, '15. un fichier en échec n\'arrête pas le lot', { e: r5.erreurs.length, m: r5.montes });
}

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
