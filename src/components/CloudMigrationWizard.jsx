// src/components/CloudMigrationWizard.jsx
// Assistant de migration Cloud → Local — édition LAN, au PREMIER démarrage.
//
// S'affiche tant que la base locale est vide (GET /api/migrate/status -> open).
// Permet à une école déjà cliente du cloud de récupérer automatiquement toutes
// ses données dans la base SQLite locale, sans recréer l'établissement. Internet
// n'est requis que pour cette étape ; ensuite l'app fonctionne hors-ligne.
//
// L'école peut aussi choisir « nouvel établissement » -> l'assistant se ferme et
// laisse l'onboarding/login normal (création à zéro).
//
// Auto-masqué hors édition LAN. Endpoints non authentifiés (aucun compte local
// n'existe encore au moment du provisioning initial).
import { useState, useEffect } from 'react';
import { IS_LAN } from '../lib/edition';

export default function CloudMigrationWizard() {
  const [open, setOpen] = useState(false);          // migration possible (base vide)
  const [stage, setStage] = useState('choice');      // choice | form | running | done | error
  const [dismissed, setDismissed] = useState(false); // « nouvel établissement »
  const [form, setForm] = useState({ email: '', password: '', localPassword: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!IS_LAN) return;
    fetch('/api/migrate/status').then((r) => r.json())
      .then((j) => setOpen(!!j?.data?.open)).catch(() => {});
  }, []);

  if (!IS_LAN || !open || dismissed) return null;

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
            <p className="text-center text-sm text-gray-500">
              Cette installation est vide. Que souhaitez-vous faire ?
            </p>
            <button className="w-full rounded-xl border-2 border-sky-500 bg-sky-50 p-4 text-left hover:bg-sky-100"
              onClick={() => setStage('form')}>
              <div className="font-semibold text-sky-800">☁→💻 Récupérer mes données du Cloud</div>
              <div className="text-xs text-sky-700">J'utilise déjà NotesCam Cloud — télécharger mon établissement ici.</div>
            </button>
            <button className="w-full rounded-xl border border-gray-200 p-4 text-left hover:bg-gray-50"
              onClick={() => setDismissed(true)}>
              <div className="font-semibold text-gray-800">🆕 Créer un nouvel établissement</div>
              <div className="text-xs text-gray-500">Commencer à zéro sur ce poste.</div>
            </button>
          </div>
        )}

        {/* Formulaire de connexion cloud */}
        {stage === 'form' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-500">
              Connectez-vous avec votre compte <b>NotesCam Cloud</b>. Vos données seront
              téléchargées dans la base locale (sans doublon).
            </p>
            <input className="w-full rounded border px-3 py-2" placeholder="E-mail du compte cloud (admin)"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" type="password" placeholder="Mot de passe cloud"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <input className="w-full rounded border px-3 py-2" type="password" placeholder="Nouveau mot de passe LOCAL (admin)"
              value={form.localPassword} onChange={(e) => setForm({ ...form, localPassword: e.target.value })} />
            <p className="text-xs text-amber-600">
              Choisissez votre mot de passe local d'administrateur (il sera aussi synchronisé avec le cloud).
              Les comptes du personnel seront réinitialisables ensuite.
            </p>
            <div className="flex gap-2">
              <button className="flex-1 rounded border py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setStage('choice')}>Retour</button>
              <button className="flex-[2] rounded bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                disabled={!form.email || !form.password || form.localPassword.length < 6}
                onClick={runMigration}>Démarrer la migration</button>
            </div>
          </div>
        )}

        {/* Migration en cours */}
        {stage === 'running' && (
          <div className="mt-6 space-y-3 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
            <p className="text-sm text-gray-600">Téléchargement et création de la base locale…</p>
            <p className="text-xs text-gray-400">Connexion → analyse → téléchargement → vérification. Ne fermez pas la fenêtre.</p>
          </div>
        )}

        {/* Terminé */}
        {stage === 'done' && result && (
          <div className="mt-4 space-y-3">
            <p className="text-center font-semibold text-emerald-700">✅ {result.school} récupéré localement.</p>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              <li>Élèves : {c.students ?? 0}</li>
              <li>Classes : {c.classes ?? 0}</li>
              <li>Enseignants : {c.teachers ?? 0}</li>
              <li>Notes : {c.grades ?? 0}</li>
              <li>Paiements : {c.fee_payments ?? 0}</li>
              <li>Périodes : {c.academic_periods ?? 0}</li>
            </ul>
            {result.ok === false && (
              <p className="text-sm text-red-600">⚠ Écarts d'intégrité : {JSON.stringify(result.integrity?.mismatches)}</p>
            )}
            <p className="text-xs text-gray-500">
              Vous pouvez débrancher Internet. Connectez-vous avec <b>{form.email}</b> et votre nouveau mot de passe local.
            </p>
            <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => window.location.reload()}>Terminer</button>
          </div>
        )}

        {/* Erreur */}
        {stage === 'error' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-red-600">⚠️ {error}</p>
            <button className="w-full rounded bg-sky-600 py-2 font-semibold text-white" onClick={() => setStage('form')}>Réessayer</button>
            <button className="w-full rounded border py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setDismissed(true)}>Annuler (créer un nouvel établissement)</button>
          </div>
        )}
      </div>
    </div>
  );
}
