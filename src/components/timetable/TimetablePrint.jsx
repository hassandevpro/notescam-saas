import { slotInRange } from '../../lib/timetableEngine';
import { resolveCountryCode } from '../../countries';
import { officialHeaderHtml, officialSignatureHtml } from '../../lib/officialDocHeader';

// ── Rendu imprimable premium (PDF) ───────────────────────────────────────────
// Masqué à l'écran, révélé à l'impression (cf. timetable.css). En-tête officiel
// APC (blocs pays + logo + barre de titre) + grille colorée ; pied à signature
// unique du chef d'établissement (standard plateforme).
export default function TimetablePrint({ slots = [], ranges = [], dayLabels = [], title, subtitle, year, school, showClass = false, t }) {
  const cellFor = (range, day) =>
    slots.find((s) => s.day_of_week === day && slotInRange(s, range));

  const sys = resolveCountryCode(school) === 'guinea_eq' ? 'ES' : 'FR';
  const headerTitle = t('EMPLOI DU TEMPS', 'TIMETABLE');
  const headerSub = [title, subtitle].filter(Boolean).join(' · ');

  return (
    <div className="tt-print">
      <div className="tt-paper">
        <div dangerouslySetInnerHTML={{ __html: officialHeaderHtml(school, { sys, title: headerTitle, subtitle: headerSub }) }} />

        {ranges.length === 0 ? (
          <p className="tt-cell-empty" style={{ padding: '24px 0' }}>—</p>
        ) : (
          <table className="tt-grid">
            <thead>
              <tr>
                <th className="tt-time-col">{t('Heures', 'Hours')}</th>
                {dayLabels.map((d) => <th key={d}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {ranges.map((range) => (
                <tr key={range.key}>
                  <td className="tt-time-cell">{range.start}<br />{range.end}</td>
                  {dayLabels.map((_, i) => {
                    const slot = cellFor(range, i + 1);
                    if (!slot) return <td key={i} className="tt-cell-empty">·</td>;
                    return (
                      <td key={i} style={{ backgroundColor: slot.color.bg, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="tt-cell-subject" style={{ color: slot.color.text }}>{slot.title}</div>
                        {showClass && slot.className && <div className="tt-cell-meta">{slot.className}</div>}
                        {slot.teacherName && <div className="tt-cell-meta">{slot.teacherName}</div>}
                        {slot.room && <div className="tt-cell-meta">📍 {slot.room}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div dangerouslySetInnerHTML={{ __html: officialSignatureHtml(school, sys) }} />

        <div className="tt-foot">
          <span>{school?.name || ''}</span>
          <span>{new Date().toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
    </div>
  );
}
