import { Link } from 'react-router-dom';
import { useParentStore } from '../../store/parentStore';
import { useT } from '../../lib/i18n';
import { childSector, SECTOR_LABEL, RELATIONSHIP_LABEL } from '../../lib/parentService';
import StudentAvatar from '../../components/StudentAvatar';
import { Card, fmtDate } from './parentUi';

// MES ENFANTS — §5.
//
// La liste vient de `parent_context` / `parent_dashboard`. Elle N'EST PAS un
// `SELECT * FROM students` filtré côté navigateur : la requête serveur est déjà
// bornée aux enfants rattachés, et un élève non rattaché n'atteint jamais ce
// composant.
export default function ParentChildren() {
  const t = useT();
  const children = useParentStore((s) => s.children);
  const select   = useParentStore((s) => s.select);

  return (
    <Card title={t('Mes enfants', 'My children', 'Mis hijos')}>
      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((c) => {
          const sector = childSector(c);
          return (
            <div key={c.student.id} className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <StudentAvatar student={c.student} size={56} square />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 leading-tight">{c.student.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {c.student.matricule && (
                      <span className="text-[11px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {c.student.matricule}
                      </span>
                    )}
                    {c.class?.name && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {c.class.name}
                      </span>
                    )}
                    {sector && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {t(...SECTOR_LABEL[sector])}
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-28 shrink-0">{t('Établissement', 'School', 'Centro')}</dt>
                      <dd className="text-gray-700 font-medium">{c.school?.name || '—'}</dd>
                    </div>
                    {c.unit?.name && (
                      <div className="flex gap-2">
                        <dt className="text-gray-400 w-28 shrink-0">{t('Unité', 'Unit', 'Unidad')}</dt>
                        <dd className="text-gray-700">{c.unit.name}</dd>
                      </div>
                    )}
                    {c.student.date_naissance && (
                      <div className="flex gap-2">
                        <dt className="text-gray-400 w-28 shrink-0">{t('Naissance', 'Born', 'Nacimiento')}</dt>
                        <dd className="text-gray-700">{fmtDate(c.student.date_naissance)}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-28 shrink-0">{t('Lien', 'Relationship', 'Vínculo')}</dt>
                      <dd className="text-gray-700">
                        {t(...(RELATIONSHIP_LABEL[c.relationship] || RELATIONSHIP_LABEL.autre))}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[
                  ['notes', t('Résultats', 'Results', 'Resultados')],
                  ['bulletins', t('Bulletins', 'Reports', 'Boletines')],
                  ['absences', t('Absences', 'Attendance', 'Ausencias')],
                  ['frais', t('Frais', 'Fees', 'Tasas')],
                ].map(([path, label]) => (
                  <Link
                    key={path}
                    to={`/app/parent/${path}/${c.student.id}`}
                    onClick={() => select(c.student.id)}
                    className="text-center text-xs font-semibold rounded-lg border border-gray-200 py-2 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
