// LA FEUILLE DE NOTES — saisie primaire des matières à NOTE UNIQUE, toutes les matières côte à côte.
//
// Une ligne par élève, une colonne par matière (« Dictée-Question /40 »), comme la feuille papier : on saisit
// une colonne entière de haut en bas sans changer de matière. Les colonnes de droite (Total, Moyenne /20, Rang,
// Cote) sont en lecture seule et se recalculent à chaque note.
//
// Ce composant ne parle PAS au store : il reçoit les notes et un `onSave` (le `savePrimNote` du store, qui
// écrit en local, met en file hors connexion et synchronise). Il ne décide de rien non plus : les colonnes, les
// barèmes et les calculs viennent de `core/grilleNoteUnique`.
//
// FLUIDITÉ : chaque case est un composant mémoïsé dont les props sont des chaînes ; une note enregistrée ne
// redessine que sa case et sa ligne de totaux, pas les 900 cases d'une classe de 60 × 15.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { celluleSuivante } from '../../lib/gridNavigation';
import { displayGrade } from '../../lib/gradeEntry';
import { primNkey } from '../../core/primEngine';
import {
  lireSaisie, matriceCollee, calculerLigne, rangsDesMoyennes, compteurColonne,
} from '../../core/grilleNoteUnique';
import { toast } from '../../store/toastStore';

const lireLocal = (cle, defaut) => { try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; } };
const ecrireLocal = (cle, v) => { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } };

const Cellule = memo(function Cellule({
  row, col, valeur, statut, max, erreur, nonEnreg, poser, onValider, onTouche, onColler, titre, ferme = false,
}) {
  // `local` = ce qui est en cours de frappe ; null = la case montre la valeur enregistrée.
  const [local, setLocal] = useState(null);
  const vide = (valeur == null || valeur === '') && statut !== 'absent';
  const affiche = local ?? (statut === 'absent' ? 'ABS' : displayGrade(valeur));
  const valider = () => {
    if (local === null) return;                       // aucune frappe : on n'écrit RIEN (jamais d'effacement par erreur)
    const ok = onValider(row, col, local);
    if (ok !== false) setLocal(null);                 // refusée : le texte reste, en rouge, jusqu'à correction
  };
  const touche = (e) => {
    const el = e.currentTarget;
    if (e.key === 'Escape') { setLocal(null); el.blur(); return; }
    const sansSel = el.selectionStart === el.selectionEnd;
    const caret = { auDebut: sansSel && el.selectionStart === 0, aLaFin: sansSel && el.selectionStart === String(el.value).length };
    if (onTouche(e.key, row, col, caret)) e.preventDefault();
    else if (e.key === 'Enter') el.blur();
  };
  const coller = (e) => {
    const m = matriceCollee(e.clipboardData?.getData('text'));
    if (!m) return;                                   // une seule valeur : collage ordinaire
    e.preventDefault();
    onColler(m, row, col);
  };
  const couleur = ferme ? 'border border-gray-200 bg-gray-100 text-gray-400'
    : erreur ? 'border-2 border-red-500 bg-red-50 text-red-700'
    : nonEnreg ? 'border-2 border-red-400 bg-red-50'
    : statut === 'absent' ? 'border border-amber-200 bg-amber-50 text-amber-700 italic'
    : vide ? 'border border-amber-200 bg-amber-50/60'
    : 'border border-gray-200 bg-white';
  return (
    <div className="relative">
      <input
        ref={poser(row, col)}
        type="text"
        inputMode="decimal"
        value={affiche}
        readOnly={ferme}
        tabIndex={ferme ? -1 : 0}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={valider}
        onKeyDown={touche}
        onPaste={coller}
        maxLength={6}
        aria-label={titre}
        aria-invalid={!!erreur}
        title={erreur || (nonEnreg ? 'Pas encore enregistrée sur le serveur : gardée ici, elle sera renvoyée.' : titre)}
        className={`w-14 rounded px-1 py-1 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-300 ${couleur}`}
      />
      {erreur && (
        <span role="alert" className="pointer-events-none absolute left-0 top-full z-30 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
          {erreur}
        </span>
      )}
    </div>
  );
});

// Barème d'une colonne, modifiable à l'endroit où l'on saisit. Valide à la sortie de la case ; vide ou identique : rien.
function BaremeSaisie({ valeur, onValider, desactive }) {
  const [local, setLocal] = useState(null);
  const sortir = () => {
    if (local === null) return;
    const n = Number(String(local).replace(',', '.'));
    setLocal(null);
    if (Number.isFinite(n) && n !== valeur) onValider(n);
  };
  return (
    <span className="inline-flex items-center justify-center gap-0.5 text-[11px] font-normal text-gray-500">
      /
      <input
        type="text" inputMode="decimal" maxLength={4}
        value={local ?? String(valeur)}
        disabled={desactive}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={sortir}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setLocal(null); e.currentTarget.blur(); } }}
        aria-label="Barème"
        className="w-9 rounded border border-transparent bg-transparent px-0.5 py-0 text-center text-[11px] tabular-nums text-gray-600 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-300 disabled:opacity-50"
      />
    </span>
  );
}

export default function PrimGrilleNoteUnique({
  classId, eleves, colonnes, notes, enAttente, ua, bareme, voirTout = true,
  onSave, onUneMatiere, onSoumettre, envoi = false, bilan = null, nbASoumettre = 0, nbAutres = 0, t,
  nonEvalueeDe = () => false, onNonEvaluee = null, onBareme = null,
}) {
  // ── réglages de l'écran, mémorisés sur le poste ──
  const cleMasque = `nc_grille_masquees_${classId}`;
  const [masquees, setMasquees] = useState(() => {
    try { return new Set(JSON.parse(lireLocal(cleMasque, '[]'))); } catch { return new Set(); }
  });
  useEffect(() => {
    try { setMasquees(new Set(JSON.parse(lireLocal(cleMasque, '[]')))); } catch { setMasquees(new Set()); }
  }, [cleMasque]);
  const basculerMatiere = (id) => setMasquees((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id);
    ecrireLocal(cleMasque, JSON.stringify([...n]));
    return n;
  });
  const [entree, setEntree] = useState(() => (lireLocal('nc_grille_entree', 'bas') === 'droite' ? 'droite' : 'bas'));
  const changerEntree = (v) => { setEntree(v); ecrireLocal('nc_grille_entree', v); };

  const toutAfficher = (oui) => {
    const n = oui ? new Set() : new Set(colonnes.map((c) => c.competenceId));
    ecrireLocal(cleMasque, JSON.stringify([...n]));
    setMasquees(n);
  };

  const affichees = useMemo(() => colonnes.filter((c) => !masquees.has(c.competenceId)), [colonnes, masquees]);

  // ── lecture des notes ──
  const ligneDe = (eleveId, c) => notes[primNkey(eleveId, c.competenceId, c.critereId, ua)];

  // Calculs de droite : sur TOUTES les colonnes (masquer une matière à l'écran ne change pas la moyenne).
  const calculs = useMemo(() => {
    const out = {};
    const moyennes = {};
    for (const e of eleves) {
      const r = calculerLigne(colonnes.filter((c) => !nonEvalueeDe(c.competenceId)).map((c) => {
        const n = notes[primNkey(e.id, c.competenceId, c.critereId, ua)];
        return { bareme: c.bareme, note: n?.note, statut: n?.statut };
      }), bareme);
      out[e.id] = r;
      moyennes[e.id] = r.moyenne;
    }
    const rangs = rangsDesMoyennes(moyennes);
    for (const e of eleves) out[e.id].rang = rangs[e.id] ?? null;
    return out;
  }, [eleves, colonnes, notes, ua, bareme, nonEvalueeDe]);

  const compteurs = useMemo(() => colonnes.map((c) => compteurColonne(
    eleves.map((e) => { const n = notes[primNkey(e.id, c.competenceId, c.critereId, ua)]; return { note: n?.note, statut: n?.statut }; }),
  )), [colonnes, eleves, notes, ua]);
  const compteurDe = (id) => compteurs[colonnes.findIndex((c) => c.competenceId === id)];

  // ── enregistrement ──
  const [enCours, setEnCours] = useState(0);
  const [erreurs, setErreurs] = useState({});      // 'row:col' → message court
  const [annuler, setAnnuler] = useState(null);    // { texte, restaurer }
  const minuterie = useRef(null);
  const enregistrer = useCallback(async (args) => {
    setEnCours((n) => n + 1);
    try { await onSave(args); } finally { setEnCours((n) => n - 1); }
  }, [onSave]);

  // Les dernières valeurs, lues SANS changer l'identité des fonctions passées aux cases : une note enregistrée
  // ne doit pas redessiner les 900 cases, seulement la sienne.
  const dernier = useRef({});
  dernier.current = { notes, t, affichees, eleves, ua, enregistrer };

  const cleErr = (r, c) => `${r}:${c}`;
  const poserErreur = (r, c, msg) => setErreurs((p) => {
    const k = cleErr(r, c);
    if (msg == null) { if (!(k in p)) return p; const n = { ...p }; delete n[k]; return n; }
    return { ...p, [k]: msg };
  });

  // Renvoie false si la saisie est REFUSÉE (la case reste en rouge, rien n'est écrit).
  const valider = useCallback((r, c, texte, { silencieux = false } = {}) => {
    const { notes, t, affichees, eleves, ua, enregistrer } = dernier.current;
    const col = affichees[c]; const eleve = eleves[r];
    if (!col || !eleve) return true;
    const lu = lireSaisie(texte, col.bareme);
    if (lu.type === 'erreur') { poserErreur(r, c, lu.message); return false; }
    poserErreur(r, c, null);
    const actuelle = notes[primNkey(eleve.id, col.competenceId, col.critereId, ua)];
    const base = { eleveId: eleve.id, competenceId: col.competenceId, critereId: col.critereId, pointsMax: col.bareme };
    if (lu.type === 'absent') {
      if (actuelle?.statut !== 'absent') enregistrer({ ...base, note: '', statut: 'absent' });
    } else if (lu.type === 'note') {
      const meme = actuelle?.note != null && String(actuelle.note) === lu.valeur && !actuelle?.statut;
      if (!meme) enregistrer({ ...base, note: lu.valeur, statut: null });
    } else if (actuelle && (actuelle.note != null || actuelle.statut)) {
      // Une case VIDÉE volontairement efface la note — après la sortie de la case, avec un « Annuler » possible.
      const avant = { note: actuelle.note == null ? '' : String(actuelle.note), statut: actuelle.statut || null };
      enregistrer({ ...base, note: '', statut: null });
      if (!silencieux) {
        clearTimeout(minuterie.current);
        setAnnuler({
          texte: t(`Note de ${eleve.name} effacée (${col.intitule}).`, `${eleve.name}'s mark erased (${col.intitule}).`),
          restaurer: () => enregistrer({ ...base, note: avant.note, statut: avant.statut }),
        });
        minuterie.current = setTimeout(() => setAnnuler(null), 20000);
      }
    }
    return true;
  }, []);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  // ── navigation clavier ──
  const cellules = useRef(new Map());
  const poser = useCallback((r, c) => (el) => {
    const k = `${r}:${c}`;
    if (el) cellules.current.set(k, el); else cellules.current.delete(k);
  }, []);
  const entreeRef = useRef(entree);
  entreeRef.current = entree;
  const dims = useRef({});
  dims.current = { rows: eleves.length, cols: affichees.length };
  const surTouche = useCallback((key, r, c, caret) => {
    let k = key; let cr = caret;
    if (key === 'Enter' && entreeRef.current === 'droite') { k = 'ArrowRight'; cr = { auDebut: true, aLaFin: true }; }
    const cible = celluleSuivante(k, { row: r, col: c, rows: dims.current.rows, cols: dims.current.cols }, cr);
    const el = cible && cellules.current.get(`${cible.row}:${cible.col}`);
    if (!el) return false;
    el.focus();                                   // la case quittée enregistre à son `blur`
    el.select();
    return true;
  }, []);

  // ── coller un bloc depuis Excel ──
  const coller = useCallback((matrice, r0, c0) => {
    const { t, affichees, eleves } = dernier.current;
    let ok = 0; let ko = 0;
    matrice.forEach((ligne, i) => ligne.forEach((texte, j) => {
      const r = r0 + i; const c = c0 + j;
      if (r >= eleves.length || c >= affichees.length) return;
      if (texte === '') return;                    // une case vide du bloc n'efface rien
      if (valider(r, c, texte, { silencieux: true })) ok += 1; else ko += 1;
    }));
    if (ko) toast.error(t(`${ok} note(s) collée(s), ${ko} refusée(s) (cases en rouge).`, `${ok} mark(s) pasted, ${ko} refused (red cells).`));
    else toast.success(t(`${ok} note(s) collée(s).`, `${ok} mark(s) pasted.`));
  }, [valider]);

  // ── indicateur d'enregistrement et garde-fou de sortie ──
  const nkeysGrille = useMemo(() => {
    const s = new Set();
    for (const e of eleves) for (const c of colonnes) s.add(primNkey(e.id, c.competenceId, c.critereId, ua));
    return s;
  }, [eleves, colonnes, ua]);
  const enAttenteIci = useMemo(() => {
    let n = 0; for (const k of enAttente) if (nkeysGrille.has(k)) n += 1; return n;
  }, [enAttente, nkeysGrille]);
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  useEffect(() => {
    if (!enCours && !enAttenteIci) return undefined;
    const garde = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', garde);
    return () => window.removeEventListener('beforeunload', garde);
  }, [enCours, enAttenteIci]);

  const etat = enCours > 0
    ? { ton: 'text-gray-500', texte: t('En cours…', 'Saving…') }
    : enAttenteIci > 0
      ? { ton: 'text-amber-700', texte: horsLigne
        ? t(`${enAttenteIci} note(s) gardée(s) ici — hors ligne, elles partiront au retour du réseau`, `${enAttenteIci} mark(s) kept here — offline, they will be sent when back online`)
        : t(`${enAttenteIci} note(s) pas encore envoyée(s)`, `${enAttenteIci} mark(s) not sent yet`) }
      : { ton: 'text-emerald-700', texte: t('Enregistré ✓', 'Saved ✓') };

  const nbErreurs = Object.keys(erreurs).length;

  return (
    <div className="space-y-2">
      {/* ── barre d'outils ── */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span role="status" className={`text-xs font-medium ${etat.ton}`}>{etat.texte}</span>
        {nbErreurs > 0 && <span className="text-xs font-medium text-red-600">{t(`${nbErreurs} case(s) refusée(s)`, `${nbErreurs} cell(s) refused`)}</span>}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">
            {t('Matières affichées', 'Subjects shown')} ({affichees.length}/{colonnes.length})
          </summary>
          <div className="absolute z-40 mt-1 max-h-80 w-72 overflow-auto rounded-lg border border-gray-200 bg-white p-2 shadow-md">
            <div className="mb-1 flex gap-3 border-b border-gray-100 px-1 pb-2 text-xs">
              <button type="button" className="text-brand-700 hover:underline" onClick={() => toutAfficher(true)}>{t('Tout sélectionner', 'Select all')}</button>
              <button type="button" className="text-brand-700 hover:underline" onClick={() => toutAfficher(false)}>{t('Tout effacer', 'Clear all')}</button>
            </div>
            {colonnes.map((c) => (
              <label key={c.competenceId} className="flex items-center gap-2 px-1 py-1 text-xs text-gray-700">
                <input type="checkbox" checked={!masquees.has(c.competenceId)} onChange={() => basculerMatiere(c.competenceId)} />
                {c.intitule} <span className="text-gray-400">/{c.bareme}</span>
              </label>
            ))}
          </div>
        </details>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          {t('Entrée :', 'Enter:')}
          <select value={entree} onChange={(e) => changerEntree(e.target.value)} className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs">
            <option value="bas">{t('descendre ↓', 'move down ↓')}</option>
            <option value="droite">{t('aller à droite →', 'move right →')}</option>
          </select>
        </label>
      </div>

      {nbAutres > 0 && (
        <p className="text-xs text-gray-500">
          {t(`${nbAutres} matière(s) à plusieurs critères : à saisir en mode « Par matière ».`,
            `${nbAutres} subject(s) with several criteria: enter them in “By subject” mode.`)}
        </p>
      )}

      {/* ── la feuille ── */}
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-gray-200">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-10 border-b border-gray-200 bg-white px-2 py-3 text-center font-medium text-gray-400">{t('N°', 'No.')}</th>
              <th className="sticky left-10 top-0 z-30 min-w-[11rem] border-b border-r border-gray-200 bg-white px-3 py-3 text-left font-medium text-gray-600">{t('Élève', 'Student')}</th>
              {affichees.map((c) => {
                const k = compteurDe(c.competenceId);
                return (
                  <th key={c.competenceId} className="sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-3 text-center align-bottom font-medium text-gray-600" style={{ minWidth: '5rem' }}>
                    <span className="block max-w-[8rem] text-xs font-semibold leading-tight text-gray-700" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={c.intitule}>{c.intitule}</span>
                    {onBareme
                      ? <BaremeSaisie valeur={c.bareme} desactive={nonEvalueeDe(c.competenceId)} onValider={(n) => onBareme(c, n)} />
                      : <span className="block text-[11px] font-normal text-gray-500">/{c.bareme}</span>}
                    {onNonEvaluee && (
                      <label className="mt-0.5 flex cursor-pointer items-center justify-center gap-1 text-[10px] font-normal text-gray-400" title={t('Non évaluée pour cette classe à cette UA : les élèves n’ont pas zéro', 'Not assessed for this class at this LU: pupils do not get zero')}>
                        <input type="checkbox" className="h-3 w-3 rounded border-gray-300" checked={nonEvalueeDe(c.competenceId)} onChange={(e) => onNonEvaluee(e.target.checked, c.competenceId)} />
                        {t('non évaluée', 'not assessed')}
                      </label>
                    )}
                                        {k && <span className={`block text-[10px] font-normal ${k.faites === k.total ? 'text-emerald-600' : 'text-amber-600'}`}>{k.faites}/{k.total}</span>}
                  </th>
                );
              })}
              {voirTout && (
                <>
                  <th className="sticky top-0 z-20 border-b border-l border-gray-200 bg-white px-2 py-3 text-right font-medium text-gray-600">{t('Total', 'Total')}</th>
                  <th className="sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-3 text-right font-medium text-gray-600">{t('Moy. /20', 'Avg /20')}</th>
                  <th className="sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-3 text-right font-medium text-gray-600">{t('Rang', 'Rank')}</th>
                  <th className="sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-3 text-right font-medium text-gray-600">{t('Cote', 'Grade')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {eleves.map((e, r) => {
              const calc = calculs[e.id];
              return (
                <tr key={e.id}>
                  <td className="sticky left-0 z-10 w-10 border-b border-gray-100 bg-white px-2 py-1 text-center text-xs tabular-nums text-gray-400">{r + 1}</td>
                  <td className="sticky left-10 z-10 whitespace-nowrap border-b border-r border-gray-100 bg-white px-3 py-1 font-medium text-gray-700">{e.name}</td>
                  {affichees.map((c, ci) => {
                    const n = ligneDe(e.id, c);
                    return (
                      <td key={c.competenceId} className="border-b border-gray-100 px-1.5 py-1 text-center">
                        <Cellule
                          row={r} col={ci}
                          valeur={n?.note == null ? '' : String(n.note)}
                          statut={n?.statut || null}
                          max={c.bareme}
                          erreur={erreurs[cleErr(r, ci)] || null}
                          nonEnreg={enAttente.has(primNkey(e.id, c.competenceId, c.critereId, ua))}
                          poser={poser}
                          onValider={valider}
                          onTouche={surTouche}
                          onColler={coller}
                          titre={`${e.name} — ${c.intitule} /${c.bareme}`}
                          ferme={nonEvalueeDe(c.competenceId)}
                        />
                      </td>
                    );
                  })}
                  {voirTout && (
                    <>
                      <td className="border-b border-l border-gray-100 bg-white px-2 py-1 text-right text-xs tabular-nums text-gray-600">
                        {calc.total == null ? '—' : `${displayGrade(calc.total)} /${calc.possible}`}
                      </td>
                      <td className="border-b border-gray-100 bg-white px-2 py-1 text-right text-sm font-semibold tabular-nums text-gray-800">
                        {calc.moyenne == null ? '—' : displayGrade(calc.moyenne.toFixed(2))}
                      </td>
                      <td className="border-b border-gray-100 bg-white px-2 py-1 text-right text-xs tabular-nums text-gray-600">{calc.rang ?? '—'}</td>
                      <td className="border-b border-gray-100 bg-white px-2 py-1 text-right text-xs font-semibold text-gray-700">{calc.cote || '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── « Annuler » après une case vidée ── */}
      {annuler && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{annuler.texte}</span>
          <button type="button" className="rounded border border-amber-400 bg-white px-2 py-0.5 text-xs font-semibold hover:bg-amber-100"
            onClick={() => { annuler.restaurer(); setAnnuler(null); }}>
            {t('Annuler', 'Undo')}
          </button>
        </div>
      )}

      {/* ── Enregistrer / soumettre : même geste que la saisie par matière ── */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
        <span role="status" className={`text-xs ${etat.ton}`}>{enCours > 0 || enAttenteIci > 0 ? etat.texte : t('Enregistré automatiquement ✓', 'Saved automatically ✓')}</span>
        <div className="flex items-center gap-3">
          {bilan && <span role="status" className={`text-xs ${bilan.ko ? 'text-red-700' : 'text-emerald-700'}`}>{bilan.texte}</span>}
          <button type="button" onClick={onSoumettre} disabled={envoi || !nbASoumettre}
            title={t('Chaque case s’enregistre à la sortie. Ce bouton confirme que tout est arrivé sur le serveur.', 'Each cell saves when you leave it. This button confirms everything reached the server.')}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300">
            {envoi ? t('Envoi en cours…', 'Sending…') : t(`Soumettre les notes (${nbASoumettre})`, `Submit marks (${nbASoumettre})`)}
          </button>
        </div>
      </div>
    </div>
  );
}
