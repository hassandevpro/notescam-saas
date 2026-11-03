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
import { construireFeuille } from '../../core/feuilleNotes';

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

  const nbColonnes = useMemo(
    () => groupes.reduce((n, g) => n + (g.colonnes?.length || 0), 0),
    [groupes],
  );

  // Compte de pages annoncé AVANT d'imprimer, pour CHAQUE densité : c'est le
  // seul chiffre qui rend le choix lisible (« 8 pages » contre « 6 »). Le même
  // calcul que le document, aux mêmes capacités — on ne promet pas « 2 pages »
  // pour en sortir 4 (cf. core/feuilleNotes.js et lib/feuilleNotesDoc.js).
  const pagesPour = useMemo(() => {
    if (!nbColonnes) return {};
    const out = {};
    for (const [cle, d] of Object.entries(DENSITES)) {
      out[cle] = construireFeuille({
        groupes, eleves, vierge: true, lignesVides: vides,
        maxColonnes: d.colonnes, maxLignes: d.lignes,
      }).pages.length;
    }
    return out;
  }, [groupes, eleves, vides, nbColonnes]);
  const nbPages = pagesPour[densite] ?? 0;

  // Rien à imprimer : pas de bouton. Une grille sans colonne est une page
  // blanche, et un bouton qui produit une page blanche se lit comme une panne.
  if (!nbColonnes) return null;

  const imprimer = () => {
    const { sheets, profile } = feuilleNotesSheets({
      school, sys, classe, periode, portee, enseignant,
      groupes, eleves, valeur, vierge, lignesVides: vides, densite,
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
              <button type="button" onClick={imprimer} className="btn-primary"
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
