// RÉPARATION DU SECTEUR DES CLASSES PRÉ-SCOLAIRES — cas réel THE GENIUS (26/08/2026).
//
// Le serveur LAN ne déduit jamais le secteur d'une classe de son nom : `classSector()`
// et `allowsClass()` (scopeGuard) ne lisent que `classes.cycle` et `classes.section`,
// miroirs de `public.class_sector` côté cloud. Reconnaître « crèche » dans l'interface
// sans réparer la donnée ferait diverger les deux couches — classe affichée, données
// refusées. Ce fichier verrouille la réparation.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-creche-'));

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db, ensureCrecheSector } = await import('./db.js');
const { allowsClass } = await import('./scopeGuard.js');

db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,1)').run('ec', 'ECOLE');
const C = (id, name, cycle, section) => db.prepare(
  'INSERT INTO classes (id,school_id,name,cycle,section) VALUES (?,?,?,?,?)',
).run(id, 'ec', name, cycle, section);

C('c-creche',  'CRECHE',    null,         null);   // le cas signalé : aucun secteur
C('c-creche2', 'Crèche A',  'secondaire', 'A');    // le repli fautif d'avant + suffixe de groupe
C('c-creche3', 'Garderie',  'primaire',   'primaire'); // déclarée dans un autre secteur
C('c-ps',      'PS',        'maternelle', null);   // déjà correcte
C('c-cm2',     'CM2',       'primaire',   null);   // témoin : ne doit PAS bouger
C('c-6e',      '6e',        'secondaire', null);   // témoin : ne doit PAS bouger

ensureCrecheSector();

const get = (id) => db.prepare('SELECT cycle, section FROM classes WHERE id = ?').get(id);

ok(get('c-creche').cycle === 'maternelle', '1. crèche sans secteur → maternelle', get('c-creche'));
ok(get('c-creche2').cycle === 'maternelle', '2. crèche déclarée « secondaire » (repli fautif) → maternelle', get('c-creche2'));
ok(get('c-creche2').section === 'A', '3. le suffixe de groupe « A » est préservé', get('c-creche2'));
ok(get('c-creche3').cycle === 'maternelle' && get('c-creche3').section === 'maternelle',
  '4. garderie déclarée « primaire » → maternelle, cycle ET section', get('c-creche3'));
ok(get('c-cm2').cycle === 'primaire' && get('c-6e').cycle === 'secondaire',
  '5. les autres classes ne bougent pas', [get('c-cm2'), get('c-6e')]);

// ── Le point qui compte vraiment : le serveur laisse enfin passer la classe ──
const scopePrimaire = { schoolId: 'ec', global: false, sections: ['maternelle', 'primaire'], cycles: [], classIds: [] };
const scopeCollege  = { schoolId: 'ec', global: false, sections: [], cycles: ['secondaire'], classIds: [] };
ok(allowsClass(scopePrimaire, 'c-creche'), '6. périmètre maternelle+primaire : la crèche passe');
ok(!allowsClass(scopeCollege, 'c-creche'), '7. périmètre collège : la crèche ne passe pas — le cloisonnement tient');

{
  const avant = db.prepare('SELECT id, cycle, section FROM classes ORDER BY id').all().map((r) => JSON.stringify(r)).join('|');
  const n = ensureCrecheSector();
  const apres = db.prepare('SELECT id, cycle, section FROM classes ORDER BY id').all().map((r) => JSON.stringify(r)).join('|');
  ok(n === 0 && avant === apres, '8. idempotent : un second passage n’écrit rien', n);
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ECHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
