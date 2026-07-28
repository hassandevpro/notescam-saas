// src/components/CloudMigrationWizard.jsx
// Assistant de rattachement Cloud → Local — édition LAN, au PREMIER démarrage.
//
// S'affiche tant que la base locale est vide (GET /api/migrate/status -> open).
// Deux parcours pour rattacher une école DÉJÀ dans le Cloud, SANS la recréer :
//   1. « Code d'appairage » (parcours NORMAL industrialisé) : l'admin a préparé le
//      serveur depuis les Paramètres en ligne et fournit un code. Le serveur
//      s'appaire, synchronise, contrôle, puis — si tout réussit — bascule en hybride.
//      Aucun school_id ni identifiant cloud saisi ici.
//   2. « Identifiants cloud » (voie classique) : e-mail + mot de passe cloud admin.
// Ou « nouvel établissement » -> ferme l'assistant (onboarding normal).
//
// Auto-masqué hors édition LAN. Endpoints non authentifiés (aucun compte local
// n'existe encore au moment du provisioning initial).
import { useState, useEffect } from 'react';
import { IS_LAN } from '../lib/edition';

export default function CloudMigrationWizard() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('choice'); // choice | pair | pairing | pairDone | form | running | done | error
  const [dismissed, setDismissed] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', localPassword: '' });
  const [pair, setPair] = useState({ code: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [errStage, setErrStage] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!IS_LAN) return;
    fetch('/api/migrate/status').then((r) => r.json())
      .then((j) => setOpen(!!j?.data?.open)).catch(() => {});
  }, []);

  if (!IS_LAN || !open || dismissed) return null;

  // ── Parcours 1 : code d'appairage (normal) ─────────────────────────────────
  async function runPairing() {
    setStage('pairing'); setError(''); setErrStage('');
    try {
      const res = await fetch('/api/pair/redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: pair.code.trim(),
          localAdmin: { email: pair.email.trim(), password: pair.password },
        }),
      });
      const json = await res.json();
      if (json?.error) { setError(json.error.message); setErrStage(json.error.stage || ''); setStage('pair'); return; }
      setResult(json.data); setStage('pairDone');
    } catch {
      setError('Impossible de contacter le serveur local.'); setStage('pair');
    }
  }

  // ── Parcours 2 : identifiants cloud (classique) ────────────────────────────
  async function runMigration() {
    setStage('running'); setError('');
    try {
      const res = await fetch('/api/migrate/cloud', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json?.error) { setError(json.error.message); setStage('error'); return; }
      setResult(json.data); setStage('done');
    } catch {
      setError('Impossible de contacter le serveur local.'); setStage('error');
    }
  }

  const c = result?.counts || {};

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 text-center text-3xl">🏫</div>
        <h2 className="mb-1 text-center text-xl font-bold text-gray-900">Bienvenue sur NotesCam Local</h2>

        {/* Choix initial */}
        {stage === 'choice' && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-sm text-gray-500">Cette installation est vide. Que souhaitez-vous faire ?</p>
            <button className="w-full rounded-xl border-2 border-sky-500 bg-sky-50 p-4 text-left hover:bg-sky-100"
              onClick={() => setStage('pair')}>
              <div className="font-semibold text-sky-800">🔗 Rattacher avec un code d'appairage</div>
              <div className="text-xs text-sky-700">Parcours recommandé — l'admin a préparé le serveur depuis les Paramètres en ligne.</div>
            </button>
            <button className="w-full rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
              onClick={() => setStage('form')}>
              <div className="font-semibold text-gray-800">☁→💻 Utiliser mes identifiants cloud</div>
              <div className="text-xs text-gray-500">Rattachement par e-mail + mot de passe cloud (voie classique).</div>
            </button>
            <button className="w-full rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
              onClick={() => setDismissed(true)}>
              <div className="font-semibold text-gray-800">🆕 Créer un nouvel établissement</div>
              <div className="text-xs text-gray-500">Commencer à zéro sur ce poste.</div>
            </button>
          </div>
        )}

        {/* Parcours 1 : saisie du code d'appairage + admin local */}
        {stage === 'pair' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-500">
              Saisissez le <b>code d'appairage</b> fourni par l'administrateur (Paramètres en ligne →
              « Serveur LAN & Mode hybride »), puis créez l'<b>administrateur local</b> de ce serveur.
            </p>
            <input className="w-full rounded border px-3 py-2 text-center text-lg font-bold tracking-widest uppercase"
              placeholder="XXXXX-XXXXX" value={pair.code}
              onChange={(e) => setPair({ ...pair, code: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" placeholder="E-mail administrateur LOCAL"
              value={pair.email} onChange={(e) => setPair({ ...pair, email: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" type="password" placeholder="Mot de passe LOCAL (≥ 6)"
              value={pair.password} onChange={(e) => setPair({ ...pair, password: e.target.value })} />
            <p className="text-xs text-amber-600">
              Le mot de passe local est propre à ce serveur (ce n'est pas un secret cloud). Le mode
              hybride ne s'activera que si l'appairage, la synchronisation et les contrôles réussissent.
            </p>
            {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">⚠️ {error}{errStage ? ` (étape : ${errStage})` : ''}</div>}
            <div className="flex gap-2">
              <button className="flex-1 rounded border py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => { setStage('choice'); setError(''); }}>Retour</button>
              <button className="flex-[2] rounded bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                disabled={!pair.code.trim() || !pair.email.trim() || pair.password.length < 6}
                onClick={runPairing}>Rattacher & activer l'hybride</button>
            </div>
          </div>
        )}

        {/* Parcours 1 : progression */}
        {stage === 'pairing' && (
          <div className="mt-6 space-y-3 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
            <p className="text-sm text-gray-600">Appairage → synchronisation initiale → contrôles → activation…</p>
            <p className="text-xs text-gray-400">Ne fermez pas la fenêtre. En cas d'échec, le serveur reste en mode Cloud (pas de bascule).</p>
          </div>
        )}

        {/* Parcours 1 : terminé (hybride actif) */}
        {stage === 'pairDone' && result && (
          <div className="mt-4 space-y-3">
            <p className="text-center font-semibold text-emerald-700">✅ {result.integrity?.school || 'École'} rattachée — mode hybride actif.</p>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              <li>Comptes école : {result.integrity?.school_users ?? 0}</li>
              <li>Mode : {result.hybrid ? 'Hybride' : 'Cloud'}</li>
            </ul>
            <p className="text-xs text-gray-500">
              Connectez-vous avec l'administrateur local (<b>{pair.email}</b>). La finance reste locale,
              la gouvernance décide à distance.
            </p>
            <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => window.location.reload()}>Terminer</button>
          </div>
        )}

        {/* Parcours 2 : formulaire identifiants cloud */}
        {stage === 'form' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-500">Connectez-vous avec votre compte <b>NotesCam Cloud</b> (admin).</p>
            <input className="w-full rounded border px-3 py-2" placeholder="E-mail du compte cloud (admin)"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" type="password" placeholder="Mot de passe cloud"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" type="password" placeholder="Nouveau mot de passe LOCAL (admin)"
              value={form.localPassword} onChange={(e) => setForm({ ...form, localPassword: e.target.value })} />
            <div className="flex gap-2">
              <button className="flex-1 rounded border py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setStage('choice')}>Retour</button>
              <button className="flex-[2] rounded bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                disabled={!form.email || !form.password || form.localPassword.length < 6}
                onClick={runMigration}>Démarrer la migration</button>
            </div>
          </div>
        )}

        {stage === 'running' && (
          <div className="mt-6 space-y-3 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
            <p className="text-sm text-gray-600">Téléchargement et création de la base locale…</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="mt-4 space-y-3">
            <p className="text-center font-semibold text-emerald-700">✅ {result.school} récupéré localement.</p>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              <li>Élèves : {c.students ?? 0}</li>
              <li>Classes : {c.classes ?? 0}</li>
              <li>Enseignants : {c.teachers ?? 0}</li>
              <li>Notes : {c.grades ?? 0}</li>
            </ul>
            <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => window.location.reload()}>Terminer</button>
          </div>
        )}

        {stage === 'error' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-red-600">⚠️ {error}</p>
            <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => setStage('form')}>Réessayer</button>
            <button className="w-full rounded border py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setDismissed(true)}>Annuler</button>
          </div>
        )}
      </div>
    </div>
  );
}
