import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { categoryLabel } from '../../lib/timetableEngine';

// ── Carte de cours enrichie ──────────────────────────────────────────────────
// Affiche matière · enseignant · salle · heure début/fin, colorée par catégorie
// (barre d'accent + fond clair). Draggable via dnd-kit quand `editable`.
// Un liseré rouge signale un créneau en conflit.
export default function CourseCard({
  slot, t, editable = false, conflicted = false,
  showClass = false, onEdit, onDelete, dragId,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId ?? slot.id,
    data: { slot },
    disabled: !editable,
  });

  const c = slot.color;
  const style = {
    backgroundColor: c.bg,
    borderColor: conflicted ? '#ef4444' : c.border,
    boxShadow: conflicted ? '0 0 0 1px #ef4444' : undefined,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border p-2 text-left transition-shadow ${
        editable ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''
      } ${isDragging ? 'z-50 shadow-xl' : ''}`}
      {...(editable ? { ...listeners, ...attributes } : {})}
    >
      {/* Barre d'accent catégorie */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: c.dot }}
        aria-hidden
      />

      <div className="pl-1.5">
        <p className="text-[10px] font-mono leading-none" style={{ color: c.text, opacity: 0.8 }}>
          {slot.start} – {slot.end}
        </p>
        <p className="mt-1 text-[13px] font-bold leading-tight" style={{ color: c.text }}>
          {slot.title}
        </p>

        {showClass && slot.className && (
          <p className="mt-0.5 text-[11px] font-semibold text-indigo-600 truncate">{slot.className}</p>
        )}
        {slot.teacherName && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 truncate">
            <svg className="w-3 h-3 shrink-0 opacity-60" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
            </svg>
            {slot.teacherName}
          </p>
        )}
        {slot.room && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 truncate">
            <svg className="w-3 h-3 shrink-0 opacity-60" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            {slot.room}
          </p>
        )}

        <span
          className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: c.dot + '22', color: c.text }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
          {categoryLabel(slot.category.id, t)}
        </span>
      </div>

      {/* Actions au survol */}
      {editable && (onEdit || onDelete) && (
        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
          {onEdit && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(slot); }}
              className="w-5 h-5 flex items-center justify-center rounded bg-white/80 text-slate-500 hover:text-brand-700 hover:bg-white shadow-sm"
              title={t('Modifier', 'Edit')}
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }}
              className="w-5 h-5 flex items-center justify-center rounded bg-white/80 text-slate-500 hover:text-red-600 hover:bg-white shadow-sm"
              title={t('Supprimer', 'Delete')}
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
