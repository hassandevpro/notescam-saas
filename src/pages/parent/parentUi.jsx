import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useParentStore } from '../../store/parentStore';
import { useT } from '../../lib/i18n';

// Briques communes aux écrans de l'ESPACE PARENT.

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && (
            <h2 className="text-xs text-gray-400 uppercase tracking-widest font-semibold">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <p className="text-sm text-gray-400 py-6 text-center">{children}</p>;
}

export function Loading() {
  const t = useT();
  return <p className="text-sm text-gray-400 animate-pulse py-6 text-center">{t('Chargement…', 'Loading…', 'Cargando…')}</p>;
}

// Réponse du serveur = null : « cet élève n'est pas le vôtre ». On l'affiche
// comme un dossier introuvable, sans confirmer que l'élève existe — c'est la
// même discrétion que côté base, où la RPC rend null plutôt qu'une erreur.
export function Denied() {
  const t = useT();
  return (
    <Card>
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-base font-bold text-gray-900 mb-1">
          {t('Dossier introuvable', 'File not found', 'Expediente no encontrado')}
        </h2>
        <p className="text-sm text-gray-500">
          {t("Ce dossier ne correspond à aucun de vos enfants.",
             'This file does not match any of your children.',
             'Este expediente no corresponde a ninguno de sus hijos.')}
        </p>
      </div>
    </Card>
  );
}

/**
 * Résout l'enfant de l'URL et charge une section.
 *
 * L'id vient de l'URL — donc de l'utilisateur. Il n'est PAS filtré ici :
 * on le passe au serveur, qui tranche. Un id étranger revient `null`, et
 * l'écran affiche <Denied/>. C'est volontairement l'ordre inverse de
 * « je vérifie puis j'affiche » : la vérification n'appartient pas au frontend.
 */
export function useChildSection(section) {
  const { studentId } = useParams();
  const selectedId  = useParentStore((s) => s.selectedId);
  const children    = useParentStore((s) => s.children);
  const loadSection = useParentStore((s) => s.loadSection);
  const select      = useParentStore((s) => s.select);
  const id = studentId || selectedId;

  const data    = useParentStore((s) => s.sections[`${section}:${id}`]);
  const loading = useParentStore((s) => !!s.sectionLoading[`${section}:${id}`]);

  // Ouvrir directement l'URL d'un enfant le rend courant dans le sélecteur.
  useEffect(() => { if (studentId && studentId !== selectedId) select(studentId); }, [studentId, selectedId, select]);
  useEffect(() => { if (id) loadSection(section, id); }, [section, id, loadSection]);

  return {
    id,
    child: children.find((c) => c.student.id === id) || null,
    data,
    loading: loading || data === undefined,
    denied: data === null,
  };
}

// Redirige vers l'enfant courant quand la route « enfant » est ouverte sans id.
export function RequireChild({ base }) {
  const selectedId = useParentStore((s) => s.selectedId);
  if (!selectedId) return <Navigate to="/app/parent/enfants" replace />;
  return <Navigate to={`${base}/${selectedId}`} replace />;
}

export const fmtDate = (d, locale = 'fr-FR') =>
  d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
