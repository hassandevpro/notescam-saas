// ════════════════════════════════════════════════════════════════════════════
// ANNIVERSAIRES DES ÉLÈVES — écriture des notifications (couche I/O)
// ════════════════════════════════════════════════════════════════════════════
// Les RÈGLES (quel jour, quel âge, quel texte, quel identifiant) vivent dans
// birthdayEngine.js, qui est pur et testé sous Node nu. Ici, uniquement l'écrit.
// Même séparation que notificationEngine.js / notificationService.js.
import { supabase } from './supabase';
import { anniversairesDuJour, idAnniversaire, messageAnniversaire, jourLocal } from './birthdayEngine.js';

export * from './birthdayEngine.js';

/**
 * Crée les notifications d'anniversaire du jour. Idempotent : relancé dix fois,
 * depuis dix postes, il ne laisse qu'une notification par élève et par jour.
 *
 * Ne lève jamais : un anniversaire manqué ne doit pas empêcher l'application de
 * s'ouvrir. Renvoie le nombre de notifications posées (0 si rien à faire).
 */
export async function notifierAnniversaires({ schoolId, eleves, classes = [], teachers = [], t, jour = jourLocal() }) {
  if (!schoolId || !Array.isArray(eleves) || !eleves.length) return 0;
  const fetes = anniversairesDuJour(eleves, jour);
  if (!fetes.length) return 0;

  const classeParId = new Map(classes.map((c) => [c.id, c]));
  const enseignantParId = new Map(teachers.map((th) => [th.id, th]));
  const maintenant = new Date().toISOString();

  const lignes = [];
  for (const e of fetes) {
    const cls = classeParId.get(e.class_id);
    const titulaire = cls?.teacher_id ? enseignantParId.get(cls.teacher_id)?.name || null : null;
    const { title, body } = messageAnniversaire(e, { className: cls?.name || null, titulaire, jour, t });
    lignes.push({
      id: await idAnniversaire(e.id, jour),
      school_id: schoolId,
      recipient_id: null, recipient_role: null,   // visible de toute l'école
      type: 'birthday', title, body,
      link: `/app/students/${e.id}`,
      read: false, created_at: maintenant, updated_at: maintenant, version: 1,
    });
  }

  try {
    const { error } = await supabase.from('notifications').upsert(lignes, { onConflict: 'id' });
    if (error) { console.warn('[anniversaires]', error.message); return 0; }
    return lignes.length;
  } catch (e) {
    console.warn('[anniversaires]', e?.message || e);
    return 0;
  }
}
