import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import MarketingFacebook from '../components/MarketingFacebook';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_META = {
  starter: { label: 'Starter', price: 'Gratuit',           badge: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400',    btn: 'border-gray-400 bg-gray-100 text-gray-700' },
  ecole:   { label: 'École',   price: '8 500 FCFA/mois',   badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',    btn: 'border-blue-500 bg-blue-50 text-blue-700' },
  pro:     { label: 'Pro',     price: '15 000 FCFA/mois',  badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500',  btn: 'border-violet-500 bg-violet-50 text-violet-700' },
  reseau:  { label: 'Réseau',  price: 'Sur devis',          badge: 'bg-emerald-100 text-emerald-700',dot: 'bg-emerald-500',btn: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
};

function PlanBadge({ plan, blocked }) {
  if (blocked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Bloqué
      </span>
    );
  }
  const meta = PLAN_META[plan ?? 'starter'] ?? PLAN_META.starter;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ── Modal modifier le plan ────────────────────────────────────────────────────

function EditPlanModal({ school, onSave, onClose }) {
  const [plan,    setPlan]    = useState(school.plan || 'starter');
  const [blocked, setBlocked] = useState(school.license_status === 'blocked');
  const [price,   setPrice]   = useState(Number(school.price_per_student) || 0);
  const [saving,  setSaving]  = useState(false);

  const nbStudents = Number(school.nb_students) || 0;
  const total = (Number(price) || 0) * nbStudents;
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

  const handleSave = async () => {
    setSaving(true);
    await onSave(school.id, plan, blocked, Number(price) || 0);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Plan & tarification</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-700">{school.name}</p>
            <p className="text-xs text-gray-400">{school.type} · {school.region}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Plan</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PLAN_META).map(([v, meta]) => (
                <button
                  key={v}
                  onClick={() => setPlan(v)}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    plan === v ? meta.btn : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {meta.label}
                  <span className="block text-xs font-normal opacity-60">{meta.price}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Prix par élève (FCFA) — négocié
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ex : 1000"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2.5">
              <span className="text-xs text-emerald-700">
                {fmt(price)} FCFA × {nbStudents} élève{nbStudents !== 1 ? 's' : ''}
              </span>
              <span className="text-sm font-bold text-emerald-800">{fmt(total)} FCFA</span>
            </div>
          </div>

          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-50 border border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-700">Compte bloqué</p>
              <p className="text-xs text-gray-400">L'école ne peut plus accéder à l'application</p>
            </div>
            <button
              onClick={() => setBlocked(!blocked)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${blocked ? 'bg-red-500' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${blocked ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const logout   = useAuthStore((s) => s.logout);
  const fullName = useAuthStore((s) => s.fullName);

  const [tab,        setTab]        = useState('schools'); // 'schools' | 'marketing'
  const [schools,    setSchools]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [editing,    setEditing]    = useState(null);

  const loadSchools = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('fetch_all_schools_superadmin');
    if (error) { setError(error.message); setLoading(false); return; }
    setSchools(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadSchools(); }, []);

  const handleUpdateLicense = async (schoolId, plan, blocked, price) => {
    const status = blocked ? 'blocked' : 'active';
    const { error } = await supabase.rpc('update_school_license', {
      p_school_id:  schoolId,
      p_status:     status,
      p_expires_at: null,
      p_plan:       plan,
    });
    if (error) { alert(`Erreur : ${error.message}`); return; }

    // Prix par élève négocié (uniquement si fourni, ex. via la modale).
    let priceUpdate = {};
    if (price !== undefined && price !== null) {
      const { error: priceErr } = await supabase.rpc('update_school_price_per_student', {
        p_school_id: schoolId,
        p_price:     price,
      });
      if (priceErr) { alert(`Erreur (prix) : ${priceErr.message}`); return; }
      priceUpdate = { price_per_student: price };
    }

    setSchools((prev) => prev.map((s) =>
      s.id === schoolId ? { ...s, license_status: status, plan, ...priceUpdate } : s
    ));
  };

  const quickSetPlan = (school, plan) =>
    handleUpdateLicense(school.id, plan, school.license_status === 'blocked');

  const quickToggleBlock = (school) =>
    handleUpdateLicense(school.id, school.plan ?? 'starter', school.license_status !== 'blocked');

  const visible = useMemo(() => {
    return schools
      .filter((s) => {
        if (filterPlan === 'blocked') return s.license_status === 'blocked';
        if (filterPlan !== 'all') return s.plan === filterPlan && s.license_status !== 'blocked';
        return true;
      })
      .filter((s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.region || '').toLowerCase().includes(search.toLowerCase())
      );
  }, [schools, filterPlan, search]);

  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const billFor = (s) => (Number(s.price_per_student) || 0) * (Number(s.nb_students) || 0);

  const stats = useMemo(() => ({
    total:    schools.length,
    students: schools.reduce((sum, s) => sum + (Number(s.nb_students) || 0), 0),
    revenue:  schools
      .filter((s) => s.license_status !== 'blocked')
      .reduce((sum, s) => sum + billFor(s), 0),
    blocked:  schools.filter((s) => s.license_status === 'blocked').length,
  }), [schools]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-brand-700 tracking-tight">NotesCam</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider">Super Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{fullName}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Tab navigation */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('schools')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'schools' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
            </svg>
            Établissements
          </button>
          <button
            onClick={() => setTab('marketing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'marketing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Marketing Facebook
          </button>
        </div>

        {tab === 'schools' && (
        <>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des plans</h1>
          <p className="text-sm text-gray-400 mt-0.5">Vue globale de tous les établissements NotesCam</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Établissements',     value: fmt(stats.total),              color: 'border-gray-400' },
            { label: 'Élèves (total)',     value: fmt(stats.students),           color: 'border-blue-400' },
            { label: 'Revenu estimé (FCFA)', value: fmt(stats.revenue),          color: 'border-emerald-400' },
            { label: 'Bloqués',            value: fmt(stats.blocked),            color: 'border-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${color}`}>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs font-semibold text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Rechercher un établissement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-64"
          />
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="all">Tous les plans</option>
            <option value="starter">Starter</option>
            <option value="ecole">École</option>
            <option value="pro">Pro</option>
            <option value="reseau">Réseau</option>
            <option value="blocked">Bloqués</option>
          </select>
          <button
            onClick={loadSchools}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
            </svg>
            Actualiser
          </button>
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm">
            <strong>Erreur :</strong> {error}
          </div>
        )}

        {/* Tableau */}
        {loading ? (
          <div className="bg-white rounded-xl p-12 text-center text-gray-400 text-sm animate-pulse shadow-sm">
            Chargement des établissements…
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/70">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {visible.length} établissement{visible.length !== 1 ? 's' : ''}
                {filterPlan !== 'all' || search ? ' (filtré)' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Établissement</th>
                    <th className="px-4 py-3 text-left">Région</th>
                    <th className="px-4 py-3 text-left">Directeur</th>
                    <th className="px-4 py-3 text-center">Année</th>
                    <th className="px-4 py-3 text-center">Plan</th>
                    <th className="px-4 py-3 text-center">Élèves</th>
                    <th className="px-4 py-3 text-right">Prix/élève</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-gray-400 text-sm">
                        Aucun établissement trouvé.
                      </td>
                    </tr>
                  ) : visible.map((school) => {
                    const isBlocked = school.license_status === 'blocked';
                    return (
                      <tr key={school.id} className={`hover:bg-gray-50/50 transition-colors ${isBlocked ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="font-semibold text-gray-900">{school.name}</div>
                          <div className="text-xs text-gray-400">{school.type} · {school.language || 'francophone'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{school.region || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{school.director || '—'}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{school.current_year || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <PlanBadge plan={school.plan} blocked={isBlocked} />
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-medium text-gray-700">{fmt(school.nb_students)}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600">
                          {Number(school.price_per_student) > 0 ? `${fmt(school.price_per_student)}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">
                          {Number(school.price_per_student) > 0 ? `${fmt(billFor(school))}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {!isBlocked && school.plan !== 'ecole' && school.plan !== 'pro' && school.plan !== 'reseau' && (
                              <button
                                onClick={() => quickSetPlan(school, 'ecole')}
                                className="px-2 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                title="Passer au plan École"
                              >
                                → École
                              </button>
                            )}
                            {!isBlocked && school.plan !== 'pro' && school.plan !== 'reseau' && (
                              <button
                                onClick={() => quickSetPlan(school, 'pro')}
                                className="px-2 py-1 rounded-md text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                                title="Passer au plan Pro"
                              >
                                → Pro
                              </button>
                            )}
                            <button
                              onClick={() => quickToggleBlock(school)}
                              className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                                isBlocked
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {isBlocked ? 'Débloquer' : 'Bloquer'}
                            </button>
                            <button
                              onClick={() => setEditing(school)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                              title="Modifier le plan"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}

        {tab === 'marketing' && <MarketingFacebook />}

      </main>

      {editing && (
        <EditPlanModal
          school={editing}
          onSave={handleUpdateLicense}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
