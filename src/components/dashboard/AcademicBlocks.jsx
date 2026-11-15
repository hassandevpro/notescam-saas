// BLOCS pédagogiques & frais du tableau de bord (direction : admin / censeur).
// Le calcul vit dans `useAcademicStats` ; les composants ne font que dessiner.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { clsStat } from '../../core/bulletinEngine';
import { resolveClassEngine } from '../../core/engineResolver';
// Le barème vient de la classe (`grade_max`), pas de sa langue — cf. D21.
import { bulletinScale } from '../../core/bulletinScale';
import { geGradeMax } from '../../lib/useCountry';
import { feeDashboard } from '../../lib/feeEngine';
import { TRACKS, trackKeyForClass, periodAt } from '../../lib/calendarTracks';
import { periodeCourante } from '../../lib/periodService';
import { suiviDeClasse, jourDouala, joursEntre } from '../../lib/periodStatus';
import { nonEvalKey } from '../../core/primEngine';
import { classEntryProgress, latestPeriodWithData, indexPrimNotes } from '../../lib/gradeEntryProgress';
import { StatCard, BlockCard, CountPill, EmptyHint } from './shared';
import { subjectsForClass } from '../../lib/teacherScope';
import { aSuivre, aFaire, libelleAlerte } from '../../lib/dashboardAlertes';
import { kpisGlobaux, tendance, barresParClasse } from '../../lib/dashboardKpi';
import { useMessagesStore } from '../../store/messagesStore';
import { buildWhatsAppUrl } from '../../lib/messagesService';

// Moteurs dont les notes vivent dans `gradeMap` : les seuls pour lesquels une
// moyenne de classe a un sens (l'APC et le fondamental évaluent par cotes).
const isNumericEngine = (engine) => engine === 'classic' || engine === 'sc';

/**
 * Agrégats académiques + frais de l'établissement (périmètre déjà appliqué par
 * le store).
 *
 * La PÉRIODE suivie n'est plus devinée depuis les notes déjà saisies : c'est
 * celle qu'ouvre le CALENDRIER SCOLAIRE, sur la piste propre à chaque classe
 * (séquences MINESEC, UA du primaire MINEDUB, trimestres de maternelle, terms
 * anglophones). Tant que le calendrier n'est pas rempli, on retombe sur
 * l'heuristique historique « dernière période saisie + 1 ».
 */
export function useAcademicStats({
  school, countryCode, classes, subjects, students,
  gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
  seqDates, fees, getClassFeeGrid, today, primNonEvaluees, teachers, role, teacherId,
  classesFiltre = null, calendrierOk = true,
}) {
  // Index des notes primaires construit UNE fois : sans lui, chaque (classe × UA)
  // rebalaierait tout `primNotes`.
  const sources = useMemo(
    () => ({ gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
             primIndex: indexPrimNotes(primNotes) }),
    [gradeMap, apcNotes, primNotes, matObservations, apcReferentiel],
  );

  const classStats = useMemo(() => classes.map((cls) => {
    const subs   = subjects.filter((s) => s.class_id === cls.id);
    const studs  = students.filter((s) => s.class_id === cls.id);
    const sys    = cls.system || 'FR';
    const engine = resolveClassEngine(school, cls);
    const trackKey = trackKeyForClass(school, cls, countryCode);
    const track    = TRACKS[trackKey];

    // Période de référence des statistiques : la dernière RÉELLEMENT saisie.
    const seq = latestPeriodWithData({
      engine, cls, subs, studs, maxOrder: track.periods.length, ...sources,
    });
    // Période à compléter : le calendrier fait autorité.
    const cal = periodeCourante(trackKey, seqDates, today);

    // Le barème de la classe (et non celui de sa langue) : sans lui, une classe EN notée /20 ou une
    // classe FR /10 affichait une moyenne calculée /100 ou /20 sous une étiquette « /20 » ou « /10 ».
    const { maxScale, passThreshold } = bulletinScale(cls, sys, geGradeMax(school));
    const stats = seq !== null && isNumericEngine(engine)
      ? clsStat(studs, gradeMap, cls.id, [seq], subs, sys, {}, { maxScale })
      : null;

    // LE BARÈME SE CALCULE ICI, et voyage avec la ligne (D21 + D24 bis).
    // Il se lisait dans `ClassTable`, qui ne reçoit QUE `classStats` : `school`
    // y était une variable LIBRE. Chaque administrateur ouvrant /app déclenchait
    // donc « school is not defined » et voyait une page blanche — `vite build` ne
    // voit pas cette faute, elle n'existe qu'au rendu de ce composant-là. Le
    // barème appartient de toute façon à la statistique, pas au tableau qui
    // l'affiche : calculé une fois ici, il ne peut plus manquer son contexte.
    // Période précédente (même barème) : sert aux variations des indicateurs.
    const prevStats = stats && seq > 1
      ? clsStat(studs, gradeMap, cls.id, [seq - 1], subs, sys, {}, { maxScale })
      : null;
    return { cls, subs, prevStats, studs, sys, engine, trackKey, track, seq, cal, stats, maxScale, passThreshold };
  }), [classes, subjects, students, school, countryCode, seqDates, today, gradeMap, sources]);

  const globalPassRate = useMemo(() => {
    const all = classStats.filter((c) => c.stats !== null);
    if (!all.length) return null;
    const total  = all.reduce((s, c) => s + c.stats.graded, 0);
    const passed = all.reduce((s, c) => s + c.stats.above, 0);
    return total ? Math.round((passed / total) * 100) : null;
  }, [classStats]);

  const feesStats = useMemo(() => {
    const feeMap = {};
    (fees || []).forEach((f) => { feeMap[f.student_id] = f; });
    // Moteur tarifaire : taux de recouvrement + nombre d'élèves en retard
    // (échéances passées non couvertes), grille de classe prise en compte.
    const entries = students.map((s) => ({ student: s, fee: feeMap[s.id], grid: getClassFeeGrid(s.class_id) }));
    const dash = feeDashboard(entries);
    const rate = dash.expected > 0 ? Math.round((dash.collected / dash.expected) * 100) : null;
    return { rate, late: dash.lateTotal, expected: dash.expected, collected: dash.collected };
  }, [fees, students, getClassFeeGrid]);

  // ── NOTES À COMPLÉTER : états par classe et par période ──────────────────────
  // Une période n'est « à saisir » que si elle a COMMENCÉ ; une période passée
  // incomplète reste « en retard » ; une période à venir n'est jamais « à faire »
  // (cf. lib/periodStatus.js pour les règles et l'origine du défaut d'avant).
  const suivi = useMemo(() => {
    const t = today ? jourDouala(today) : jourDouala(new Date());
    const nonEvaluee = (clsId, comp, ua) => (primNonEvaluees || []).includes(nonEvalKey(clsId, comp, ua));
    const lignes = { retard: [], encours: [], ajour: [], avenir: [], estimees: [] };
    for (const c of classStats) {
      // Un enseignant limité à ses matières est jugé sur SES matières, pas sur celles des collègues.
      const subs = subjectsForClass(c.subs, teacherId, c.cls, role, school);
      if (!(c.studs.length > 0 && subs.length > 0)) continue;
      const { cls, studs, engine, trackKey, track, seq } = c;
      const progress = (order) => classEntryProgress({ engine, cls, subs, studs, order, nonEvaluee, ...sources });
      const s = suiviDeClasse(trackKey, seqDates, t, progress);
      const base = { cls, trackKey };
      if (s.sansDate) {
        // Calendrier non renseigné : on ne devine PAS une période future. Seule la période
        // déjà entamée (ou la première) est proposée, et signalée « estimée ».
        const order = seq === null ? 1 : seq;
        const p = progress(order);
        if (p.expected && p.entered < p.expected) {
          lignes.estimees.push({ ...base, etat: 'en_cours', order, entered: p.entered, expected: p.expected,
            period: periodAt(trackKey, order), estimee: true, joursRestants: null });
        }
        continue;
      }
      // Détail par matière (retards seulement : peu nombreux), avec l'enseignant à relancer.
      const detail = (order) => subs.map((sub) => {
        const p = classEntryProgress({ engine, cls, subs: [sub], studs, order, nonEvaluee, ...sources });
        const prof = (teachers || []).find((x) => x.id === sub.teacher_id) || null;
        return { id: sub.id, nom: sub.name, entered: p.entered, expected: p.expected, teacher: prof };
      }).filter((m) => m.expected > 0 && m.entered < m.expected);
      for (const r of s.retards) {
        lignes.retard.push({ ...base, etat: 'en_retard', parMatiere: detail(r.order), order: r.order, entered: r.entered, expected: r.expected,
          period: periodAt(trackKey, r.order), deadline: r.fenetre.deadline, joursRetard: r.joursRetard });
      }
      if (s.courante) {
        const x = s.courante;
        (x.etat === 'a_jour' ? lignes.ajour : lignes.encours).push({
          ...base, etat: x.etat, order: x.order, entered: x.entered, expected: x.expected,
          period: periodAt(trackKey, x.order), deadline: x.fenetre.deadline, joursRestants: x.joursRestants,
          atRisk: x.etat === 'en_cours' && x.joursRestants <= 3,
        });
      }
      if (s.avenir) {
        lignes.avenir.push({ ...base, etat: 'a_venir', order: s.avenir.fenetre.order,
          period: periodAt(trackKey, s.avenir.fenetre.order), start: s.avenir.fenetre.start });
      }
    }
    const aSaisir = [...lignes.encours, ...lignes.estimees];
    return {
      ...lignes,
      classesEnRetard: new Set(lignes.retard.map((i) => i.cls.id)).size,
      aSaisir: aSaisir.length,
      resume: { ajour: lignes.ajour.length, encours: aSaisir.length, retard: new Set(lignes.retard.map((i) => i.cls.id)).size },
    };
  }, [classStats, sources, seqDates, today, primNonEvaluees, teachers, role, teacherId, school]);

  // Compatibilité : les appelants qui lisent encore la liste plate.
  const missingGrades = useMemo(() => [...suivi.retard, ...suivi.encours, ...suivi.estimees], [suivi]);

  // Aucune date renseignée sur AUCUNE piste utilisée : le suivi tourne alors à
  // l'heuristique, ce que le bloc signale à l'administrateur.
  const calendarSet = useMemo(
    () => classStats.some((c) => c.cal !== null),
    [classStats],
  );

  // Indicateurs de direction : calculés une fois, sur les classes à moteur numérique notées.
  const kpiLignes = useMemo(() => classStats.filter((c) => c.stats && (!classesFiltre || classesFiltre.has(c.cls.id))).map((c) => ({
    id: c.cls.id, nom: c.cls.name,
    cur: { avg: c.stats.avg, graded: c.stats.graded, above: c.stats.above, maxScale: c.maxScale },
    prev: c.prevStats ? { avg: c.prevStats.avg, graded: c.prevStats.graded, above: c.prevStats.above, maxScale: c.maxScale } : null,
  })), [classStats, classesFiltre]);
  const kpis = useMemo(() => kpisGlobaux(kpiLignes), [kpiLignes]);
  const barres = useMemo(() => barresParClasse(kpiLignes), [kpiLignes]);

  const dansFiltre = (c) => !classesFiltre || classesFiltre.has(c.cls.id);
  const alertesSuivre = useMemo(() => aSuivre(kpiLignes), [kpiLignes]);
  const alertesFaire = useMemo(() => aFaire({
    retards: suivi.retard.filter(dansFiltre),
    encours: suivi.encours.filter(dansFiltre),
    calendrierConfirme: calendrierOk,
    // Actions de direction seulement : un enseignant ne peut ni affecter ni confirmer.
    matieresSansEnseignant: !['admin', 'censeur'].includes(role) ? 0 : subjects.filter((s) => (!classesFiltre || classesFiltre.has(s.class_id)) && !s.teacher_id).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [suivi, classesFiltre, calendrierOk, subjects, role]);

  return { classStats, globalPassRate, feesStats, missingGrades, suivi, calendarSet, kpis, barres, alertesSuivre, alertesFaire };
}

// ── Indicateurs de direction : chiffres + variation + barres par classe (sans bibliothèque) ──
function Variation({ valeur, unite }) {
  const t = useT();
  const tend = tendance(valeur, unite === '%' ? 0.5 : 0.1);
  if (tend === null) return <span className="text-xs text-gray-500">{t('pas de période précédente comparable', 'no comparable previous period')}</span>;
  const cls = tend === 'stable' ? 'text-gray-600' : tend === 'hausse' ? 'text-emerald-700' : 'text-red-700';
  const fleche = tend === 'hausse' ? '▲' : tend === 'baisse' ? '▼' : '■';
  const nombre = unite === '%' ? `${Math.round(valeur)} pts` : valeur.toFixed(1);
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      <span aria-hidden="true">{fleche} </span>{valeur > 0 ? '+' : ''}{nombre} {t('vs période précédente', 'vs previous period')}
    </span>
  );
}

export function KpiBlock({ kpis, barres }) {
  const t = useT();
  if (!kpis || !kpis.classes) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-600">
        {t('Aucune note saisie pour l’instant : les indicateurs apparaîtront dès les premières notes.', 'No grades entered yet: indicators will appear with the first grades.')}
      </div>
    );
  }
  const max = 20;
  const ligne10 = (10 / max) * 100;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('Moyenne générale', 'Overall average')}</p>
          <p className="text-3xl font-bold text-gray-900">{kpis.moyenne.toFixed(2)}<span className="text-base font-medium text-gray-500"> /20</span></p>
          <Variation valeur={kpis.variationMoyenne} unite="pt" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('Taux de réussite', 'Pass rate')}</p>
          <p className="text-3xl font-bold text-gray-900">{kpis.reussite}<span className="text-base font-medium text-gray-500"> %</span></p>
          <Variation valeur={kpis.variationReussite} unite="%" />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {t(`Sur ${kpis.eleves} élève(s) notés dans ${kpis.classes} classe(s), tous barèmes ramenés sur 20.`, `Across ${kpis.eleves} graded student(s) in ${kpis.classes} class(es), all scales converted to /20.`)}
      </p>
      {barres.length > 0 && (
        <figure className="mt-4" aria-label={t('Moyenne par classe sur 20', 'Average per class out of 20')}>
          <figcaption className="text-xs font-semibold text-gray-600 mb-2">{t('Moyenne par classe (sur 20) — trait = 10', 'Average per class (/20) — line = 10')}</figcaption>
          <ul className="space-y-1.5">
            {barres.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-gray-700" title={b.nom}>{b.nom}</span>
                <span className="relative flex-1 h-4 bg-gray-100 rounded">
                  <span className={`absolute inset-y-0 left-0 rounded ${b.valeur >= 10 ? 'bg-brand-600' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (b.valeur / max) * 100)}%` }} />
                  <span className="absolute inset-y-0 w-px bg-gray-600" style={{ left: `${ligne10}%` }} aria-hidden="true" />
                </span>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-gray-800">{b.valeur.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </figure>
      )}
    </div>
  );
}

// ── À suivre / À faire : constats sur les résultats et actions de la direction ──
function ListeAlertes({ titre, items, vide, lien }) {
  const t = useT();
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4" aria-label={titre}>
      <h3 className="text-sm font-bold text-gray-800 mb-2">{titre}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600">{vide}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((x, i) => (
            <li key={`${x.type}-${x.classId || ''}-${i}`} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${x.gravite === 2 ? 'bg-red-600' : 'bg-amber-500'}`} aria-hidden="true" />
              <span className="text-gray-800">
                <span className="sr-only">{x.gravite === 2 ? t('Urgent : ', 'Urgent: ') : t('À surveiller : ', 'Watch: ')}</span>
                {libelleAlerte(x, t)}
              </span>
            </li>
          ))}
          {items.length > 8 && <li className="text-xs text-gray-500">{t(`… et ${items.length - 8} autre(s)`, `… and ${items.length - 8} more`)}</li>}
        </ul>
      )}
      {lien}
    </section>
  );
}

export function AlertesBlock({ suivre, faire }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ListeAlertes titre={t('À suivre', 'To watch')} items={suivre}
        vide={t('Rien d’inquiétant dans les résultats saisis.', 'Nothing worrying in the grades entered.')} />
      <ListeAlertes titre={t('À faire', 'To do')} items={faire}
        vide={t('Aucune action en attente.', 'No pending action.')} />
    </div>
  );
}

// ── Chiffres académiques ────────────────────────────────────────────────────
export function AcademicsStats({ loading, classes, students, globalPassRate }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard icon="classes" accent="brand" to="/app/classes"
        label={t('Classes', 'Classes')} value={loading ? '—' : classes.length} sub={t('configurées', 'configured')} />
      <StatCard icon="students" accent="green" to="/app/students"
        label={t('Élèves', 'Students')} value={loading ? '—' : students.length} sub={t('inscrits', 'enrolled')} />
      <StatCard icon="pass" accent="purple" to="/app/reports"
        label={t('Taux de réussite', 'Pass rate')}
        value={loading ? '—' : globalPassRate !== null ? `${globalPassRate}%` : '—'}
        sub={t('toutes classes', 'all classes')} />
    </div>
  );
}

// ── Recouvrement des frais ──────────────────────────────────────────────────
export function FeesBlock({ loading, feesStats }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <StatCard icon="fees" accent="amber" to="/app/fees"
        label={t('Recouvrement frais', 'Fee collection')}
        value={loading ? '—' : feesStats.rate !== null ? `${feesStats.rate}%` : '—'}
        sub={t('sur les échéances dues', 'of amounts due')} />
      <StatCard icon="fees" accent={feesStats.late > 0 ? 'rose' : 'green'} to="/app/fees"
        label={t('Élèves en retard', 'Overdue students')}
        value={loading ? '—' : feesStats.late}
        sub={feesStats.late > 0 ? t('à relancer', 'to follow up') : t('À jour', 'Up to date')} />
    </div>
  );
}

// ── Notes à compléter ───────────────────────────────────────────────────────
// Quatre états par classe : À jour (vert) · En cours · En retard (rouge) · À venir (gris).
// Une période n'est « à saisir » que si elle a commencé ; un retard sur une période
// passée reste rouge quand la suivante démarre ; la limite n'est JAMAIS déduite de la
// date d'examen en silence (cf. lib/periodStatus.js).
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateCourte = (s) => (s ? `${Number(s.slice(8, 10))} ${MOIS[Number(s.slice(5, 7)) - 1]}` : '');

function RelanceMatiere({ m, item, relance }) {
  const t = useT();
  const [etat, setEtat] = useState('');
  const envoyer = async () => {
    if (!m.teacher) return;
    setEtat('...');
    const nom = t(item.period?.fr, item.period?.en, item.period?.es);
    const ok = await relance.send({
      school_id: relance.schoolId, sender_name: relance.senderName, sender_role: relance.senderRole,
      to_teacher_id: m.teacher.id,
      subject: t(`Notes à compléter — ${nom}`, `Grades to complete — ${nom}`),
      body: t(`Bonjour, il reste ${m.expected - m.entered} note(s) à saisir en ${m.nom} (${item.cls.name}, ${nom}). Merci de compléter dès que possible.`,
        `Hello, ${m.expected - m.entered} grade(s) are still missing in ${m.nom} (${item.cls.name}, ${nom}). Please complete them soon.`),
    });
    setEtat(ok ? 'ok' : 'ko');
  };
  const texteWa = t(`Rappel : ${m.expected - m.entered} note(s) à saisir en ${m.nom} (${item.cls.name}).`, `Reminder: ${m.expected - m.entered} grade(s) to enter in ${m.nom} (${item.cls.name}).`);
  return (
    <li className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-gray-100">
      <span className="min-w-0">
        <span className="font-semibold text-gray-800">{m.nom}</span>{' '}
        <span className="text-gray-600">{m.entered}/{m.expected} · {m.teacher ? m.teacher.name : t('sans enseignant', 'no teacher')}</span>
      </span>
      {m.teacher && (
        <span className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={envoyer} disabled={etat === '...' || etat === 'ok'}
            className="min-h-[36px] px-2 rounded-lg border border-red-300 text-red-700 font-semibold disabled:opacity-60">
            {etat === 'ok' ? t('Relancé ✓', 'Sent ✓') : etat === 'ko' ? t('Échec, réessayer', 'Failed, retry') : t('Relancer', 'Remind')}
          </button>
          {m.teacher.phone && (
            <a href={buildWhatsAppUrl(m.teacher.phone, texteWa)} target="_blank" rel="noopener noreferrer"
              className="min-h-[36px] inline-flex items-center px-2 rounded-lg border border-emerald-300 text-emerald-700 font-semibold">WhatsApp</a>
          )}
        </span>
      )}
    </li>
  );
}

function LignePeriode({ item, relance }) {
  const t = useT();
  const [detailOuvert, setDetailOuvert] = useState(false);
  const { cls, etat, period, entered, expected, deadline, joursRetard, joursRestants, estimee } = item;
  const pct = expected ? Math.round((entered / expected) * 100) : 0;
  const retard = etat === 'en_retard';
  const ajour = etat === 'a_jour';
  const tone = retard ? 'red' : ajour ? 'green' : item.atRisk ? 'orange' : 'amber';
  const chip = { red: 'text-red-800 bg-red-100', green: 'text-emerald-800 bg-emerald-100', orange: 'text-orange-800 bg-orange-100', amber: 'text-amber-800 bg-amber-100' }[tone];
  const bar = { red: 'bg-red-600', green: 'bg-emerald-600', orange: 'bg-orange-500', amber: 'bg-amber-500' }[tone];
  const nom = t(period?.fr, period?.en, period?.es);
  return (
    <Link to="/app/grades"
      className={`bg-white rounded-lg p-3 border hover:shadow-sm transition-all group ${retard ? 'border-red-300' : ajour ? 'border-emerald-200' : 'border-amber-200'}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-semibold text-gray-800 text-sm truncate">{cls.name}</span>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${chip}`}>
          {ajour ? '✓ ' : retard ? '⚠ ' : ''}{nom}
        </span>
      </div>
      {ajour ? (
        <div className="text-sm font-medium text-emerald-800">{t(`À jour pour ${nom}`, `Up to date for ${nom}`)}</div>
      ) : (
        <>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-gray-700">
            {entered}/{expected} {t('notes saisies', 'grades entered')} <span className="font-semibold">({pct}%)</span>
          </div>
        </>
      )}
      {retard && (
        <div className="text-xs mt-1 font-semibold text-red-700">
          {t(`Date limite le ${dateCourte(deadline)} · dépassée de ${joursRetard} j`, `Deadline ${dateCourte(deadline)} · ${joursRetard} d overdue`)}
        </div>
      )}
      {!retard && !ajour && joursRestants != null && (
        <div className={`text-xs mt-1 font-medium ${item.atRisk ? 'text-orange-700' : 'text-gray-600'}`}>
          {t(`Date limite le ${dateCourte(deadline)} · J-${joursRestants}`, `Deadline ${dateCourte(deadline)} · D-${joursRestants}`)}
        </div>
      )}
      {retard && relance && item.parMatiere?.length > 0 && (
        <div onClick={(e) => e.preventDefault()}>
          <button type="button" aria-expanded={detailOuvert}
            onClick={(e) => { e.preventDefault(); setDetailOuvert((v) => !v); }}
            className="text-xs font-semibold text-red-700 mt-1 min-h-[36px]">
            {detailOuvert ? '▾' : '▸'} {t('Détail par matière', 'Per-subject detail')} ({item.parMatiere.length})
          </button>
          {detailOuvert && <ul className="mt-1">{item.parMatiere.map((m) => <RelanceMatiere key={m.id} m={m} item={item} relance={relance} />)}</ul>}
        </div>
      )}
      {estimee && <div className="text-xs mt-1 text-gray-600">{t('Période estimée (calendrier non renseigné)', 'Estimated period (calendar not set)')}</div>}
    </Link>
  );
}

export function GradesTodo({ suivi, calendarSet = true, direction = false, schoolId = null, senderName = '', senderRole = 'admin' }) {
  const t = useT();
  const send = useMessagesStore((s) => s.send);
  const relance = direction && schoolId ? { send, schoolId, senderName, senderRole } : null;
  const [avenirOuvert, setAvenirOuvert] = useState(false);
  if (!suivi) return null;
  const { retard, encours, estimees, ajour, avenir, classesEnRetard, aSaisir, resume } = suivi;
  const actifs = [...retard, ...encours, ...estimees];
  if (!actifs.length && !ajour.length && !avenir.length) return null;
  return (
    <BlockCard
      tone={classesEnRetard ? 'red' : 'amber'}
      title={(
        <span className="inline-flex items-center gap-2 flex-wrap">
          {t('Notes à compléter', 'Grades to complete')}
          {classesEnRetard > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">{t(`${classesEnRetard} classe(s) en retard`, `${classesEnRetard} class(es) overdue`)}</span>}
          {aSaisir > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{t(`${aSaisir} à saisir`, `${aSaisir} to enter`)}</span>}
        </span>
      )}
      subtitle={`${resume.ajour} ${t('à jour', 'up to date')} · ${resume.encours} ${t('en cours', 'in progress')} · ${resume.retard} ${t('en retard', 'overdue')}`}
    >
      {!calendarSet && (
        <div className="mx-4 mt-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          {t('Renseignez les dates des périodes pour suivre les retards automatiquement.', 'Fill in the period dates to track delays automatically.')}{' '}
          <Link to="/app/settings" className="font-semibold underline">{t('Calendrier scolaire', 'School calendar')}</Link>
        </div>
      )}
      {actifs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {actifs.map((it) => <LignePeriode key={`${it.cls.id}-${it.order}-${it.etat}`} item={it} relance={relance} />)}
        </div>
      )}
      {ajour.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-4 pb-4">
          {ajour.map((it) => <LignePeriode key={`${it.cls.id}-${it.order}-ok`} item={it} />)}
        </div>
      )}
      {avenir.length > 0 && (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => setAvenirOuvert((v) => !v)} aria-expanded={avenirOuvert}
            className="text-xs font-semibold text-gray-600 min-h-[44px]">
            {avenirOuvert ? '▾' : '▸'} {t('Prochaines périodes', 'Upcoming periods')} ({avenir.length})
          </button>
          {avenirOuvert && (
            <ul className="mt-1 space-y-1">
              {avenir.map((it) => (
                <li key={`${it.cls.id}-${it.order}`} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                  {it.cls.name} — {t(it.period?.fr, it.period?.en, it.period?.es)} · {t('à partir du', 'from')} {dateCourte(it.start)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {retard.length > 0 && (
        <div className="px-4 pb-4 -mt-1">
          <Link to="/app/monitor" className="text-xs font-semibold text-brand-600 hover:text-brand-800">
            {t('Voir la surveillance des saisies →', 'Open grade-entry monitoring →')}
          </Link>
        </div>
      )}
    </BlockCard>
  );
}

// ── Aperçu par classe ───────────────────────────────────────────────────────
export function ClassTable({ classStats }) {
  const t = useT();
  if (!classStats.length) {
    return (
      <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
        <div className="text-4xl mb-3">🏫</div>
        <p className="text-gray-600 font-medium mb-1">{t('Aucune classe configurée', 'No class configured')}</p>
        <p className="text-gray-400 text-sm mb-4">{t('Commencez par créer vos classes et matières.', 'Start by creating your classes and subjects.')}</p>
        <Link to="/app/classes" className="btn-primary text-sm">{t('Créer une classe', 'Create a class')}</Link>
      </div>
    );
  }
  return (
    <BlockCard
      title={t('Aperçu par classe', 'Class overview')}
      subtitle={t('Statistiques de la dernière période avec des notes', 'Statistics from the last period with grades')}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">{t('Classe', 'Class')}</th>
              <th className="px-4 py-3 text-center">{t('Élèves', 'Students')}</th>
              <th className="px-4 py-3 text-center">{t('Matières', 'Subjects')}</th>
              <th className="px-4 py-3 text-center">{t('Dernière période', 'Last period')}</th>
              <th className="px-4 py-3 text-center">{t('Moy. classe', 'Class avg.')}</th>
              <th className="px-4 py-3 text-center">{t('Réussite', 'Pass rate')}</th>
              <th className="px-4 py-3 text-center">{t('Actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {classStats.map(({ cls, subs, studs, sys, seq, trackKey, stats,
                              maxScale: max, passThreshold: pass }) => {
              const passRate = stats && stats.graded ? Math.round((stats.above / stats.graded) * 100) : null;
              const period = periodAt(trackKey, seq);
              return (
                <tr key={cls.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {cls.name}
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-semibold ${
                      sys === 'EN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{sys}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{studs.length}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{subs.length}</td>
                  <td className="px-4 py-3 text-center">
                    {period ? (
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">{t(period.fr, period.en, period.es)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {stats?.avg !== null && stats?.avg !== undefined ? (
                      <span style={{ color: stats.avg >= pass ? '#059669' : '#ef4444' }} className="font-bold">
                        {stats.avg.toFixed(2)}<span className="text-xs font-normal text-gray-400">/{max}</span>
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {passRate !== null ? (
                      <span style={{ color: passRate >= 50 ? '#059669' : '#ef4444' }} className="font-semibold">{passRate}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link to="/app/grades" className="text-xs text-brand-600 hover:text-brand-800 font-medium">{t('Notes', 'Grades')}</Link>
                    <span className="text-gray-300 mx-1">·</span>
                    <Link to="/app/bulletins" className="text-xs text-brand-600 hover:text-brand-800 font-medium">{t('Bulletins', 'Report cards')}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </BlockCard>
  );
}

export { EmptyHint };
