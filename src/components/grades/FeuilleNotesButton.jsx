// « Feuille de notes » — bouton + dialogue d'impression de la grille papier.
//
// Ce que ça résout, demandé le 2026-11-01 photos à l'appui : les écoles
// fabriquent elles-mêmes, à la main ou sous Excel, la grille sur laquelle
// l'enseignant corrige avant de saisir. L'application affichait tout à l'écran
// et n'imprimait rien de tel. On sort donc la MÊME grille que celle de la
// saisie, en A4 paysage, avec deux usages :
//
//   • VIERGE (défaut)  — les cases sont vides, on écrit dedans au stylo.
//   • AVEC LES NOTES   — ce qui est déjà saisi est imprimé, pour relire.
//
// Le composant ne connaît RIEN au métier : chaque écran de saisie lui présente
// ses propres colonnes (compétences × critères au primaire, matières au
// secondaire). La découpe en pages est faite par `core/feuilleNotes.js`, le
// papier par `lib/feuilleNotesDoc.js`, la page par le socle `lib/print`.

import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { toast } from '../../store/toastStore';
import { printSheets, PRINT_RESULT } from '../../lib/print';
import { feuilleNotesSheets, DENSITES, DENSITE_DEFAUT } from '../../lib/feuilleNotesDoc';
import { construireFeuille, elementsChoisissables, filtrerGroupes } from '../../core/feuilleNotes';

export default function FeuilleNotesButton({
  school,                 // établissement (en-tête de la feuille)
  sys = 'FR',             // système de la classe — décide de la langue du papier
  classe,                 // nom de la classe
  periode,                // « Séquence 3 », « UA 2 », « Term 1 »…
  portee,                 // { libelle, valeur } — matière, compétence, domaine
  enseignant,             // nom pré-imprimé (vide = ligne à remplir)
  groupes = [],           // [{ id, label, colonnes:[{ id, label, bareme, calculee }] }]
  eleves = [],            // [{ id, numero, nom }] — ordre de la liste de classe
  valeur = null,          // (eleveId, colonneId) => string — pour la version remplie
  className = '',
}) {
  const t = useT();
  const [open, setOpen]       = useState(false);
  const [vierge, setVierge]   = useState(true);
  const [vides, setVides]     = useState(0);
  // Serré ou confortable : l'école arbitre entre le papier qu'elle photocopie
  // et la place qu'il faut pour écrire « 13,5 » à la main. Par défaut, la place.
  const [densite, setDensite] = useState(DENSITE_DEFAUT);

  // CHOIX DES COMPÉTENCES (ou matières, domaines) d'une feuille VIERGE. Certaines écoles n'évaluent pas tout :
  // elles décochent ce qui ne sert pas. On mémorise sur CE poste, par classe et par type de feuille, les
  // éléments DÉCOCHÉS (et non les cochés) : une compétence ajoutée plus tard est donc cochée d'office.
  // Aucun réglage d'école, aucune migration ; sans stockage (navigation privée), le choix vaut pour la session.
  const cleStock = `nc_feuille_exclus:${school?.id || ''}:${classe || ''}:${portee?.libelle || ''}`;
  const lireExclus = () => {
    try { const v = JSON.parse(localStorage.getItem(cleStock) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
  };
  const [exclus, setExclus] = useState(lireExclus);
  const [cleLue, setCleLue] = useState(cleStock);
  if (cleLue !== cleStock) { setCleLue(cleStock); setExclus(lireExclus()); }   // autre classe : son propre choix
  const changerExclus = (n) => {
    setExclus(n);
    try { localStorage.setItem(cleStock, JSON.stringify([...n])); } catch { /* session seulement */ }
  };
  const basculer = (id) => { const n = new Set(exclus); if (n.has(id)) n.delete(id); else n.add(id); changerExclus(n); };
  const toutCocher = () => changerExclus(new Set());
  const toutDecocher = () => changerExclus(new Set(elements.map((e) => e.id)));

  const nbColonnesTotal = useMemo(
    () => groupes.reduce((n, g) => n + (g.colonnes?.length || 0), 0),
    [groupes],
  );
  // CE QUI SE COCHE (groupes en primaire, colonnes en secondaire / maternelle) : voir core/feuilleNotes.js.
  const { elements } = useMemo(() => elementsChoisissables(groupes), [groupes]);
  // Le choix ne vaut que pour la feuille VIERGE : une feuille avec notes imprime TOUT ce qui est saisi.
  const groupesImpr = useMemo(() => (vierge ? filtrerGroupes(groupes, exclus) : groupes), [groupes, exclus, vierge]);
  const nbColonnes = useMemo(
    () => groupesImpr.reduce((n, g) => n + (g.colonnes?.length || 0), 0),
    [groupesImpr],
  );
  const peutImprimer = nbColonnes > 0;
  // Le compteur de l'en-tête (« Compétences : 12 ») suit le choix ; sans exclusion il reste EXACTEMENT celui de l'appelant.
  const porteeImpr = useMemo(() => {
    const retires = vierge ? elements.filter((e) => exclus.has(e.id)).length : 0;
    if (!portee || !retires) return portee;
    // Vrai nombre d'éléments imprimés (l'appelant compte parfois aussi le groupe « Synthèse » : 11 compétences → 12).
    return { ...portee, valeur: String(elements.length - retires) };
  }, [portee, elements, exclus, vierge]);

  // Compte de pages annoncé AVANT d'imprimer, pour CHAQUE densité : c'est le
  // seul chiffre qui rend le choix lisible (« 8 pages » contre « 6 »). Le même
  // calcul que le document, aux mêmes capacités — on ne promet pas « 2 pages »
  // pour en sortir 4 (cf. core/feuilleNotes.js et lib/feuilleNotesDoc.js).
  const pagesPour = useMemo(() => {
    if (!nbColonnes) return {};
    const out = {};
    for (const [cle, d] of Object.entries(DENSITES)) {
      out[cle] = construireFeuille({
        groupes: groupesImpr, eleves, vierge: true, lignesVides: vides,
        maxColonnes: d.colonnes, maxLignes: d.lignes,
      }).pages.length;
    }
    return out;
  }, [groupesImpr, eleves, vides, nbColonnes]);
  const nbPages = pagesPour[densite] ?? 0;

  // Rien à imprimer : pas de bouton. Une grille sans colonne est une page
  // blanche, et un bouton qui produit une page blanche se lit comme une panne.
  if (!nbColonnesTotal) return null;

  const imprimer = () => {
    const { sheets, profile } = feuilleNotesSheets({
      school, sys, classe, periode, portee: porteeImpr, enseignant,
      groupes: groupesImpr, eleves, valeur, vierge, lignesVides: vides, densite,
    });
    const titre = `${t('Feuille de notes', 'Mark sheet')} — ${classe || ''} — ${periode || ''}`;
    const r = printSheets(sheets, titre, { profile });
    if (r === PRINT_RESULT.BLOCKED) {
      toast.error(t(
        "Fenêtre d'impression bloquée par le navigateur. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.",
        'Print window blocked by the browser. Allow pop-ups for this site, then try again.',
      ));
      return;
    }
    if (r === PRINT_RESULT.EMPTY) {
      toast.error(t('Rien à imprimer.', 'Nothing to print.'));
      return;
    }
    setOpen(false);
  };

  const Choix = ({ actif, onClick, titre, detail }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
        actif ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
          actif ? 'border-brand-600 bg-brand-600' : 'border-gray-300'
        }`} />
        <span className="font-medium text-sm text-gray-800">{titre}</span>
      </span>
      <span className="block text-xs text-gray-500 mt-1 ml-[22px]">{detail}</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors no-print ${className}`}
        title={t('Imprimer la grille pour la remplir à la main',
                 'Print the grid to fill it in by hand')}
      >
        🖨 {t('Feuille de notes', 'Mark sheet')}
      </button>

      {open && (
        <Modal title={t('Feuille de notes à imprimer', 'Mark sheet to print')} onClose={() => setOpen(false)} size="lg">
          <div className="space-y-4">
            <div className="space-y-2">
              <Choix
                actif={vierge}
                onClick={() => setVierge(true)}
                titre={t('Vierge — à remplir à la main', 'Blank — to fill in by hand')}
                detail={t('Les noms et les barèmes sont imprimés, les cases restent vides.',
                          'Names and scales are printed, the cells stay empty.')}
              />
              <Choix
                actif={!vierge}
                onClick={() => setVierge(false)}
                titre={t('Avec les notes déjà saisies', 'With the marks already entered')}
                detail={t('Pour relire et corriger sur papier ce qui est dans l’application.',
                          'To proof-read on paper what is in the application.')}
              />
            </div>

            {vierge && elements.length > 1 && (
              <div data-testid="choix-groupes">
                <div className="flex items-center justify-between gap-2">
                  <span className="form-label">{portee?.libelle || t('Éléments', 'Items')} {t('à imprimer', 'to print')} ({elements.filter((e) => !exclus.has(e.id)).length}/{elements.length})</span>
                  <span className="flex gap-3 text-xs">
                    <button type="button" className="text-brand-700 underline" onClick={toutCocher}>{t('Tout cocher', 'Select all')}</button>
                    <button type="button" className="text-brand-700 underline" onClick={toutDecocher}>{t('Tout décocher', 'Clear all')}</button>
                  </span>
                </div>
                <div className="max-h-44 overflow-auto border border-gray-200 rounded-lg px-3 py-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  {elements.map((e) => (
                    <label key={e.id} className="flex items-start gap-2 text-sm text-gray-700">
                      <input type="checkbox" className="mt-1" checked={!exclus.has(e.id)} onChange={() => basculer(e.id)} />
                      <span>{e.label}</span>
                    </label>
                  ))}
                </div>
                {!peutImprimer && (
                  <p className="text-xs text-red-600 mt-1" role="alert" data-testid="aucun-groupe">
                    {t('Cochez au moins un élément pour imprimer la feuille.', 'Tick at least one item to print the sheet.')}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {t('Ce choix est mémorisé pour cette classe sur ce poste. Une feuille avec notes imprime toujours tout ce qui est saisi.',
                     'This choice is remembered for this class on this computer. A sheet with marks always prints everything entered.')}
                </p>
              </div>
            )}

            <div>
              <span className="form-label">{t('Taille des cases', 'Cell size')}</span>
              <div className="grid grid-cols-2 gap-2">
                <Choix
                  actif={densite === 'confort'}
                  onClick={() => setDensite('confort')}
                  titre={t('Confortable', 'Roomy')}
                  detail={t(`Cases hautes, faciles à écrire — ${pagesPour.confort ?? '—'} page(s).`,
                            `Tall cells, easy to write in — ${pagesPour.confort ?? '—'} page(s).`)}
                />
                <Choix
                  actif={densite === 'serre'}
                  onClick={() => setDensite('serre')}
                  titre={t('Serré', 'Tight')}
                  detail={t(`Moins de papier, écriture plus fine — ${pagesPour.serre ?? '—'} page(s).`,
                            `Less paper, smaller handwriting — ${pagesPour.serre ?? '—'} page(s).`)}
                />
              </div>
            </div>

            <label className="block">
              <span className="form-label">
                {t('Lignes vides à la fin', 'Blank rows at the end')}
              </span>
              <input
                type="number" min="0" max="20" value={vides}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setVides(Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 0);
                }}
                className="form-input w-28"
              />
              {/* POURQUOI CE CHAMP. Une classe bouge : trois inscriptions
                  arrivent après l'édition de la feuille. Sans ces lignes,
                  l'enseignant réimprime tout pour trois noms. */}
              <span className="block text-xs text-gray-500 mt-1">
                {t('Pour les élèves inscrits après l’impression : des lignes sans nom, numéro compris.',
                   'For students enrolled after printing: rows with no name or number.')}
              </span>
            </label>

            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600">
              {t(
                `${nbPages} page(s) · ${eleves.length} élève(s) · ${nbColonnes} colonne(s) · A4 paysage`,
                `${nbPages} page(s) · ${eleves.length} student(s) · ${nbColonnes} column(s) · A4 landscape`,
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={imprimer} className="btn-primary" disabled={!peutImprimer}
                style={{ width: 'auto', paddingInline: '1.5rem' }}>
                🖨 {t('Imprimer', 'Print')}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary" style={{ width: 'auto' }}>
                {t('Annuler', 'Cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
