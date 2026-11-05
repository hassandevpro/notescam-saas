// AMORCE D'UNE ÉCOLE AVEC SON REGISTRE DE SERVICES, pour les tests de parcours.
//
// ── CE QUE CE FICHIER ÉCRIT, ET OÙ ─────────────────────────────────────────
//
// Dans la base SQLite NEUVE de l'exécution (`E2E_DATA_DIR`, posé par
// `playwright.config.mjs`), jamais ailleurs. Le serveur a déjà appliqué le
// schéma au démarrage ; on n'insère que des lignes.
//
// ── POURQUOI PAS `npm run seed:ecole` ─────────────────────────────────────
//
// Ce script-là tire une école DU CLOUD, c'est-à-dire des élèves réels : des
// mineurs, leur classe et ce que leur famille doit. Ces lignes n'ont rien à
// faire dans une base de test, et encore moins dans des captures d'écran qu'on
// fait circuler. On amorce donc depuis le JEU D'ESSAI du dossier de refonte,
// dont les noms sont inventés et dont chaque ligne illustre un état précis.
//
// ── POURQUOI LE HACHAGE EST RECOPIÉ ICI ───────────────────────────────────
//
// `server/security.js` lit — et au besoin écrit — la clé de signature des
// jetons au moment de l'import. Importer ce module depuis un test lui ferait
// créer ce fichier dans le dossier du test, avant même que le serveur ne
// démarre. Le format est stable et documenté dans `server/schema.sql`
// (« scrypt : salt:hash (hex) ») : quatre lignes valent mieux qu'un effet de
// bord. `_amorceRegistre.test.mjs` vérifie que les deux implémentations
// restent d'accord.
import { randomBytes, scryptSync, createPrivateKey, sign } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));

export function hacher(motDePasse) {
  const sel = randomBytes(16);
  const h = scryptSync(String(motDePasse), sel, 32);
  return `${sel.toString('hex')}:${h.toString('hex')}`;
}

/**
 * Pose l'activation de licence attendue par l'édition LAN.
 *
 * La licence est signée par l'autorité JETABLE créée dans
 * `playwright.config.mjs`, dont la clé publique est donnée au serveur par
 * `NOTESCAM_LICENSE_PUBKEY`. Le contrôle de licence n'est pas désactivé : il
 * s'exerce contre cette autorité d'essai, et la clé privée de l'éditeur
 * (`packaging/license/private-key.pem`) n'est jamais lue.
 *
 * Volontairement SANS `machine_id` : une licence verrouillée ne vaudrait que
 * sur le poste qui a lancé le test, et le même fichier doit passer en
 * intégration continue.
 */
function activerLicenceDEssai(db) {
  const pem = process.env.E2E_LICENSE_PRIVKEY;
  if (!pem) throw new Error('E2E_LICENSE_PRIVKEY absent : la configuration Playwright doit le poser.');
  const b64url = (b) => Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const payload = {
    school: 'ÉCOLE D’ESSAI — REGISTRE',
    plan: 'ecole',
    edition: 'lan',
    issued_at: new Date().toISOString(),
    expires_at: null,
  };
  const corps = Buffer.from(JSON.stringify(payload), 'utf8');
  const cle = `${b64url(corps)}.${b64url(sign(null, corps, createPrivateKey(pem)))}`;

  db.prepare(`INSERT INTO license_activation (id, license_key, payload, activated_at, machine_id)
              VALUES (1, ?, ?, ?, NULL)
              ON CONFLICT(id) DO UPDATE SET license_key = excluded.license_key,
                payload = excluded.payload, activated_at = excluded.activated_at`)
    .run(cle, JSON.stringify(payload), new Date().toISOString());
}

export const COMPTE = {
  email: 'secretaire@ecole-essai.cm',
  motDePasse: 'Registre-2026!',
  nom: 'Secrétariat (essai)',
};

export function lireJeuEssai(nom = 'registre-services.fixture.json') {
  return JSON.parse(readFileSync(
    join(ici, '..', 'docs', 'refonte-registre-services', nom), 'utf8'));
}

/**
 * Pose une école, un compte admin, les classes, les abonnés et tout le
 * registre. Rend de quoi se connecter et de quoi viser les lignes.
 *
 * @param {object} [o]
 * @param {number} [o.eleves]  nombre d'abonnés à écrire. Au-delà du jeu
 *   d'essai (16), on complète avec le JEU DE VOLUME : c'est lui qui porte les
 *   320 lignes du critère d'acceptation n° 2.
 */
export function amorcerRegistre({ eleves = 0 } = {}) {
  const dossier = process.env.E2E_DATA_DIR;
  if (!dossier) throw new Error('E2E_DATA_DIR absent : la configuration Playwright doit le poser.');

  const db = new DatabaseSync(join(dossier, 'notescam.db'));
  db.exec('PRAGMA foreign_keys = ON');
  activerLicenceDEssai(db);

  const fixture = lireJeuEssai();
  const { service_affiche, catalogue, classes, abonnements, echeances, paiements } = fixture.entrees;
  const service = catalogue.find((c) => c.id === service_affiche);
  const annee = service.academic_year;

  // IDEMPOTENT, PARCE QUE PLAYWRIGHT REJOUE `beforeAll`. Un test qui échoue
  // fait tomber son ouvrier ; le suivant repart dans un ouvrier neuf et
  // rappelle l'amorce — sur la MÊME base, qui elle n'est pas recréée. Sans ce
  // retour anticipé, le second appel meurt sur l'unicité du courriel et l'on
  // perd la vraie cause du premier échec derrière une erreur d'amorce.
  const dejaLa = db.prepare('SELECT id FROM users WHERE email = ?').get(COMPTE.email);
  if (dejaLa) {
    const svc = db.prepare(
      "SELECT id FROM fee_catalog WHERE category = 'cantine' LIMIT 1").get();
    const n = db.prepare(
      'SELECT count(*) n FROM student_fee_items WHERE fee_catalog_id = ?').get(svc.id).n;
    const long = db.prepare(
      'SELECT name FROM students ORDER BY length(name) DESC LIMIT 1').get().name;
    const an = db.prepare('SELECT current_year FROM schools LIMIT 1').get().current_year;
    db.close();
    return { ...COMPTE, serviceId: svc.id, annee: an, abonnes: n, nomLong: long };
  }

  const ecoleId = randomUUID();
  const userId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_confirmed_at)
              VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(userId, COMPTE.email, hacher(COMPTE.motDePasse), COMPTE.nom);

  db.prepare(`INSERT INTO schools (id, name, current_year, currency, language, type)
              VALUES (?, ?, ?, 'XAF', 'fr', 'prive')`)
    .run(ecoleId, 'ÉCOLE D’ESSAI — REGISTRE', annee);

  db.prepare(`INSERT INTO school_users (id, school_id, user_id, role, full_name, active)
              VALUES (?, ?, ?, 'admin', ?, 1)`)
    .run(randomUUID(), ecoleId, userId, COMPTE.nom);

  const classeId = {};
  const insClasse = db.prepare(`INSERT INTO classes (id, school_id, name, cycle, current_year)
                                VALUES (?, ?, ?, ?, ?)`);
  for (const c of classes) {
    classeId[c.id] = randomUUID();
    insClasse.run(classeId[c.id], ecoleId, c.name, c.cycle || null, annee);
  }

  const eleveId = {};
  const insEleve = db.prepare(`INSERT INTO students (id, school_id, class_id, name, matricule, gender)
                               VALUES (?, ?, ?, ?, ?, ?)`);
  // L'ÉLÈVE SANS CLASSE NE PEUT PAS ÊTRE AMORCÉ ICI, et ce n'est pas un
  // oubli : `students.class_id` est NOT NULL dans `server/schema.sql`. Sur
  // l'édition LAN, une ligne sans classe ne s'obtient donc jamais par saisie —
  // seulement par une descente du Cloud, où la colonne est nullable. Le cas
  // reste couvert par `src/lib/_cantineListe.test.mjs`, qui exige
  // `className === ''` sur le jeu d'essai ; il est simplement hors de portée
  // d'un parcours navigateur sur cette base.
  const classeParDefaut = classeId[classes[0].id];
  for (const e of fixture.entrees.eleves) {
    eleveId[e.id] = randomUUID();
    insEleve.run(eleveId[e.id], ecoleId,
      e.class_id ? classeId[e.class_id] : classeParDefaut,
      e.name, e.matricule, e.gender || null);
  }

  const serviceId = randomUUID();
  db.prepare(`INSERT INTO fee_catalog
      (id, school_id, name, category, amount, academic_year, mandatory, optional,
       payment_type, active, position, quote_part)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1, 0, ?)`)
    .run(serviceId, ecoleId, service.name, service.category, service.amount,
      annee, service.payment_type, service.quote_part);

  // La PÉRIODICITÉ n'est pas une colonne du schéma LAN de base : elle est
  // ajoutée par la montée de version (`server/db.js`). On la pose seulement si
  // elle existe, pour que l'amorce survive à une base plus ancienne.
  const colonnes = db.prepare('PRAGMA table_info(fee_catalog)').all().map((c) => c.name);
  if (colonnes.includes('periodicity')) {
    db.prepare('UPDATE fee_catalog SET periodicity = ? WHERE id = ?')
      .run(service.periodicity, serviceId);
  }

  const aboId = {};
  const insAbo = db.prepare(`INSERT INTO student_fee_items
      (id, school_id, student_id, fee_catalog_id, academic_year, name, category,
       amount, mandatory, payment_type, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
  for (const a of abonnements) {
    aboId[a.id] = randomUUID();
    insAbo.run(aboId[a.id], ecoleId, eleveId[a.student_id], serviceId, annee,
      a.name, a.category, a.amount, a.payment_type, a.status, a.started_at);
  }

  const echId = {};
  const insEch = db.prepare(`INSERT INTO fee_schedule_items
      (id, school_id, student_id, student_fee_item_id, academic_year,
       period_key, period_label, amount_due, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const e of echeances) {
    echId[e.id] = randomUUID();
    insEch.run(echId[e.id], ecoleId, eleveId[e.student_id], aboId[e.student_fee_item_id],
      annee, e.period_key, e.period_label, e.amount_due, e.status, e.notes);
  }

  const insPaie = db.prepare(`INSERT INTO fee_payments
      (id, school_id, student_id, academic_year, amount, date, note,
       recorded_by_name, reversal_of, void_reason, receipt_no, method,
       payer_name, reference, student_fee_item_id, fee_schedule_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of paiements) {
    insPaie.run(randomUUID(), ecoleId, eleveId[p.student_id], annee, p.amount,
      p.date, p.note || null, p.recorded_by_name || null, p.void_reason || null,
      p.receipt_no || null, p.method || null, p.payer_name || null,
      p.reference || null, aboId[p.student_fee_item_id] || null,
      echId[p.fee_schedule_item_id] || null);
  }

  // ── LE VOLUME ────────────────────────────────────────────────────────────
  // Le jeu d'essai tient seize lignes : il montre les seize états, il ne dit
  // rien du défilement ni du tri à 320 abonnés. On complète avec le jeu de
  // volume quand le test le demande.
  let deVolume = 0;
  if (eleves > fixture.entrees.eleves.length) {
    const volume = lireJeuEssai('registre-services.volume.json');
    const voulus = volume.abonnes.slice(0, eleves - fixture.entrees.eleves.length);
    const parId = new Map(volume.grille.map((r) => [r.student_id, r]));
    for (const a of voulus) {
      const sid = randomUUID();
      const cls = classes[deVolume % classes.length];
      insEleve.run(sid, ecoleId, classeId[cls.id], a.name,
        a.matricule || `V${String(deVolume).padStart(4, '0')}`, null);
      const aid = randomUUID();
      insAbo.run(aid, ecoleId, sid, serviceId, annee, service.name,
        service.category, service.amount, service.payment_type, 'active', '2026-09-01');
      for (const c of (parId.get(a.student_id)?.cellules || [])) {
        if (!c.echeance_id) continue;
        const eid = randomUUID();
        insEch.run(eid, ecoleId, sid, aid, annee, c.period_key,
          c.period_key, c.montantDu, 'due', null);
        if (c.paye) {
          insPaie.run(randomUUID(), ecoleId, sid, annee, c.paye, `${c.period_key}-05`,
            null, null, null, null, 'especes', null, null, aid, eid);
        }
      }
      deVolume++;
    }
  }

  const total = db.prepare(
    'SELECT count(*) n FROM student_fee_items WHERE fee_catalog_id = ?').get(serviceId).n;
  db.close();

  return {
    ...COMPTE, ecoleId, serviceId, annee,
    abonnes: total,
    // Le nom de 38 caractères et plus, celui du critère d'acceptation n° 1.
    nomLong: fixture.entrees.eleves.map((e) => e.name).sort((a, b) => b.length - a.length)[0],
  };
}
