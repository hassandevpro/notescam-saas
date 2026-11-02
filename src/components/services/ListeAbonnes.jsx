// ONGLET « ÉLÈVES ABONNÉS » — la vue par défaut du registre.
//
// ── CE QUE CET ÉCRAN DOIT PERMETTRE EN QUELQUES SECONDES ───────────────────
//
// Constat du responsable (2026-10-31, captures d'écran) : « la page affiche trop
// d'informations en même temps et devient difficile à utiliser pour une
// secrétaire » ; « la liste Élèves abonnés est coupée à droite (colonnes
// Encaissé, Reste invisibles) et demande de faire défiler ».
//
// La secrétaire a trois gestes à faire : trouver un élève, encaisser, imprimer.
// Cet écran ne porte donc que ce qu'il faut pour les trois : le NOM (avec la
// classe dessous), le RESTE À PAYER, un ÉTAT lisible sans calcul, et le bouton.
// Matricule, section, mois, attendu, encaissé existent toujours — dans la fiche
// de l'élève, à un clic.
//
// ── PAS DE TABLEAU, ET C'EST VOULU ─────────────────────────────────────────
//
// Un `<table>` impose sa largeur : à 375 px, huit colonnes débordent et les
// dernières — justement Reste et Encaisser — sortent de l'écran. On construit
// donc des LIGNES en grille, qui se replient en carte sous `sm`. Le critère
// d'acceptation est explicite : « aucun défilement horizontal sur la liste, y
// compris sur téléphone ».
//
// ── POURQUOI UN RENDU PAR TRANCHES, ET PAS UNE LIBRAIRIE ───────────────────
//
// Le registre doit rester fluide à 700 élèves. Le dépôt interdit d'introduire
// une technologie nouvelle sans autorisation (AGENTS.md), donc pas de
// virtualisation tierce : on rend une TRANCHE, avec un bouton pour tout
// afficher. Moins savant, sans dépendance, et le compte total reste annoncé —
// personne ne croit voir toute la liste alors qu'il en manque.
import { useState } from 'react';

const PAR_TRANCHE = 60;

// Les quatre états d'un abonné, et leur ton. « Reste à payer » est la colonne ;
// l'état ne répète donc pas le chiffre, il le qualifie.
const TON = {
  a_jour:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  partiel:    'bg-amber-50 text-amber-800 border-amber-200',
  impaye:     'bg-rose-50 text-rose-700 border-rose-200',
  sans_dette: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function ListeAbonnes({
  abonnes = [], tri, setTri, libelleStatut, canCollect,
  onEncaisser, onFiche, money, t, onAbonner,
}) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? abonnes : abonnes.slice(0, PAR_TRANCHE);

  if (!abonnes.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
        <p className="text-sm text-slate-500">
          {t('Aucun élève abonné à ce service.', 'No student subscribed to this service.',
             'Ningún alumno suscrito.')}
        </p>
        {onAbonner && (
          <button
            type="button" onClick={onAbonner}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t('Abonner des élèves', 'Subscribe students', 'Suscribir alumnos')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span className="text-sm text-slate-500">
          {abonnes.length} {t('élève(s) abonné(s)', 'subscribed student(s)', 'alumno(s)')}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {t('Trier', 'Sort', 'Ordenar')}
          </span>
          <select
            value={tri} onChange={(e) => setTri(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
          >
            <option value="nom">{t('Nom', 'Name', 'Nombre')}</option>
            <option value="reste">{t('Reste à payer', 'Balance due', 'Saldo')}</option>
            <option value="statut">{t('État', 'Status', 'Estado')}</option>
          </select>
        </label>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {visibles.map((a) => (
          <li key={a.student_id}>
            {/* Une seule rangée en grille : à partir de `sm` les quatre blocs
                sont côte à côte, en dessous ils s'empilent en carte. Rien ne
                sort jamais de l'écran. */}
            <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_8rem_7rem_auto] items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              {/* Nom + classe. Le bouton couvre toute la zone cliquable : la
                  cible tactile fait la hauteur de la ligne, pas celle du texte. */}
              <button
                type="button" onClick={() => onFiche(a)}
                className="min-w-0 text-left py-1"
                title={t('Ouvrir la fiche', 'Open the card', 'Abrir la ficha')}
              >
                <span className="block truncate font-medium text-gray-900 dark:text-slate-100">
                  {a.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {a.className || '—'}
                </span>
              </button>

              {/* Reste à payer — aligné à droite, jamais collé, jamais tronqué. */}
              <span className="order-3 sm:order-none text-right tabular-nums whitespace-nowrap font-semibold text-gray-900 dark:text-slate-100">
                {a.reste > 0 ? money(a.reste) : '—'}
              </span>

              <span className="order-4 sm:order-none">
                <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TON[a.statut]}`}>
                  {libelleStatut(a.statut)}
                </span>
              </span>

              {canCollect && (
                <button
                  type="button" disabled={!a.reste}
                  onClick={(e) => { e.stopPropagation(); onEncaisser(a); }}
                  title={a.reste ? '' : t('Rien à encaisser', 'Nothing to collect', 'Nada que cobrar')}
                  className="min-h-[44px] rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-30 whitespace-nowrap"
                >
                  {t('Encaisser', 'Collect', 'Cobrar')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!tout && abonnes.length > PAR_TRANCHE && (
        <button
          type="button" onClick={() => setTout(true)}
          className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-600 py-2 text-sm"
        >
          {t(`Afficher les ${abonnes.length - PAR_TRANCHE} autres`,
             `Show the other ${abonnes.length - PAR_TRANCHE}`,
             `Mostrar los otros ${abonnes.length - PAR_TRANCHE}`)}
        </button>
      )}
    </div>
  );
}
