// ════════════════════════════════════════════════════════════════════════════
// ANNIVERSAIRES DES ÉLÈVES — écriture des notifications (couche I/O)
// ════════════════════════════════════════════════════════════════════════════
// Les RÈGLES (quel jour, quel âge, quel texte, quel identifiant) vivent dans
// birthdayEngine.js, qui est pur et testé sous Node nu. Ici, uniquement l'écrit.
// Même séparation que notificationEngine.js / notificationService.js.
import { supabase } from './supabase';
import {
  anniversairesDuJour, anniversairesDansNJours, idAnniversaire, messageAnniversaire,
  jourLocal, ajouterJours, PREAVIS_JOURS,
} from './birthdayEngine.js';

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

  // DEUX moments, et c'est voulu : un préavis pour PRÉPARER (une carte, une
  // annonce), puis la notification du jour pour SOUHAITER. Le jour même, il est
  // trop tard pour organiser quoi que ce soit ; sept jours à l'avance, personne
  // ne pense à souhaiter.
  const dateFete = ajouterJours(jour, PREAVIS_JOURS);
  const lots = [
    { genre: 'jour', jourCle: jour, dateFete: jour, eleves: anniversairesDuJour(eleves, jour) },
    { genre: 'preavis', jourCle: jour, dateFete, eleves: anniversairesDansNJours(eleves, jour, PREAVIS_JOURS) },
  ];
  if (!lots.some((l) => l.eleves.length)) return 0;

  const classeParId = new Map(classes.map((c) => [c.id, c]));
  const enseignantParId = new Map(teachers.map((th) => [th.id, th]));
  const maintenant = new Date().toISOString();

  const lignes = [];
  for (const lot of lots) {
    for (const e of lot.eleves) {
      const cls = classeParId.get(e.class_id);
      const titulaire = cls?.teacher_id ? enseignantParId.get(cls.teacher_id)?.name || null : null;
      const { title, body } = messageAnniversaire(e, {
        className: cls?.name || null, titulaire, jour, t,
        genre: lot.genre, dateFete: lot.dateFete,
      });
      lignes.push({
        // La clé porte le GENRE : sans lui, préavis et notification du jour
        // partageraient le même identifiant un jour sur sept et l'un écraserait
        // l'autre — l'école perdrait le rappel, ou le souhait.
        id: await idAnniversaire(e.id, lot.jourCle, lot.genre),
        school_id: schoolId,
        recipient_id: null, recipient_role: null,   // visible de toute l'école
        type: 'birthday', title, body,
        link: `/app/students/${e.id}`,
        read: false, created_at: maintenant, updated_at: maintenant, version: 1,
      });
    }
  }
  if (!lignes.length) return 0;

  try {
    const { error } = await supabase.from('notifications').upsert(lignes, { onConflict: 'id' });
    if (error) { console.warn('[anniversaires]', error.message); return 0; }
    return lignes.length;
  } catch (e) {
    console.warn('[anniversaires]', e?.message || e);
    return 0;
  }
}
