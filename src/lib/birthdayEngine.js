// ════════════════════════════════════════════════════════════════════════════
// ANNIVERSAIRES DES ÉLÈVES — notification interne, une fois par jour
// ════════════════════════════════════════════════════════════════════════════
// Demandé par les écoles : que l'anniversaire d'un élève soit signalé à son
// enseignant titulaire, à l'administrateur et à la direction.
//
// DESTINATAIRE : aucun. C'est délibéré. Une notification sans `recipient_id` ni
// `recipient_role` est visible de TOUS les comptes de l'école
// (`isNotificationForMe`, notificationService.js). Le titulaire, l'admin et le
// chef d'établissement la reçoivent donc, sans qu'on ait à deviner qui, dans
// cette école-ci, porte le titre de directeur — « directeur » n'est pas un rôle
// du logiciel mais tantôt un rôle de gouvernance, tantôt un intitulé de poste.
// Le titulaire est NOMMÉ dans le corps du message, ce qui lui adresse
// l'information sans créer une seconde notification qu'il verrait en double.
//
// ── POURQUOI UN IDENTIFIANT DÉTERMINISTE ────────────────────────────────────
// Ce producteur tourne à l'ouverture de l'application, donc sur CHAQUE poste.
// Dans une école à dix postes, dix personnes ouvrent l'app le matin : sans
// précaution, le même anniversaire produirait dix notifications.
//
// L'identifiant est donc dérivé de (élève, jour) par un hachage : tous les
// postes calculent le MÊME uuid, et l'upsert `onConflict: id` fait que le
// deuxième écrit par-dessus le premier au lieu d'ajouter une ligne. C'est vrai
// même si deux postes écrivent exactement en même temps — la base tranche, pas
// un test de présence qui laisserait une fenêtre entre le SELECT et l'INSERT.
//
// La clé contient le JOUR : l'an prochain, le même élève aura une notification
// neuve, ce qui est bien le comportement voulu.

// Jour local au format AAAA-MM-JJ. `toISOString()` est volontairement évité : il
// bascule en UTC et, à Yaoundé (UTC+1), un anniversaire souhaité après 23 h
// tomberait dans la journée de la veille.
export function jourLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Élèves dont c'est l'anniversaire ce jour-là. Fonction PURE — c'est elle qui
// porte les règles de date, donc c'est elle qu'on teste.
//
// Le 29 février : un élève né un 29/02 n'aurait d'anniversaire qu'une année sur
// quatre. Les années non bissextiles, on le souhaite le 28. Ne rien prévoir
// aurait été un choix aussi, mais un choix que personne n'aurait vu passer.
export function anniversairesDuJour(eleves = [], jour = jourLocal()) {
  const [annee, mois, quantieme] = jour.split('-');
  const estBissextile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const cible = `${mois}-${quantieme}`;
  const rattrapage29fev = cible === '02-28' && !estBissextile(Number(annee));

  return eleves.filter((e) => {
    const dn = String(e?.date_naissance || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dn)) return false;   // date absente ou illisible
    if (e?.archived_at) return false;                     // élève sorti des listes
    const md = dn.slice(5);
    return md === cible || (rattrapage29fev && md === '02-29');
  });
}

// Âge atteint ce jour-là, ou null si la date de naissance ne le permet pas.
export function ageAtteint(dateNaissance, jour = jourLocal()) {
  const dn = String(dateNaissance || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dn)) return null;
  const age = Number(jour.slice(0, 4)) - Number(dn.slice(0, 4));
  return age > 0 && age < 130 ? age : null;
}

// uuid v5-like : hachage SHA-256 de la clé, mis au format uuid. Web Crypto est
// disponible dans le navigateur ET dans Node — pas de dépendance à ajouter.
// La colonne `notifications.id` est de type uuid côté Cloud : un identifiant
// lisible du genre « bday-<id>-<jour> » y serait refusé.
export async function idAnniversaire(eleveId, jour) {
  const octets = new TextEncoder().encode(`birthday:${eleveId}:${jour}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
  // Version 5 et variante RFC 4122 : l'uuid est déterministe mais reste conforme.
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Texte de la notification. PUR, donc testable et traduisible d'un seul endroit.
export function messageAnniversaire(eleve, { className, titulaire, jour, t }) {
  const age = ageAtteint(eleve?.date_naissance, jour);
  const parts = [
    age ? t(`${age} ans aujourd'hui`, `turns ${age} today`, `cumple ${age} años hoy`) : null,
    className || null,
    titulaire ? t(`Titulaire : ${titulaire}`, `Class teacher: ${titulaire}`, `Titular: ${titulaire}`) : null,
  ].filter(Boolean);
  return {
    title: `🎂 ${t('Anniversaire', 'Birthday', 'Cumpleaños')} — ${eleve?.name || ''}`.trim(),
    body: parts.join(' · '),
  };
}
