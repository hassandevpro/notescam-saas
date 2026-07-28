// src/components/PrepareHybridCard.jsx
// Encart « Serveur LAN & Mode hybride » — édition CLOUD, admin de l'école.
//
// Parcours industrialisé (Cloud → Hybride), étape Cloud : l'admin PRÉPARE
// l'hybridation de son école EN LIGNE (pose la politique + active l'accès distant
// des décideurs DÉJÀ autorisés par le référentiel — aucun droit ajouté) et obtient
// un CODE D'APPAIRAGE éphémère à saisir sur le serveur LAN. Aucun school_id manipulé,
// aucune ligne de commande, aucun secret privilégié.
//
// Auto-masqué en édition LAN et pour les non-admins.
import { useEffect, useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';
import { prepareHybrid, issuePairingCode, revokePairingCodes, listPairingCodes, codeStatus } from '../lib/pairingService';

const STATUS_BADGE = {
  active:  'bg-green-100 text-green-700',
  used:    'bg-gray-100 text-gray-500',
  expired: 'bg-amber-100 text-amber-700',
  revoked: 'bg-red-100 text-red-600',
};
const STATUS_LABEL = { active: 'Actif', used: 'Utilisé', expired: 'Expiré', revoked: 'Révoqué' };

export default function PrepareHybridCard() {
  const role = useAuthStore((s) => s.role);
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id || null;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState(null); // { code, expires_at, deciders_enabled, warning }
  const [codes, setCodes] = useState([]);

  const refresh = () => { if (schoolId) listPairingCodes(schoolId).then(setCodes).catch(() => {}); };
  useEffect(() => { if (!IS_LAN && role === 'admin' && schoolId) refresh(); }, [role, schoolId]);

  if (IS_LAN || role !== 'admin' || !schoolId) return null;

  const run = async (fn) => {
    setBusy(true); setErr(''); setFresh(null);
    try { const r = await fn(); setFresh(r || null); refresh(); }
    catch (e) { setErr(e.message || 'Échec.'); }
    finally { setBusy(false); }
  };

  const doPrepare = () => run(() => prepareHybrid(schoolId));
  const doNewCode = () => run(() => issuePairingCode(schoolId));
  const doRevoke = async () => {
    setBusy(true); setErr('');
    try { await revokePairingCodes(schoolId); setFresh(null); refresh(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const copy = (t) => { navigator.clipboard?.writeText(t).catch(() => {}); };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-bold text-gray-900">🖥️ Serveur LAN & Mode hybride</h2>
      <p className="text-sm text-gray-600">
        Préparez un <strong>serveur local</strong> pour votre établissement : la finance restera
        <strong> locale (LAN)</strong> et la gouvernance décidera <strong>à distance</strong>.
        Vous obtenez un <strong>code d'appairage</strong> à saisir une fois sur le serveur — aucun
        identifiant technique à manipuler.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <button className="btn-primary" disabled={busy} onClick={doPrepare}>
          {busy ? '…' : 'Préparer un serveur LAN'}
        </button>
        <button className="btn-secondary" disabled={busy} onClick={doNewCode}>
          Générer un nouveau code
        </button>
        {codes.some((c) => codeStatus(c) === 'active') && (
          <button className="text-sm text-red-600 hover:underline" disabled={busy} onClick={doRevoke}>
            Révoquer les codes actifs
          </button>
        )}
      </div>

      {/* Code fraîchement émis — affiché UNE seule fois */}
      {fresh?.code && (
        <div className="mt-4 rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
          <div className="text-xs font-semibold text-sky-700">CODE D'APPAIRAGE (à saisir sur le serveur LAN)</div>
          <div className="mt-1 flex items-center gap-3">
            <code className="select-all rounded bg-white px-3 py-1.5 text-lg font-bold tracking-widest text-sky-900">{fresh.code}</code>
            <button className="text-sm text-sky-700 hover:underline" onClick={() => copy(fresh.code)}>Copier</button>
          </div>
          <div className="mt-2 text-xs text-sky-700">
            Expire le {new Date(fresh.expires_at).toLocaleString()} · usage unique · révocable.
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Décideurs distants activés (déjà autorisés par le référentiel) : <b>{fresh.deciders_enabled ?? 0}</b>.
          </div>
          {fresh.warning && (
            <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {fresh.warning}</div>
          )}
        </div>
      )}

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* Suivi des codes (jamais le code en clair) */}
      {codes.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold text-gray-500">Codes émis</div>
          <div className="divide-y divide-gray-100 text-sm">
            {codes.map((c) => {
              const st = codeStatus(c);
              return (
                <div key={c.id} className="flex items-center justify-between py-1.5">
                  <span className="font-mono text-gray-600">{c.code_hint}…</span>
                  <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
