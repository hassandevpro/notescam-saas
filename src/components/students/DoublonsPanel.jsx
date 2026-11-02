// ════════════════════════════════════════════════════════════════════════════
// DOUBLONS D'ÉLÈVES — L'ÉCRAN
// ════════════════════════════════════════════════════════════════════════════
// Deux usages, un seul vocabulaire, pour que la secrétaire reconnaisse la même
// chose aux deux endroits :
//
//   <AlerteDoublon>   à l'inscription et à la modification. Montre les fiches
//                     proches, dit POURQUOI, et laisse trois sorties :
//                     ouvrir la fiche existante · « ce n'est pas un doublon »
//                     (la décision est mémorisée) · annuler.
//                     Elle n'EMPÊCHE jamais d'enregistrer — consigne du
//                     2026-11-01 : « alerte, jamais blocage ».
//
//   <ScanDoublons>    le balayage de toute la base, toutes classes confondues,
//                     avec export. C'est l'outil de ménage ; l'alerte, elle,
//                     est le garde-fou du quotidien.
//
// CE QUE CET ÉCRAN NE FAIT PAS : fusionner. Rapprocher notes, versements et
// abonnements sous une seule fiche puis archiver l'autre se décide fiche par
// fiche, et une fusion automatique qui se trompe coûte plus cher que le doublon
// qu'elle voulait réparer. Les deux fiches s'ouvrent côte à côte, et c'est la
// secrétaire qui tranche.
import { useMemo, useState } from 'react';
import { NIVEAU, detecterDoublons, phraseAlerte } from '../../core/doublonsEleves';
import { useT, getLang } from '../../lib/i18n';
import Modal from '../Modal';

// Un seul endroit décide de la couleur et du mot : le niveau doit se lire de la
// même façon dans l'alerte et dans le scan.
function Pastille({ niveau }) {
  const t = useT();
  const fort = niveau === NIVEAU.FORT;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
      fort ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
    >
      {fort ? t('Doublon probable', 'Likely duplicate') : t('À vérifier', 'To check')}
    </span>
  );
}

// Où est l'élève : sa classe, ou « archivé ». Une fiche archivée est la cause la
// plus fréquente du doublon — on réinscrit quelqu'un qu'on croyait supprimé.
const situation = (s, classes, t) => (s?.archived_at
  ? t('archivé', 'archived')
  : classes.find((c) => c.id === s?.class_id)?.name || t('sans classe', 'no class'));

function Fiche({ eleve, classes, onOuvrir }) {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-gray-900">{eleve.name}</div>
      <div className="mt-0.5 text-xs text-gray-500">
        {situation(eleve, classes, t)}
        {eleve.date_naissance ? ` · ${eleve.date_naissance}` : ''}
        {eleve.lieu_naissance ? ` · ${eleve.lieu_naissance}` : ''}
        {eleve.matricule ? ` · ${eleve.matricule}` : ''}
      </div>
      {onOuvrir && (
        <button type="button" onClick={() => onOuvrir(eleve)}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
        >
          {t('Voir la fiche existante', 'Open the existing record')}
        </button>
      )}
    </div>
  );
}

// ── L'ALERTE DE SAISIE ─────────────────────────────────────────────────────
// `candidats` vient de `doublonsPourCandidat` : [{ eleve, niveau, raisons, … }].
export function AlerteDoublon({ candidats, nom, classes, onOuvrir, onConfirmer, onAnnuler }) {
  const t = useT();
  if (!candidats?.length) return null;
  const fort = candidats.some((c) => c.niveau === NIVEAU.FORT);
  const en = getLang() === 'en';

  return (
    <Modal size="lg" onClose={onAnnuler} title={fort
      ? t('Cet élève est peut-être déjà inscrit', 'This student may already be enrolled')
      : t('Un élève très proche existe déjà', 'A very similar student already exists')}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          {t(`Vous enregistrez « ${nom} ». ${candidats.length > 1
            ? `${candidats.length} fiches existantes lui ressemblent.`
            : 'Une fiche existante lui ressemble.'}`,
          `You are saving “${nom}”. ${candidats.length > 1
            ? `${candidats.length} existing records look like it.`
            : 'An existing record looks like it.'}`)}
        </p>

        <ul className="divide-y rounded-lg border">
          {candidats.map((c) => (
            <li key={c.eleve.id} className="flex items-start gap-3 p-3">
              <Fiche eleve={c.eleve} classes={classes} onOuvrir={onOuvrir} />
              <div className="shrink-0 text-right">
                <Pastille niveau={c.niveau} />
                <div className="mt-1 max-w-[16rem] text-xs text-gray-500">{phraseAlerte(c, { en })}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* L'ordre des boutons n'est pas neutre : le geste le plus probable —
            « c'est le même enfant, j'annule » — est le plus accessible, et
            « ce n'est pas un doublon » demande un regard de plus. */}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onAnnuler}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('Annuler', 'Cancel')}
          </button>
          <button type="button" onClick={onConfirmer}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            {t('Ce n’est pas un doublon — enregistrer', 'Not a duplicate — save')}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {t('Votre réponse est mémorisée : cette paire ne sera plus signalée.',
            'Your answer is remembered: this pair will not be flagged again.')}
        </p>
      </div>
    </Modal>
  );
}

// ── LE SCAN DE TOUTE LA BASE ───────────────────────────────────────────────
export function ScanDoublons({ eleves, classes, onOuvrir, onNonDoublon, onExporter, onFermer }) {
  const t = useT();
  const en = getLang() === 'en';
  const [filtre, setFiltre] = useState('tous');
  const [traitees, setTraitees] = useState(() => new Set());

  // Le scan tourne sur le registre tel qu'il est en mémoire : aucun aller-retour
  // réseau, donc il reste utilisable à l'école quand la liaison tombe.
  const resultat = useMemo(() => detecterDoublons(eleves, { inclureFratrie: true }), [eleves]);

  const visibles = resultat.paires.filter((p) => !traitees.has(p.cle)
    && (filtre === 'tous' || (filtre === 'forts' ? p.niveau === NIVEAU.FORT : p.niveau === NIVEAU.VERIFIER)));

  // Combien de fiches n'ont PAS de quoi être comparées : c'est l'explication la
  // plus fréquente d'un rapport vide ou, au contraire, interminable.
  const sansDate = eleves.filter((s) => s && !s.date_naissance).length;
  const sansLieu = eleves.filter((s) => s && !String(s.lieu_naissance || '').trim()).length;

  const trancher = async (paire) => {
    await onNonDoublon?.(paire);
    setTraitees((prev) => new Set(prev).add(paire.cle));
  };

  return (
    <Modal size="2xl" onClose={onFermer} title={t("Doublons d'élèves", "Duplicate students")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">
            {t(`${resultat.stats.eleves} élèves examinés`, `${resultat.stats.eleves} students checked`)}
          </span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            {t(`${resultat.stats.forts} doublon(s) probable(s)`, `${resultat.stats.forts} likely duplicate(s)`)}
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {t(`${resultat.stats.aVerifier} à vérifier`, `${resultat.stats.aVerifier} to check`)}
          </span>
          {resultat.stats.tranchees > 0 && (
            <span className="text-xs text-gray-500">
              {t(`${resultat.stats.tranchees} paire(s) déjà déclarée(s) « pas un doublon »`,
                `${resultat.stats.tranchees} pair(s) already marked “not a duplicate”`)}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm"
            >
              <option value="tous">{t('Tous les niveaux', 'All levels')}</option>
              <option value="forts">{t('Doublons probables', 'Likely duplicates')}</option>
              <option value="verifier">{t('À vérifier', 'To check')}</option>
            </select>
            <button type="button" onClick={() => onExporter?.(resultat)}
              disabled={!resultat.paires.length}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              {t('Exporter', 'Export')}
            </button>
          </div>
        </div>

        {/* CE QUI EXPLIQUE LE RÉSULTAT. Une école qui n'a saisi aucune date de
            naissance ne peut pas avoir de « doublon probable » : le niveau fort
            exige la date ET le lieu. Le dire ici évite de conclure « il n'y a
            pas de doublons » alors qu'on n'a pas de quoi les voir. */}
        {(sansDate > 0 || sansLieu > 0) && (
          <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            {t(`Pour trancher, la détection a besoin de la date ET du lieu de naissance. `
              + `Ici : ${sansDate} élève(s) sans date, ${sansLieu} sans lieu de naissance. `
              + `Ces fiches ne peuvent sortir qu'en « à vérifier ».`,
            `To decide, detection needs both the date and the place of birth. `
              + `Here: ${sansDate} student(s) without a date, ${sansLieu} without a place of birth. `
              + `Those records can only come out as “to check”.`)}
          </p>
        )}

        {!visibles.length ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {resultat.paires.length
              ? t('Rien à ce niveau.', 'Nothing at this level.')
              : t('Aucun doublon détecté dans toute la base.', 'No duplicate found in the whole database.')}
          </p>
        ) : (
          <ul className="max-h-[55vh] divide-y overflow-auto rounded-lg border">
            {visibles.map((p) => (
              <li key={p.cle} className="p-3">
                <div className="flex items-start gap-3">
                  <Fiche eleve={p.a} classes={classes} onOuvrir={onOuvrir} />
                  <div className="shrink-0 pt-1 text-gray-300">↔</div>
                  <Fiche eleve={p.b} classes={classes} onOuvrir={onOuvrir} />
                  <div className="w-56 shrink-0 text-right">
                    <Pastille niveau={p.niveau} />
                    <div className="mt-1 text-xs text-gray-500">{phraseAlerte(p, { en })}</div>
                    <button type="button" onClick={() => trancher(p)}
                      className="mt-2 text-xs font-medium text-gray-600 hover:underline"
                    >
                      {t('Ce n’est pas un doublon', 'Not a duplicate')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Les fratries ne sont PAS des doublons, mais les voir rassure : c'est
            la question que la secrétaire se pose juste après. */}
        {resultat.fratries.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              {t(`${resultat.fratries.length} fratrie(s) ou jumeaux reconnus — ce ne sont pas des doublons`,
                `${resultat.fratries.length} sibling/twin pair(s) recognised — not duplicates`)}
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {resultat.fratries.slice(0, 50).map((p) => (
                <li key={p.cle}>{p.a.name} ↔ {p.b.name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}
