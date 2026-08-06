// BLOCS financiers du tableau de bord — les « files d'attente » du rôle courant.
//
// Ce que ces blocs montrent vient de `roleBudgetQueues` (moteur pur, gouvernance) :
// uniquement ce sur quoi CETTE personne peut agir maintenant, au montant qu'elle a
// le droit de valider et dans son secteur. Rien n'est décidé ici : les actions
// restent sur /app/depenses, où le serveur reste l'autorité.

import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { BlockCard, CountPill, LoadingCard } from './shared';

function QueueList({ rows, emptyLabel, money, actionLabel, to }) {
  if (rows.length === 0) {
    return <p className="px-6 py-5 text-sm text-gray-400 italic">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-gray-50">
      {rows.slice(0, 6).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-6 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {e.category || e.subcategory || e.supplier || actionLabel}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {[e.supplier, e.requester, e.expense_date].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <Link
            to={to}
            className="shrink-0 text-sm font-bold text-gray-900 tabular-nums hover:text-brand-700 hover:underline"
          >
            {money(e.amount)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OpenLink({ label, to }) {
  return (
    <Link to={to} className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline whitespace-nowrap">
      {label}
    </Link>
  );
}

// ── Dépenses à approuver PAR CE RÔLE (permission ET montant ET secteur) ──────
// `financeRemote` : en gouvernance distante, /app/depenses est en LECTURE SEULE —
// l'approbation se fait sur /app/approbations. Le lien suit donc le mode, sinon la
// carte renvoyait vers une page qui se contente d'écrire « allez ailleurs ».
export function ValidateQueue({ loading, queues, scopedToSector, financeRemote = false }) {
  const t = useT();
  const money = useMoney();
  if (loading) return <LoadingCard />;
  const rows = queues.toValidate;
  const to = financeRemote ? '/app/approbations' : '/app/depenses';
  return (
    <BlockCard
      tone={rows.length ? 'amber' : 'plain'}
      title={<span className="inline-flex items-center gap-2">{t('Dépenses à approuver', 'Expenses to approve', 'Gastos por aprobar')} {rows.length > 0 && <CountPill n={rows.length} />}</span>}
      subtitle={financeRemote
        ? t('Décision transmise au serveur de l’école', 'Decision sent to the school server', 'Decisión enviada al servidor de la escuela')
        : (scopedToSector
          ? t('Dans votre secteur, à votre palier de validation', 'In your sector, at your approval tier', 'En su sector, en su nivel')
          : t('À votre palier de validation', 'At your approval tier', 'En su nivel de validación'))}
      action={<OpenLink to={to} label={financeRemote
        ? t('Décider →', 'Decide →', 'Decidir →')
        : t('Ouvrir les dépenses →', 'Open expenses →', 'Abrir gastos →')} />}
    >
      <QueueList rows={rows} money={money} to={to}
        actionLabel={t('Dépense', 'Expense', 'Gasto')}
        emptyLabel={t('Rien à approuver pour le moment.', 'Nothing to approve right now.', 'Nada por aprobar.')} />
    </BlockCard>
  );
}

// ── Demandes de déblocage à décider ─────────────────────────────────────────
export function UnlockQueue({ loading, queues }) {
  const t = useT();
  const money = useMoney();
  if (loading) return <LoadingCard />;
  const rows = queues.unlocksToDecide;
  return (
    <BlockCard
      tone={rows.length ? 'rose' : 'plain'}
      title={<span className="inline-flex items-center gap-2">{t('Déblocages à décider', 'Unlock requests to decide', 'Desbloqueos por decidir')} {rows.length > 0 && <CountPill n={rows.length} tone="rose" />}</span>}
      subtitle={t('Lignes budgétaires épuisées', 'Exhausted budget lines', 'Líneas presupuestarias agotadas')}
      action={<OpenLink to="/app/depenses" label={t('Décider →', 'Decide →', 'Decidir →')} />}
    >
      {rows.length === 0 ? (
        <p className="px-6 py-5 text-sm text-gray-400 italic">
          {t('Aucune demande en attente.', 'No pending request.', 'Sin solicitudes pendientes.')}
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{r.reason || t('Demande de déblocage', 'Unlock request', 'Solicitud')}</p>
                <p className="text-xs text-gray-400 truncate">{r.requester || '—'}</p>
              </div>
              <Link to="/app/depenses" className="shrink-0 text-sm font-bold text-gray-900 tabular-nums hover:text-brand-700 hover:underline">
                {money(r.requested_amount)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  );
}

// ── Dépenses approuvées, à décaisser ────────────────────────────────────────
export function PayQueue({ loading, queues }) {
  const t = useT();
  const money = useMoney();
  if (loading) return <LoadingCard />;
  const rows = queues.toPay;
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return (
    <BlockCard
      tone={rows.length ? 'indigo' : 'plain'}
      title={<span className="inline-flex items-center gap-2">{t('À décaisser', 'To pay out', 'Por desembolsar')} {rows.length > 0 && <CountPill n={rows.length} tone="slate" />}</span>}
      subtitle={rows.length > 0
        ? `${t('Total', 'Total', 'Total')} : ${money(total)}`
        : t('Dépenses approuvées en attente de paiement', 'Approved expenses awaiting payment', 'Gastos aprobados pendientes de pago')}
      action={<OpenLink to="/app/depenses" label={t('Décaisser →', 'Pay out →', 'Desembolsar →')} />}
    >
      <QueueList rows={rows} money={money} to="/app/depenses"
        actionLabel={t('Dépense', 'Expense', 'Gasto')}
        emptyLabel={t('Aucun décaissement en attente.', 'No pending payout.', 'Sin desembolsos pendientes.')} />
    </BlockCard>
  );
}

// ── Consommation du budget annuel ───────────────────────────────────────────
export function BudgetFigures({ loading, envelope, consumption, scopedToSector }) {
  const t = useT();
  const money = useMoney();
  if (loading) return <LoadingCard />;

  if (!consumption) {
    return (
      <BlockCard
        title={t('Budget annuel', 'Annual budget', 'Presupuesto anual')}
        action={<OpenLink to="/app/budget-global" label={t('Ouvrir →', 'Open →', 'Abrir →')} />}
      >
        <p className="px-6 py-5 text-sm text-gray-400 italic">
          {t('Aucun budget annuel pour cette année.', 'No annual budget for this year.', 'Ningún presupuesto anual este año.')}
        </p>
      </BlockCard>
    );
  }

  const committed = Number(consumption.committed) || 0;
  const pct = envelope > 0 ? Math.round((committed / envelope) * 100) : 0;
  const over = !!consumption.depassement;

  return (
    <BlockCard
      title={t('Budget annuel', 'Annual budget', 'Presupuesto anual')}
      subtitle={scopedToSector
        ? t('Chiffres du complexe — votre périmètre reste le secteur', 'Complex-wide figures — your scope stays your sector', 'Cifras del complejo')
        : t('Engagement sur l’enveloppe votée', 'Commitment against the voted envelope', 'Compromiso sobre la envolvente')}
      action={<OpenLink to="/app/budget-global" label={t('Détail →', 'Details →', 'Detalle →')} />}
    >
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('Enveloppe', 'Envelope', 'Envolvente')}</p>
            <p className="text-base font-bold text-gray-800 tabular-nums mt-0.5">{money(envelope)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('Engagé', 'Committed', 'Comprometido')}</p>
            <p className="text-base font-bold text-amber-600 tabular-nums mt-0.5">{money(committed)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('Disponible', 'Available', 'Disponible')}</p>
            <p className={`text-base font-bold tabular-nums mt-0.5 ${over ? 'text-rose-600' : 'text-sky-700'}`}>
              {money(consumption.available)}
            </p>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className={`h-2 rounded-full transition-all ${over ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
        <p className={`text-xs ${over ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
          {pct}% {t('de l’enveloppe engagée', 'of the envelope committed', 'de la envolvente comprometida')}
        </p>
      </div>
    </BlockCard>
  );
}

// ── Accès à la consolidation du groupe ──────────────────────────────────────
export function GroupLink() {
  const t = useT();
  return (
    <Link to="/app/groupe"
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-brand-300 hover:shadow-md transition-all group">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 group-hover:text-brand-700">
            {t('Tableau de bord du groupe', 'Group dashboard', 'Panel del grupo')}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('Finances, RH, discipline et académique consolidés', 'Consolidated finance, HR, discipline and academics', 'Finanzas, RRHH, disciplina y académico')}
          </p>
        </div>
        <span className="text-xl shrink-0" aria-hidden="true">📊</span>
      </div>
    </Link>
  );
}
