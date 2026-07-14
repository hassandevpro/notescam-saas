// Module REPORTS (Signalements). Tout utilisateur autorisé peut créer un report ;
// la direction/discipline gère le statut. Catégories, gravité, affectation
// automatique, statut (machine à états réutilisée), commentaires, historique.
// PAS de notifications (déférées).
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import {
  fetchReports, createReport, changeReportStatus, deleteReport,
  fetchComments, addComment, fetchHistory,
} from '../lib/reportService';
import { nextStatuses, severityRank } from '../lib/reportEngine';
import { CATEGORY_LABELS, SEVERITY_UI, STATUS_UI, HISTORY_ACTION_LABELS } from '../components/reports/reportUi';
import ReportFormModal from '../components/reports/ReportFormModal';

export default function Signalements() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const userId = useAuthStore((s) => s.user?.id);
  const schoolId = school?.id;
  // Tout le personnel peut créer/commenter ; la direction/discipline gère le statut.
  const canManage = ['admin', 'censeur', 'surveillant'].includes(role);

  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [commentText, setCommentText] = useState('');

  const loadReports = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const rows = await fetchReports(schoolId) || [];
    setReports(rows);
    setSelectedId((cur) => cur && rows.some((r) => r.id === cur) ? cur : (rows[0]?.id || null));
    setLoading(false);
  }, [schoolId]);
  useEffect(() => { loadReports(); }, [loadReports]);

  const selected = reports.find((r) => r.id === selectedId) || null;

  const loadDetail = useCallback(async (id) => {
    if (!schoolId || !id) { setComments([]); setHistory([]); return; }
    const [c, h] = await Promise.all([fetchComments(schoolId, id), fetchHistory(schoolId, id)]);
    setComments(c || []); setHistory(h || []);
  }, [schoolId]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const shown = useMemo(() => {
    const open = ['new', 'triaged', 'assigned', 'in_progress'];
    let rows = reports;
    if (filter === 'open') rows = reports.filter((r) => open.includes(r.status));
    else if (filter === 'closed') rows = reports.filter((r) => !open.includes(r.status));
    return [...rows].sort((a, b) => severityRank(b.priority) - severityRank(a.priority)
      || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [reports, filter]);

  const create = async (data) => {
    const saved = await createReport({ schoolId, ...data, reporterName: fullName || '', reporterId: userId || '' });
    setCreating(false);
    if (saved) { await loadReports(); setSelectedId(saved.id); }
  };

  const setStatus = async (to) => {
    const saved = await changeReportStatus(selected, to, { actor: fullName || '', actorId: userId || '' });
    if (saved) { await loadReports(); await loadDetail(selected.id); }
  };

  const remove = async () => {
    if (!window.confirm(t('Supprimer ce report ?', 'Delete this report?', '¿Eliminar este reporte?'))) return;
    if (await deleteReport(selected.id)) { setSelectedId(null); await loadReports(); }
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    await addComment({ schoolId, signalementId: selected.id, body: commentText.trim(), author: fullName || '', authorId: userId || '' });
    setCommentText('');
    await loadDetail(selected.id);
  };

  const catLabel = (c) => t(...(CATEGORY_LABELS[c] || [c]));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Signalements', 'Reports', 'Reportes')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Catégorie · gravité · affectation automatique · statut', 'Category · severity · auto-assignment · status', 'Categoría · gravedad · asignación · estado')}</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">{t('Ouverts', 'Open', 'Abiertos')}</option>
              <option value="closed">{t('Clôturés', 'Closed', 'Cerrados')}</option>
              <option value="all">{t('Tous', 'All', 'Todos')}</option>
            </select>
            <button className="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              onClick={() => setCreating(true)}>
              + {t('Signaler', 'Report', 'Reportar')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Liste */}
            <div className="space-y-2">
              {shown.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">{t('Aucun report.', 'No report.', 'Sin reportes.')}</p>}
              {shown.map((r) => {
                const sev = SEVERITY_UI[r.priority] || SEVERITY_UI.normal;
                const st = STATUS_UI[r.status] || STATUS_UI.new;
                return (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      r.id === selectedId ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">{r.title}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sev.color}`}>{t(...sev.label)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{catLabel(r.domain)}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st.color}`}>{t(...st.label)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Détail */}
            <div className="lg:col-span-2">
              {selected && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-gray-900">{selected.title}</h2>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-gray-500">{catLabel(selected.domain)}</span>
                        <span className={`font-semibold px-1.5 py-0.5 rounded-full ${(SEVERITY_UI[selected.priority] || SEVERITY_UI.normal).color}`}>{t(...(SEVERITY_UI[selected.priority] || SEVERITY_UI.normal).label)}</span>
                        <span className={`font-semibold px-1.5 py-0.5 rounded-full ${(STATUS_UI[selected.status] || STATUS_UI.new).color}`}>{t(...(STATUS_UI[selected.status] || STATUS_UI.new).label)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('Affecté à', 'Assigned to', 'Asignado a')} : <b>{selected.assigned_department || '—'}</b>
                        {selected.reporter_name ? ` · ${t('par', 'by', 'por')} ${selected.reporter_name}` : ''}
                      </p>
                    </div>
                    {canManage && (
                      <button onClick={remove} className="text-xs text-rose-500 hover:text-rose-700">{t('Supprimer', 'Delete', 'Eliminar')}</button>
                    )}
                  </div>

                  {selected.description && <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{selected.description}</p>}

                  {/* Transitions de statut */}
                  {canManage && nextStatuses(selected.status).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-gray-100">
                      {nextStatuses(selected.status).map((s) => (
                        <button key={s} onClick={() => setStatus(s)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                          → {t(...(STATUS_UI[s] || { label: [s] }).label)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Commentaires */}
                  <div className="mt-5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{t('Commentaires', 'Comments', 'Comentarios')}</h3>
                    <div className="space-y-2 mb-3">
                      {comments.length === 0 && <p className="text-xs text-gray-400">{t('Aucun commentaire.', 'No comment.', 'Sin comentarios.')}</p>}
                      {comments.map((c) => (
                        <div key={c.id} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
                          <div className="text-gray-700 whitespace-pre-wrap">{c.body}</div>
                          <div className="text-[11px] text-gray-400 mt-1">{c.author || '—'} · {String(c.created_at || '').slice(0, 16).replace('T', ' ')}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" value={commentText}
                        onChange={(e) => setCommentText(e.target.value)} placeholder={t('Ajouter un commentaire…', 'Add a comment…', 'Añadir un comentario…')}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); postComment(); } }} />
                      <button onClick={postComment} disabled={!commentText.trim()}
                        className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        {t('Envoyer', 'Send', 'Enviar')}
                      </button>
                    </div>
                  </div>

                  {/* Historique */}
                  <div className="mt-5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{t('Historique', 'History', 'Historial')}</h3>
                    <ul className="space-y-1.5">
                      {history.map((h) => (
                        <li key={h.id} className="text-xs text-gray-500 flex gap-2">
                          <span className="text-gray-400 shrink-0">{String(h.at || '').slice(0, 16).replace('T', ' ')}</span>
                          <span>
                            <b>{t(...(HISTORY_ACTION_LABELS[h.action] || [h.action]))}</b>
                            {h.to_status ? ` → ${t(...(STATUS_UI[h.to_status] || { label: [h.to_status] }).label)}` : ''}
                            {h.detail ? ` · ${h.detail}` : ''}
                            {h.actor ? ` · ${h.actor}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {creating && <ReportFormModal onSave={create} onClose={() => setCreating(false)} />}
    </Layout>
  );
}
