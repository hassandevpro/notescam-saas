// Identifiant DÉTERMINÉ d'une ligne reprise d'un document (UUID v5, RFC 4122).
//
// POURQUOI PAS UN INDEX UNIQUE. Pour qu'une reprise relancée ne crée pas de
// doublon, le réflexe serait un index unique sur (school_id, source_file,
// source_row). Ce serait un piège : si la même reprise est faite côté LAN et
// côté Cloud, les deux lignes portent des `id` différents, et le push de
// synchro échoue pour la table ENTIÈRE — pas seulement pour la ligne fautive.
// C'est la raison pour laquelle `fee_payments.receipt_no` n'a pas d'unique non
// plus (cf. supabase_cash_control.sql).
//
// LA CLÉ EST DONC L'IDENTIFIANT. `sourceUuid` dérive l'`id` de l'origine de la
// ligne. Relancer l'import réécrit la MÊME ligne (upsert sur la clé primaire) ;
// deux côtés qui importent le même fichier produisent le MÊME id, et le
// départage LWW habituel s'applique — sans doublon et sans blocage de file.
//
// Implémentation SHA-1 locale (≈40 lignes) plutôt que `node:crypto` : ce module
// doit tourner à l'identique dans le navigateur, en LAN et dans un script, et
// `crypto.subtle` est asynchrone, ce qui contaminerait tous les appelants.

// SHA-1 d'un tableau d'octets → tableau de 20 octets.
function sha1(bytes) {
  const ml = bytes.length * 8;
  const withPad = [...bytes, 0x80];
  while (withPad.length % 64 !== 56) withPad.push(0);
  // Longueur sur 64 bits big-endian. Les messages manipulés ici font quelques
  // dizaines d'octets : les 32 bits hauts sont donc toujours nuls.
  for (let i = 7; i >= 0; i--) withPad.push((i < 4 ? Math.floor(ml / 2 ** (8 * i)) : 0) & 0xff);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let off = 0; off < withPad.length; off += 64) {
    const w = new Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = ((withPad[off + i * 4] << 24) | (withPad[off + i * 4 + 1] << 16)
            | (withPad[off + i * 4 + 2] << 8) | withPad[off + i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20)      { f = (b & c) | (~b & d);            k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d;                     k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d);   k = 0x8F1BBCDC; }
      else             { f = b ^ c ^ d;                     k = 0xCA62C1D6; }
      const tmp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  const out = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return out;
}

function utf8Bytes(str) {
  const out = [];
  for (const ch of str) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

function uuidBytes(uuid) {
  const hex = String(uuid).replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 32) throw new Error(`namespace UUID invalide : ${uuid}`);
  const out = [];
  for (let i = 0; i < 32; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

// Espace de noms propre à NotesCam pour les reprises de documents. Fixe : le
// changer rendrait non idempotents tous les imports déjà faits.
export const NS_NOTESCAM_IMPORT = '6ba7b814-9dad-11d1-80b4-00c04fd430c8';

// UUID v5 = SHA-1(namespace ‖ nom), bits de version/variante forcés.
export function uuidV5(name, namespace = NS_NOTESCAM_IMPORT) {
  const h = sha1([...uuidBytes(namespace), ...utf8Bytes(String(name))]);
  h[6] = (h[6] & 0x0f) | 0x50;          // version 5
  h[8] = (h[8] & 0x3f) | 0x80;          // variante RFC 4122
  const hex = h.slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Identifiant stable d'une ligne reprise. `kind` sépare les espaces : la ligne 18
// d'un classeur peut donner une DÉPENSE et, dans un autre import, un MOUVEMENT
// de caisse — deux enregistrements distincts, donc deux identifiants distincts.
export function sourceUuid({ schoolId, sourceFile, sourceRow, kind = 'expense' }) {
  if (!schoolId) throw new Error('sourceUuid : schoolId requis');
  if (!sourceFile) throw new Error('sourceUuid : sourceFile requis');
  if (sourceRow === null || sourceRow === undefined || sourceRow === '') {
    throw new Error('sourceUuid : sourceRow requis');
  }
  // Chaque partie est PRÉFIXÉE DE SA LONGUEUR. Un simple séparateur serait
  // ambigu : le nom de fichier « f|1 » suivi de la ligne « 2 » et le nom « f »
  // suivi de la ligne « 1|2 » donneraient la même chaîne, donc le même
  // identifiant — deux lignes différentes écrasant la même. Un nom de fichier
  // peut contenir « | » sous Linux, et le LAN y tourne.
  const part = (v) => { const s = String(v); return `${s.length}:${s}`; };
  return uuidV5([kind, schoolId, sourceFile, sourceRow].map(part).join(''));
}
