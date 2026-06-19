// Cœur de signature de licence (partagé par sign-license.mjs en flags et
// make-license.mjs interactif). Signe un payload en Ed25519 avec la clé privée
// de l'éditeur. La clé produite : base64url(payload JSON) + "." + base64url(signature).

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PRIV_PATH = join(here, 'private-key.pem');

export const PLANS = ['starter', 'ecole', 'pro', 'reseau'];

const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// @param {{ school, plan, expires, machine }} opts
//   school  : nom affiché (défaut "École")
//   plan    : starter | ecole | pro | reseau (défaut "ecole")
//   expires : date ISO "AAAA-MM-JJ" ou null = perpétuelle
//   machine : empreinte machine (verrou) ou null = valable partout
// @returns {{ payload, licenseKey }}
export function signLicense({ school, plan = 'ecole', expires = null, machine = null } = {}) {
  if (!existsSync(PRIV_PATH)) {
    throw new Error('Clé privée introuvable. Lance d’abord : node packaging/license/keygen.mjs');
  }
  // Normalise + valide le plan AVANT signature. Sans ça, le CLI (sign-license.mjs)
  // signait la chaîne brute : « Pro » (casse) ou « Standard » (nom inexistant) se
  // retrouvaient en base puis étaient dégradés silencieusement en Starter, car
  // PLAN_META[plan] est introuvable côté app (clés en minuscule). On échoue donc
  // explicitement plutôt que d'émettre une licence qui retombera en Starter.
  const normPlan = String(plan).trim().toLowerCase();
  if (!PLANS.includes(normPlan)) {
    throw new Error(`Plan invalide : « ${plan} ». Valeurs acceptées : ${PLANS.join(', ')}.`);
  }
  const priv = createPrivateKey(readFileSync(PRIV_PATH));
  const payload = {
    school: school || 'École',
    plan: normPlan,
    edition: 'lan',
    issued_at: new Date().toISOString(),
    expires_at: expires || null,
  };
  if (machine) payload.machine_id = machine;

  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  const licenseKey = `${b64url(buf)}.${b64url(sign(null, buf, priv))}`;
  return { payload, licenseKey };
}
