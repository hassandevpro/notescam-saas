import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, closestCenter,
} from '@dnd-kit/core';
import CourseCard from './CourseCard';

// ── Cellule réceptrice (jour × plage) ────────────────────────────────────────
function DroppableCell({ range, day, children, editable, isEmpty, onAdd, t }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${range.key}:${day}`,
    data: { range, day },
    disabled: !editable,
  });

  return (
    <td
      ref={setNodeRef}
      className={`align-top border border-slate-100 p-1.5 transition-colors ${
        isOver ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : ''
      }`}
    >
      <div className="flex flex-col gap-1.5 min-h-[64px]">
        {children}
        {editable && isEmpty && (
          <button
            type="button"
            onClick={() => onAdd(day, range)}
            className="flex-1 min-h-[56px] w-full rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-brand-300 hover:text-brand-500 hover:bg-brand-50/40 transition-colors text-lg leading-none"
            title={t('Ajouter un cours', 'Add a course')}
          >
            +
          </button>
        )}
      </div>
    </td>
  );
}

// ── Grille horaire professionnelle (heures × jours) ──────────────────────────
// Colonnes = jours, lignes = plages horaires. Drag & drop dnd-kit pour déplacer
// un cours d'une cellule à l'autre (snap sur la plage cible).
export default function TimetableGrid({
  grid, dayLabels, editable = false, conflictedIds = new Set(),
  showClass = false, onMove, onEdit, onDelete, onAdd, t,
}) {
  const [active, setActive] = useState(null); // créneau en cours de déplacement
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (e) => setActive(e.active?.data?.current?.slot || null);

  const handleDragEnd = (e) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const slot = a?.data?.current?.slot;
    const { range, day } = over.data?.current || {};
    if (!slot || !range || !day) return;
    // Aucun changement → ne rien faire (évite un upsert inutile).
    if (slot.day_of_week === day && slot.start === range.start && slot.end === range.end) return;
    onMove?.(slot, day, range);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 border border-slate-100 px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-[88px]">
                {t('Heures', 'Hours')}
              </th>
              {dayLabels.map((d) => (
                <th key={d} className="border border-slate-100 bg-slate-50 px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ range, cells }) => (
              <tr key={range.key}>
                <th className="sticky left-0 z-10 bg-slate-50 border border-slate-100 px-2 py-2 text-center font-mono text-[11px] font-semibold text-slate-500 w-[88px]">
                  <div>{range.start}</div>
                  <div className="text-slate-300">↓</div>
                  <div>{range.end}</div>
                </th>
                {cells.map((cellSlots, i) => {
                  const day = i + 1;
                  return (
                    <DroppableCell
                      key={day}
                      range={range}
                      day={day}
                      editable={editable}
                      isEmpty={cellSlots.length === 0}
                      onAdd={onAdd}
                      t={t}
                    >
                      {cellSlots.map((slot) => (
                        <CourseCard
                          key={slot.id}
                          slot={slot}
                          t={t}
                          editable={editable}
                          conflicted={conflictedIds.has(slot.id)}
                          showClass={showClass}
                          onEdit={onEdit}
                          onDelete={onDelete}
                        />
                      ))}
                    </DroppableCell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Aperçu flottant pendant le drag */}
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-44 rotate-2">
            <CourseCard slot={active} t={t} showClass={showClass} dragId={`overlay-${active.id}`} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
