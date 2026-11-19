// DES LIGNES DU MOTEUR AUX PAGES DES TABLEAUX D'HONNEUR.
//
// Le moteur (honorRollEngine) choisit QUI figure au tableau et dans quel ordre ; ce module
// ne fait que mettre en forme : identité de l'établissement (ou de la section de la classe),
// logo en data-URL (capture sans requête ni CORS), couleurs, langue de chaque page,
// signataires, lieu et date (heure de Douala). Le rendu visuel vit dans modeles.js.
import { certificatHtml, palmaresHtml, modeleParDefaut, modeleValide } from './modeles.js';
import { paletteHonneur, lireCouleursLogo } from './couleurs.js';
import { langueDePage, faitA, T } from './textes.js';
import { isBasicClass, isBasicSchool } from '../tutelle.js';
import { headTeacherNames } from '../headTeachers.js';
import { classIdentity } from '../schoolIdentity.js';
import { imageToDataUrl } from '../idCardService.js';

/** Format d'un modèle : certificat individuel ou palmarès collectif. */
export function formatDuModele(tpl) {
  const f = tpl?.personalization?.format;
  if (f === 'certificat' || f === 'palmares') return f;
  return tpl?.layout === 'certificate' || tpl?.layout === 'diploma' ? 'certificat' : 'palmares';
}

/** Modèle visuel : celui du modèle, sinon celui de l'école, sinon 4 (primaire) / 1 (secondaire). */
export function visuelDuModele(tpl, reglages, classes) {
  if (tpl?.personalization?.visuel === 'ancien') return 'ancien';
  return modeleValide(tpl?.personalization?.visuel) || modeleValide(reglages?.design) || modeleParDefaut(isBasicSchool(classes));
}

const lieuDe = (id) => String(id?.subdivision || id?.division || id?.city || id?.region || '').trim();

/**
 * Prépare les identités (logo en data-URL + couleurs extraites) une fois par logo distinct.
 * À appeler avant `pagesHonneur` ; renvoie un cache réutilisable.
 */
export async function preparerIdentites(school, classes, schoolUnits) {
  const cache = new Map();
  const urls = new Set([school?.logo_url, ...classes.map((c) => classIdentity(school, c, schoolUnits)?.logo_url)].filter(Boolean));
  for (const u of urls) {
    let data = '';
    try { data = await imageToDataUrl(u, { maxDim: 900, quality: 0.92 }); } catch { data = ''; }
    cache.set(u, { data, couleurs: data ? await lireCouleursLogo(data) : null });
  }
  return cache;
}

function signatairesPour(id, cls, teachers, groupeClasse) {
  const primaire = isBasicClass(cls);
  const pp = cls && groupeClasse ? headTeacherNames(cls, teachers).join(' · ') : '';
  if (primaire) return { gauche: { titre: T.enseignant, nom: pp }, droite: { titre: T.directeur, nom: id?.director || '' } };
  return groupeClasse
    ? { gauche: { titre: T.profPrincipal, nom: pp }, droite: { titre: T.chefEtab, nom: id?.director || '' } }
    : { gauche: { titre: { fr: 'Le Censeur', en: 'Vice Principal' }, nom: id?.censeur_name || '' }, droite: { titre: T.chefEtab, nom: id?.director || '' } };
}

function docDeBase({ tpl, school, cls, schoolUnits, identites, reglages, langForcee, periodKey, teachers, groupeClasse, date }) {
  const id = classIdentity(school, cls, schoolUnits) || school;
  const logo = identites.get(id?.logo_url || school?.logo_url) || { data: '', couleurs: null };
  const per = tpl.personalization || {};
  const lang = langueDePage(langForcee || per.lang || reglages.lang, cls?.system);
  const primaire = !!cls && isBasicClass(cls);
  return {
    lang, basic: primaire, primaire,
    palette: paletteHonneur({ manuel: per.colors || reglages.colors || null, logo: logo.couleurs }),
    ecole: { nom: id?.name || school?.name || '', devise: id?.motto || school?.motto || '', logo: logo.data, lieu: lieuDe(id) || lieuDe(school), annee: school?.current_year || '' },
    textes: {
      introFr: per.introText, introEn: per.introTextEn, felFr: per.congratsText, felEn: per.congratsTextEn,
      mentionFr: per.specialMention, mentionEn: per.specialMentionEn,
    },
    signataires: signatairesPour(id, cls, teachers, groupeClasse),
    faitA: faitA(lieuDe(id) || lieuDe(school), lang === 'bi' ? 'fr' : lang, date),
    periodeKey: periodKey,
  };
}

/**
 * Pages HTML d'un modèle. `groups` = applyTemplate(...). Options :
 *   { classId?, studentId?, langForcee?, periodKey, reglages, teachers, identites, date? }
 * Certificats : un élève par page, triés par classe puis rang. Palmarès : une liste par groupe.
 */
export function pagesHonneur(tpl, groups, { school, classes, schoolUnits = [], teachers = [], reglages, periodKey, identites, classId = '', studentId = '', langForcee = '', date = new Date() }) {
  const m = visuelDuModele(tpl, reglages, classes);
  const byId = Object.fromEntries(classes.map((c) => [c.id, c]));
  const garde = (r) => (!classId || r.classId === classId) && (!studentId || r.id === studentId);
  const base = (cls, groupeClasse) => docDeBase({ tpl, school, cls, schoolUnits, identites, reglages, langForcee, periodKey, teachers, groupeClasse, date });

  if (formatDuModele(tpl) === 'certificat') {
    const rows = groups.flatMap((g) => g.rows).filter(garde)
      .sort((a, b) => String(a.className).localeCompare(String(b.className), 'fr', { numeric: true }) || (a.rankInClass ?? 999) - (b.rankInClass ?? 999));
    return rows.map((r) => {
      const cls = byId[r.classId];
      return certificatHtml(m, {
        ...base(cls, true),
        niveau: r.honorLevel || 'th',
        eleve: { nom: r.name, classe: r.className, periodeKey: periodKey, moyenne20: r.avg20, rang: r.rankInClass, effectif: r.classSize },
      });
    });
  }
  return groups.map((g) => {
    const rows = g.rows.filter(garde);
    if (!rows.length) return null;
    const classesDuGroupe = [...new Set(rows.map((r) => r.classId))];
    const cls = classesDuGroupe.length === 1 ? byId[classesDuGroupe[0]] : null;
    const d = base(cls || classes.find((c) => !isBasicClass(c)) || classes[0], !!cls);
    // Groupe de plusieurs classes : tutelle MINEDUB seulement si TOUTES sont du fondamental.
    if (!cls) { d.basic = classesDuGroupe.every((id) => isBasicClass(byId[id])); d.primaire = d.basic; }
    return palmaresHtml(m, {
      ...d, niveau: 'th', groupe: g.title || '',
      lignes: rows.map((r) => ({ nom: r.name, classe: r.className, moyenne20: r.avg20, rang: r.rank, niveau: r.honorLevel, photo: '' })),
    });
  }).filter(Boolean);
}

/** Lien de la feuille de polices (à charger une fois dans le document). */
export const POLICES_CSS = '/fonts/honneur/honneur-fonts.css';
export async function chargerPolices() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector(`link[data-honneur-polices]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = POLICES_CSS; l.dataset.honneurPolices = '1';
    await new Promise((res) => { l.onload = res; l.onerror = res; document.head.appendChild(l); });
  }
  const familles = ["400 10px Cinzel", "700 10px Cinzel", "700 10px 'Cinzel Decorative'", "10px 'Great Vibes'", '10px Lora', 'italic 10px Lora', '400 10px Poppins', '600 10px Poppins', '700 10px Poppins'];
  try { await Promise.all(familles.map((f) => document.fonts.load(f, 'ÉéëÏ'))); } catch { /* polices système en repli */ }
}
