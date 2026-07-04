// Liens du portail parents — « Envoyer aux parents » sans infrastructure e-mail.
// On exploite le portail existant (/parent/:token) : chaque élève porte un
// `parent_token` (UUID). On en dérive un lien partageable + un lien WhatsApp
// pré-rempli quand un téléphone est connu.

const origin = () => (typeof window !== 'undefined' && window.location?.origin) || '';

// URL publique du portail parent pour un élève (null si pas de token).
export function parentPortalUrl(student) {
  if (!student?.parent_token) return null;
  return `${origin().replace(/\/$/, '')}/parent/${student.parent_token}`;
}

// Numéro normalisé pour wa.me (chiffres uniquement, sans + ni espaces).
function waNumber(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return digits.length >= 8 ? digits : null;
}

// Lien WhatsApp pré-rempli (null si pas de téléphone ou pas de lien portail).
export function parentWhatsappUrl(student, school, schoolYear) {
  const url = parentPortalUrl(student);
  const num = waNumber(student?.parent_phone || student?.phone);
  if (!url) return null;
  const msg = `${school?.name || 'École'} — Relevé de notes de ${student.name}` +
              (schoolYear ? ` (${schoolYear})` : '') + `\n${url}`;
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(msg)}`;
}

// Construit la liste des liens parents pour un ensemble d'élèves générables.
export function buildParentLinks(students, school, schoolYear) {
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    url: parentPortalUrl(s),
    whatsapp: parentWhatsappUrl(s, school, schoolYear),
    hasToken: !!s.parent_token,
  }));
}
