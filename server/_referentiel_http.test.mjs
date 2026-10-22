// LE GESTE DE L'ÉCRAN, SUR LE VRAI SERVEUR, EN HTTP.
//
// Pourquoi ce test EN PLUS de _referentiel_ecole.test.mjs : celui-là appelle
// `runQuery` en direct, donc il prouve que la base accepte l'écriture — pas que
// l'écran y arrive. Entre les deux il y a tout ce qui a déjà bloqué dans ce
// produit : la liste blanche des tables de /api/db, le jeton, les gardes de
// périmètre, la forme des filtres envoyés par localClient.js.
//
// Ce test rejoue donc les QUATRE gestes de « Modifier les compétences » tels que
// le navigateur les envoie, sur un serveur Fastify démarré pour de vrai :
//   1. ajouter une compétence à soi       (upsert apc_competences, school_id posé)
//   2. renommer SA compétence             (upsert sur le même id)
//   3. renommer une compétence OFFICIELLE (upsert referentiel_libelles)
//   4. masquer une compétence OFFICIELLE  (upsert apc_competences_masques)
// puis le geste du PRIMAIRE qui restait en file à chaque tentative :
//   5. poser un barème sur une colonne vide (upsert prim_notes sur la clé UA)
//
// Lancer : node server/_referentiel_http.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-ref-http-'));
const PORT = 8137;
const BASE = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

async function waitReady(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log serveur:\n' + srvLog.slice(-1500));
}

let token = '';
const db = (op) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(op),
}).then((r) => r.json());

try {
  await waitReady();

  const sign = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dir@ecole.test', password: 'secret123', full_name: 'Directeur' }),
  }).then((r) => r.json());
  token = sign?.data?.session?.access_token || '';
  ok(!!token, 'session ouverte (comme à la connexion de l’école)', token ? '(token)' : sign);

  const SCHOOL = 'sch-ref';
  await db({ table: 'schools', action: 'insert', values: { id: SCHOOL, name: 'École Test' } });
  await db({ table: 'school_users', action: 'insert', values: {
    id: 'su-dir', school_id: SCHOOL, user_id: sign?.data?.user?.id, role: 'admin', active: 1,
  } });
  await db({ table: 'classes', action: 'insert', values: {
    id: 'cls-cm2', school_id: SCHOOL, name: 'CM2', level: 'CM2', current_year: '2025-2026',
  } });
  await db({ table: 'students', action: 'insert', values: {
    id: 'stu-1', school_id: SCHOOL, class_id: 'cls-cm2', name: 'Élève Un',
  } });

  // La compétence officielle sur laquelle l'école travaille, lue comme l'écran
  // la lit : par /api/db, pas en touchant le fichier de base.
  const refLu = await db({ table: 'apc_competences', action: 'select',
    columns: 'id,cycle_id,classe_id,trimestre_id,matiere_id,intitule', filters: [] });
  const NAT = (refLu.data || [])[0];
  ok(!!NAT, 'le référentiel officiel se lit par l’API', refLu.error || `${(refLu.data || []).length} ligne(s)`);

  // ── 1. « Ajouter » ────────────────────────────────────────────────────────
  const ajout = await db({ table: 'apc_competences', action: 'upsert', onConflict: 'id', values: {
    id: 'cmp-maison', school_id: SCHOOL, cycle_id: NAT.cycle_id, classe_id: NAT.classe_id,
    trimestre_id: NAT.trimestre_id, matiere_id: NAT.matiere_id, ordre: 900,
    intitule: 'Competence ajoutee par l ecole', actif: 1,
  } });
  ok(!ajout.error, 'AJOUTER une compétence à soi', ajout.error);

  // ── 2. « Enregistrer » sur sa propre ligne ───────────────────────────────
  const renomme = await db({ table: 'apc_competences', action: 'upsert', onConflict: 'id', values: {
    id: 'cmp-maison', school_id: SCHOOL, cycle_id: NAT.cycle_id, classe_id: NAT.classe_id,
    trimestre_id: NAT.trimestre_id, matiere_id: NAT.matiere_id, ordre: 900,
    intitule: 'Intitule corrige par l ecole', actif: 1,
  } });
  ok(!renomme.error, 'ENREGISTRER la modification de sa compétence', renomme.error);
  const relu = await db({ table: 'apc_competences', action: 'select', columns: '*', single: true,
    filters: [{ op: 'eq', col: 'id', val: 'cmp-maison' }] });
  ok(relu?.data?.intitule === 'Intitule corrige par l ecole',
    'le nouvel intitulé survit à la relecture serveur', relu?.data?.intitule);

  // ── 3. « Enregistrer » sur une ligne officielle = surcharge de libellé ───
  const surcharge = await db({ table: 'referentiel_libelles', action: 'upsert',
    onConflict: 'school_id,kind,item_id', values: {
      school_id: SCHOOL, kind: 'apc', item_id: NAT.id,
      intitule: 'Notre formulation', maj_le: new Date().toISOString(),
    } });
  ok(!surcharge.error, 'ENREGISTRER le renommage d’une compétence OFFICIELLE', surcharge.error);
  const libs = await db({ table: 'referentiel_libelles', action: 'select', columns: 'item_id,intitule',
    filters: [{ op: 'eq', col: 'school_id', val: SCHOOL }, { op: 'eq', col: 'kind', val: 'apc' }] });
  ok(libs?.data?.[0]?.intitule === 'Notre formulation',
    'l’écran relira bien ce libellé au prochain chargement', libs?.data);

  // ── 3 bis. LE GESTE EXACT DE LA CAPTURE DU 28/09 ─────────────────────────
  // « Compétences du primaire » → renommer « 1A Communiquer en français » →
  // Enregistrer. C'est une ligne OFFICIELLE du PRIMAIRE : même mécanisme que
  // l'APC ci-dessus, mais `kind = 'prim'` — et c'est ce libellé-là qui revenait
  // « Enregistrement refusé par le serveur ».
  const cmpPrim = await db({ table: 'prim_competences', action: 'select', columns: 'id,code,intitule', filters: [] });
  const PRIM = (cmpPrim.data || [])[0];
  const renomPrim = await db({ table: 'referentiel_libelles', action: 'upsert',
    onConflict: 'school_id,kind,item_id', values: {
      school_id: SCHOOL, kind: 'prim', item_id: PRIM.id,
      intitule: 'Communiquer en francais cc', maj_le: new Date().toISOString(),
    } });
  ok(!renomPrim.error, 'ENREGISTRER le renommage d’une compétence du PRIMAIRE', renomPrim.error);
  const relPrim = await db({ table: 'referentiel_libelles', action: 'select', columns: 'intitule',
    filters: [{ op: 'eq', col: 'school_id', val: SCHOOL }, { op: 'eq', col: 'kind', val: 'prim' },
      { op: 'eq', col: 'item_id', val: PRIM.id }] });
  ok(relPrim?.data?.[0]?.intitule === 'Communiquer en francais cc',
    'le libellé du primaire est bien enregistré', relPrim?.data);
  const masquePrim = await db({ table: 'prim_competences_masques', action: 'upsert',
    onConflict: 'school_id,competence_id', values: { school_id: SCHOOL, competence_id: PRIM.id } });
  ok(!masquePrim.error, 'RETIRER une compétence du primaire (masquer)', masquePrim.error);

  // ── 3 ter. « AJOUTEZ LES VÔTRES » DANS LE PRIMAIRE ───────────────────────
  // Le troisième geste annoncé par l'écran, et le seul qui ne passait JAMAIS :
  // `addRefLigne` envoyait `code: null`, or `prim_competences.code` est NOT NULL
  // en LAN comme au Cloud. L'ajout échouait donc toujours — et l'écran ne disait
  // qu'« ajout refusé ». Le test envoie exactement ce que le store envoie
  // maintenant (cf. codeMaison), puis vérifie l'ancienne forme pour que le
  // défaut ne puisse pas revenir sans être vu.
  const MAISON = `ec_${SCHOOL.replace(/-/g, '').slice(0, 12)}_lecture_a_haute_voix`;
  const ajoutPrim = await db({ table: 'prim_competences', action: 'upsert', onConflict: 'id', values: {
    id: MAISON, school_id: SCHOOL, intitule: 'Lecture a haute voix', actif: true,
    ordre: 95, country_code: 'CM', code: 'LAH',
  } });
  ok(!ajoutPrim.error, 'AJOUTER une compétence du primaire à soi', ajoutPrim.error);
  const reluPrim = await db({ table: 'prim_competences', action: 'select', columns: 'id,code,intitule,school_id',
    single: true, filters: [{ op: 'eq', col: 'id', val: MAISON }] });
  ok(reluPrim?.data?.school_id === SCHOOL && reluPrim?.data?.code === 'LAH',
    'elle naît AVEC son école et sa pastille — pas nationale, pas sans code', reluPrim?.data);
  const sansCode = await db({ table: 'prim_competences', action: 'upsert', onConflict: 'id', values: {
    id: `${MAISON}_bis`, school_id: SCHOOL, intitule: 'Sans pastille', actif: true,
    ordre: 96, country_code: 'CM', code: null,
  } });
  ok(!!sansCode.error, 'le défaut d’origine est bien un refus : code NULL reste rejeté', sansCode.error?.message);
  // Et l'école modifie ensuite SA ligne, comme n'importe quelle ligne maison.
  const majPrim = await db({ table: 'prim_competences', action: 'upsert', onConflict: 'id', values: {
    id: MAISON, school_id: SCHOOL, intitule: 'Lecture a voix haute', actif: true,
    ordre: 95, country_code: 'CM', code: 'LAH',
  } });
  ok(!majPrim.error, 'puis renommer SA compétence du primaire', majPrim.error);

  // ── 4. « Masquer » ───────────────────────────────────────────────────────
  const masque = await db({ table: 'apc_competences_masques', action: 'upsert',
    onConflict: 'school_id,competence_id', values: { school_id: SCHOOL, competence_id: NAT.id } });
  ok(!masque.error, 'MASQUER une compétence officielle', masque.error);
  const masque2 = await db({ table: 'apc_competences_masques', action: 'upsert',
    onConflict: 'school_id,competence_id', values: { school_id: SCHOOL, competence_id: NAT.id } });
  ok(!masque2.error, 'masquer deux fois ne casse rien', masque2.error);

  // ── 5. LE BARÈME DU PRIMAIRE, exactement comme la file le réenvoyait ─────
  const crit = await db({ table: 'prim_criteres', action: 'select', columns: 'id', filters: [] });
  const cmp = await db({ table: 'prim_competences', action: 'select', columns: 'id', filters: [] });
  const CRIT = crit?.data?.[0]?.id, CMP = cmp?.data?.[0]?.id;
  const bareme = await db({ table: 'prim_notes', action: 'upsert',
    onConflict: 'eleve_id,competence_id,critere_id,ua', values: {
      id: 'pn-bareme', school_id: SCHOOL, eleve_id: 'stu-1', competence_id: CMP, critere_id: CRIT,
      ua: 1, trimestre_id: 't1', enseignant_id: null, note: null, points_max: 10,
      date_saisie: new Date().toISOString(),
    } });
  ok(!bareme.error, 'POSER LE BARÈME /10 d’un critère (le geste qui restait en file)', bareme.error);
  const noteApres = await db({ table: 'prim_notes', action: 'upsert',
    onConflict: 'eleve_id,competence_id,critere_id,ua', values: {
      id: 'pn-note', school_id: SCHOOL, eleve_id: 'stu-1', competence_id: CMP, critere_id: CRIT,
      ua: 1, trimestre_id: 't1', note: 8, points_max: 10, date_saisie: new Date().toISOString(),
    } });
  ok(!noteApres.error, 'puis saisir la note sur ce barème', noteApres.error);
  const lignes = await db({ table: 'prim_notes', action: 'select', columns: 'id,note,points_max',
    filters: [{ op: 'eq', col: 'eleve_id', val: 'stu-1' }] });
  ok((lignes.data || []).length === 1, 'une seule ligne : l’upsert a bien reconnu la clé', lignes.data);
  ok(Number(lignes.data?.[0]?.points_max) === 10 && Number(lignes.data?.[0]?.note) === 8,
    'note et barème relus tels qu’enregistrés', lignes.data?.[0]);

  // ── 6. Le national reste protégé, même par l'API ─────────────────────────
  const touche = await db({ table: 'apc_competences', action: 'update', values: { intitule: 'Detournee' },
    filters: [{ op: 'eq', col: 'id', val: NAT.id }] });
  ok(!!touche.error, 'toucher la compétence OFFICIELLE est refusé', touche.error?.message);

  // ── 7. L'ÉCRAN « MON PROFIL », PAR LA ROUTE QUE LE NAVIGATEUR EMPRUNTE ───
  // `_my_profile.test.mjs` appelle `runRpc` en direct : il prouve que la RPC
  // fait ce qu'il faut, pas que l'écran l'atteint. Entre les deux il y a
  // /api/rpc/:name, son 401, et `PUBLIC_RPCS`. C'est précisément le maillon qui
  // rendait « RPC inconnue : update_my_profile » à l'école.
  const rpc = (name, body) => fetch(`${BASE}/api/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

  const majProfil = await rpc('update_my_profile', { p_full_name: 'Directrice Awa', p_phone: '699000111' });
  ok(!majProfil.error, 'ENREGISTRER son nom et son téléphone', majProfil.error);
  const moi = await db({ table: 'school_users', action: 'select', columns: 'full_name,phone,photo_url',
    single: true, filters: [{ op: 'eq', col: 'user_id', val: sign?.data?.user?.id }] });
  ok(moi?.data?.full_name === 'Directrice Awa' && moi?.data?.phone === '699000111',
    'relu tel quel après le tour par le serveur', moi?.data);

  const photo = await rpc('set_my_photo', { p_photo_url: 'avatars/dir.png' });
  ok(!photo.error, 'ENREGISTRER sa photo de profil', photo.error);
  const apresPhoto = await db({ table: 'school_users', action: 'select', columns: 'full_name,photo_url',
    single: true, filters: [{ op: 'eq', col: 'user_id', val: sign?.data?.user?.id }] });
  ok(apresPhoto?.data?.photo_url === 'avatars/dir.png', 'la photo est en base', apresPhoto?.data);

  // Une édition du nom ne doit pas emporter la photo : les deux RPC sont
  // séparées pour cela, et l'écran les appelle bien séparément.
  await rpc('update_my_profile', { p_full_name: 'Directrice Awa M.', p_phone: '699000111' });
  const apresNom = await db({ table: 'school_users', action: 'select', columns: 'full_name,photo_url',
    single: true, filters: [{ op: 'eq', col: 'user_id', val: sign?.data?.user?.id }] });
  ok(apresNom?.data?.photo_url === 'avatars/dir.png' && apresNom?.data?.full_name === 'Directrice Awa M.',
    'renommer ne supprime pas la photo', apresNom?.data);

  const anonyme = await fetch(`${BASE}/api/rpc/update_my_profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_full_name: 'Intrus' }),
  });
  ok(anonyme.status === 401, 'sans session, le profil ne s’écrit pas', anonyme.status);
} catch (e) {
  console.error('ÉCHEC du parcours :', e.message);
  fail++;
} finally {
  srv.kill();
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}\n--- log serveur ---\n${srvLog.slice(-1200)}`
  : `\n✅ Le geste de l'écran passe sur le vrai serveur (${pass})`);
process.exit(fail ? 1 : 0);
