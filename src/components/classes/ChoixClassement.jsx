// LE MENU « CLASSEMENT » D'UNE MATIÈRE, AVEC CRÉATION SUR PLACE.
//
// Consigne du responsable, 2026-10-31 : « permet qu'on crée un classement
// directement dans modification de classe ». Avant, le menu offrait les six
// familles du référentiel et rien d'autre : une école qui voulait « Langues
// orientales » pour son chinois n'avait que « Autre » — et « Autre » est le
// groupe fourre-tout du bulletin.
//
// ── CE QUE L'ÉCOLE DOIT DIRE, ET POURQUOI DEUX CHAMPS ET NON UN ────────────
//
// Un classement n'est pas une étiquette : il décide du GROUPE IMPRIMÉ sur le
// bulletin (`subjectGroup.js`) et de la COULEUR à l'emploi du temps. Demander
// seulement un nom donnerait un classement incapable de dire où ses matières
// s'impriment, et elles retomberaient dans AUTRES MATIÈRES — exactement le
// défaut que `subjectGroup.js` a été écrit pour fermer.
//
// L'école donne donc le NOM qu'elle veut lire, et la FAMILLE dont son
// classement hérite le comportement. C'est écrit en clair sous le formulaire,
// pas laissé à deviner.
//
// ── LA LISTE DES CLASSEMENTS MAISON SE DÉDUIT, ELLE N'EST PAS STOCKÉE ──────
//
// Elle vient de `classementsEnUsage(subjects)` — toutes classes confondues, pour
// qu'un classement créé en CE1 serve en CM2. Aucune table, aucune colonne :
// `subjects.category` est déjà du texte libre et déjà synchronisé. Voir l'en-tête
// de `core/classementMaison.js` pour le détail de ce choix et de son prix.
import { useMemo, useState } from 'react';
import { CATEGORIES, DEFAULT_CATEGORY } from '../../config/timetableConfig';
import { classementsEnUsage, encoder, FAMILLES_ANCRAGE } from '../../core/classementMaison';

const NOUVEAU = '__nouveau__';

export default function ChoixClassement({
  value, onChange, subjects = [], autoLabel, t, dense = false,
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [famille, setFamille] = useState('autre');
  const [erreur, setErreur] = useState(null);

  const officiels = [...CATEGORIES, DEFAULT_CATEGORY];
  const maison = useMemo(() => classementsEnUsage(subjects), [subjects]);

  // Un classement maison porté par CETTE matière mais par aucune autre ne
  // figure pas dans `maison` tant qu'il n'est pas enregistré : on l'ajoute, sinon
  // le menu afficherait un choix vide alors que la valeur existe.
  const listeMaison = useMemo(() => {
    if (!value || maison.some((m) => m.id === value)) return maison;
    const seul = classementsEnUsage([{ id: 'x', category: value }]);
    return seul.length ? [...maison, ...seul] : maison;
  }, [maison, value]);

  const libelleFamille = (id) => {
    const c = officiels.find((x) => x.id === id);
    return c ? t(...c.label) : id;
  };

  const creer = () => {
    const id = encoder(famille, nom);
    if (!id) {
      setErreur(t('Donnez un nom au classement.', 'Give the category a name.', 'Dé un nombre.'));
      return;
    }
    onChange(id);
    setOuvert(false);
    setNom('');
    setErreur(null);
  };

  const cls = dense
    ? 'w-full text-xs border border-brand-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 bg-white text-gray-700'
    : 'w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 bg-white text-gray-700';

  if (ouvert) {
    return (
      <div className="rounded-lg border border-brand-300 bg-brand-50/60 p-2 space-y-1.5">
        <input
          autoFocus
          type="text" maxLength={40} value={nom}
          onChange={(e) => { setNom(e.target.value); setErreur(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') creer(); if (e.key === 'Escape') setOuvert(false); }}
          placeholder={t('Nom du classement', 'Category name', 'Nombre')}
          className="w-full text-xs border border-brand-200 rounded px-2 py-1 bg-white"
        />
        <select
          value={famille} onChange={(e) => setFamille(e.target.value)}
          className="w-full text-[11px] border border-brand-200 rounded px-1 py-1 bg-white text-gray-700"
          aria-label={t('Se comporte comme', 'Behaves like', 'Se comporta como')}
        >
          {FAMILLES_ANCRAGE.map((f) => (
            <option key={f} value={f}>
              {t('comme', 'like', 'como')} {libelleFamille(f)}
            </option>
          ))}
        </select>
        {/* Dire ce que « comme » engage : c'est le groupe du BULLETIN. Sans cette
            ligne, l'école croirait choisir une couleur. */}
        <p className="text-[10px] leading-tight text-brand-900/70">
          {t('La famille choisie décide du groupe où la matière s’imprime sur le bulletin, et de sa couleur à l’emploi du temps.',
             'The chosen family decides which bulletin group the subject prints in, and its timetable colour.',
             'La familia elegida decide el grupo del boletín y el color del horario.')}
        </p>
        {erreur && <p className="text-[10px] text-rose-600">{erreur}</p>}
        <div className="flex gap-1.5">
          <button
            type="button" onClick={creer}
            className="flex-1 rounded bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
          >
            {t('Créer', 'Create', 'Crear')}
          </button>
          <button
            type="button" onClick={() => { setOuvert(false); setErreur(null); }}
            className="rounded border border-brand-200 px-2 py-1 text-[11px] bg-white"
          >
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      className={cls}
      value={value || ''}
      onChange={(e) => {
        if (e.target.value === NOUVEAU) { setOuvert(true); return; }
        onChange(e.target.value || null);
      }}
    >
      <option value="">{autoLabel}</option>
      {officiels.map((c) => <option key={c.id} value={c.id}>{t(...c.label)}</option>)}
      {listeMaison.length > 0 && (
        <optgroup label={t('Classements de l’école', 'School categories', 'Clasificaciones del centro')}>
          {listeMaison.map((m) => (
            <option key={m.id} value={m.id}>{m.nom}</option>
          ))}
        </optgroup>
      )}
      <option value={NOUVEAU}>
        + {t('Nouveau classement…', 'New category…', 'Nueva clasificación…')}
      </option>
    </select>
  );
}
