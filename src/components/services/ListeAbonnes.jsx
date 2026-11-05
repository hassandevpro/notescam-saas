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
// donc des LIGNES en grille (`LigneAbonne`), qui se replient en carte sous
// `sm`. Le critère d'acceptation est explicite : « aucun défilement horizontal
// sur la liste, y compris sur téléphone ».
//
// ── POURQUOI UN RENDU PAR TRANCHES, ET PAS UNE LIBRAIRIE ───────────────────
//
// Le registre doit rester fluide à 700 élèves. Le dépôt interdit d'introduire
// une technologie nouvelle sans autorisation (AGENTS.md), donc pas de
// virtualisation tierce : on rend une TRANCHE, avec un bouton pour tout
// afficher. Moins savant, sans dépendance, et le compte est annoncé en toutes
// lettres — « 60 sur 78 élèves affichés » — pour que personne ne croie voir
// toute la liste alors qu'il en manque dix-huit.
//
// ── LE TRI EST EN PASTILLES, PAS EN LISTE DÉROULANTE ──────────────────────
//
// Trois choix seulement, et on en change souvent : trois boutons montrent
// l'option RETENUE sans qu'on ait à ouvrir quoi que ce soit, et se touchent du
// pouce. Une liste déroulante cache l'état courant derrière un geste.
import { useState } from 'react';
import LigneAbonne from './LigneAbonne';

const PAR_TRANCHE = 60;

const TRIS = [
  ['nom', ['Nom', 'Name', 'Nombre']],
  ['reste', ['Reste', 'Balance', 'Saldo']],
  ['statut', ['Statut', 'Status', 'Estado']],
];

export default function ListeAbonnes({
  abonnes = [], tri, setTri, libelleStatut, canCollect,
  onEncaisser, onFiche, money, t, onAbonner, periodeLabel = '',
}) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? abonnes : abonnes.slice(0, PAR_TRANCHE);

  // Le bouton d'abonnement, identique dans les deux branches. Il n'existait
  // que dans la branche VIDE : dès le premier abonné il disparaissait, et le
  // seul chemin pour abonner le deuxième élève passait par le menu replié
  // « ⋯ Plus ». Une école inscrit ses élèves un par un pendant toute la
  // rentrée : elle cherchait donc cette action à chaque fois.
  const boutonAbonner = (principal) => onAbonner && (
    <button
      type="button" onClick={onAbonner} data-role="abonner"
      className={principal
        ? 'mt-3 min-h-[44px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700'
        : 'min-h-[36px] rounded-lg border border-brand-600 px-3 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/30'}
    >
      {principal
        ? t('Abonner des élèves', 'Subscribe students', 'Suscribir alumnos')
        : `+ ${t('Abonner un élève', 'Subscribe a student', 'Suscribir un alumno')}`}
    </button>
  );

  if (!abonnes.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
        <p className="text-sm text-slate-500">
          {t('Aucun élève abonné à ce service.', 'No student subscribed to this service.',
             'Ningún alumno suscrito.')}
        </p>
        {boutonAbonner(true)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {t('Trier par', 'Sort by', 'Ordenar por')}
          </span>
          {TRIS.map(([cle, lib]) => (
            <button
              key={cle} type="button" onClick={() => setTri(cle)}
              aria-pressed={tri === cle}
              className={`min-h-[36px] rounded-lg border px-3 text-sm font-semibold ${
                tri === cle
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}
            >
              {t(...lib)}
            </button>
          ))}
        </div>

        {/* LE COMPTE, EN TOUTES LETTRES. Une tranche affichée sans son total
            laisse croire que la liste est complète ; c'est le genre d'erreur
            qui fait relancer 60 familles sur 78. */}
        <span
          className="ml-auto text-sm text-slate-500 tabular-nums"
          data-role="compte-abonnes"
        >
          {visibles.length === abonnes.length
            ? `${abonnes.length} ${t('élève(s) abonné(s)', 'subscribed student(s)', 'alumno(s) suscrito(s)')}`
            : t(`${visibles.length} sur ${abonnes.length} élèves affichés`,
                `${visibles.length} of ${abonnes.length} students shown`,
                `${visibles.length} de ${abonnes.length} alumnos mostrados`)}
        </span>

        {boutonAbonner(false)}
      </div>

      {/* DE QUOI PARLE LA COLONNE « RESTE ». Depuis qu'une école peut créer
          ses dix mois d'avance, le même nombre vaut soit le mois, soit
          l'année — et rien à l'écran ne le disait. Un chiffre d'argent sans
          sa période est un chiffre faux : c'est celui qu'on réclame au parent
          qui est devant. */}
      {periodeLabel && (
        <p className="mb-1.5 text-xs text-slate-500" data-role="periode-liste">
          {t('Reste à payer pour', 'Balance due for', 'Saldo para')}{' '}
          <b className="text-slate-700 dark:text-slate-200">{periodeLabel}</b>
        </p>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {visibles.map((a) => (
          <LigneAbonne
            key={a.student_id} a={a} canCollect={canCollect}
            onEncaisser={onEncaisser} onFiche={onFiche}
            libelleStatut={libelleStatut} money={money} t={t}
          />
        ))}
      </ul>

      {!tout && abonnes.length > PAR_TRANCHE && (
        <button
          type="button" onClick={() => setTout(true)} data-role="afficher-tout"
          className="mt-2 w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 py-2 text-sm"
        >
          {t(`Afficher les ${abonnes.length - PAR_TRANCHE} autres`,
             `Show the other ${abonnes.length - PAR_TRANCHE}`,
             `Mostrar los otros ${abonnes.length - PAR_TRANCHE}`)}
        </button>
      )}
    </div>
  );
}
