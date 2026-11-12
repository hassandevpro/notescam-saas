// Sélecteur de la couleur d'accent d'un CYCLE (primaire ou secondaire) — UN composant, deux usages.
//
// Le primaire et le secondaire ont le MÊME sélecteur (couleur libre + pastilles suggérées + retour au défaut +
// aperçu des teintes déduites) ; seules changent la colonne lue, la couleur par défaut et la palette d'aperçu.
// Pour le secondaire, l'aperçu montre exactement ce que le moteur imprimera : les bleus d'origine tant que rien
// n'est choisi, les teintes déduites de l'accent sinon.

import {
  ACCENT_DEFAUT, ACCENT_SECONDAIRE_DEFAUT, ACCENTS_SUGGERES, teintesBulletin, paletteSecondaire, blancIllisibleSur, parseHex,
} from '../../core/bulletinAccent';

// Pastilles du secondaire : le bleu d'origine d'abord, puis les mêmes suggestions que le primaire.
const SUGGERES_SEC = [
  { hex: ACCENT_SECONDAIRE_DEFAUT, fr: 'Bleu marine (d’origine)', en: 'Navy (original)', es: 'Azul marino (original)' },
  ...ACCENTS_SUGGERES.filter((a) => a.hex !== ACCENT_DEFAUT),
  { hex: ACCENT_DEFAUT, fr: 'Vert', en: 'Green', es: 'Verde' },
];

export default function BulletinAccentPicker({ cycle, valeur, onChange, isAdmin, t }) {
  const sec = cycle === 'secondaire';
  const defaut = sec ? ACCENT_SECONDAIRE_DEFAUT : ACCENT_DEFAUT;
  const suggeres = sec ? SUGGERES_SEC : ACCENTS_SUGGERES;
  const courant = (valeur || defaut).toLowerCase();
  const choisi = (valeur || '') !== '' && courant !== defaut;

  const p = sec ? paletteSecondaire(valeur) : null;
  const pr = sec ? null : teintesBulletin(valeur || ACCENT_DEFAUT);
  const apercu = sec
    ? { accent: p.accent, surAccent: p.surAccent, tint: p.th, tintFort: p.groupe, texte: p.personnalisee ? p.texte : '#111111', bordure: p.bordure }
    : pr;

  return (
    <div className="mb-4" data-cycle={cycle}>
      <label className="form-label">
        {sec
          ? t('Couleur du bulletin — Secondaire', 'Report card colour — Secondary', 'Color del boletín — Secundaria')
          : t('Couleur du bulletin — Primaire et maternelle', 'Report card colour — Primary and nursery', 'Color del boletín — Primaria y preescolar')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          disabled={!isAdmin}
          value={parseHex(valeur) ? (String(valeur).startsWith('#') ? valeur : `#${valeur}`) : defaut}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 rounded border border-gray-300 bg-white p-1 disabled:opacity-60"
          aria-label={t('Choisir une couleur', 'Pick a colour', 'Elegir un color')}
        />
        {suggeres.map((a) => (
          <button
            key={a.hex}
            type="button"
            disabled={!isAdmin}
            onClick={() => onChange(a.hex)}
            title={t(a.fr, a.en, a.es)}
            aria-label={t(a.fr, a.en, a.es)}
            className={`h-7 w-7 rounded-full transition ${
              courant === a.hex ? 'ring-2 ring-offset-1 ring-gray-900' : 'ring-1 ring-gray-300 hover:ring-gray-500'
            } ${isAdmin ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
            style={{ background: a.hex }}
          />
        ))}
        {choisi && (
          <button
            type="button"
            disabled={!isAdmin}
            className="text-xs text-gray-500 underline hover:text-gray-800"
            onClick={() => onChange('')}
          >
            {sec
              ? t('Revenir au bleu d’origine', 'Back to the original blue', 'Volver al azul original')
              : t('Revenir au vert officiel', 'Back to the official green', 'Volver al verde oficial')}
          </button>
        )}
      </div>

      {blancIllisibleSur(valeur) && (
        <p className="mt-2 text-xs rounded border border-amber-300 bg-amber-50 text-amber-800 px-2 py-1" role="alert" style={{ maxWidth: 380 }}>
          {t(
            'Cette couleur est très claire : le titre sera écrit en noir sur la barre colorée (le blanc ne serait pas lisible). Pour un titre blanc, choisissez une teinte plus foncée.',
            'This colour is very light: the title will be printed in black on the bar (white would not be legible). Pick a darker shade for a white title.',
            'Este color es muy claro: el título se imprimirá en negro. Elija un tono más oscuro para un título blanco.',
          )}
        </p>
      )}

      {/* APERÇU en direct : les teintes DÉDUITES (fond des en-têtes, TOTAL, texte assombri), pas une simple pastille. */}
      <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden" style={{ maxWidth: 380 }} data-apercu={cycle}>
        <div className="px-3 py-1.5 text-center text-sm font-bold" style={{ background: apercu.accent, color: apercu.surAccent }}>
          {t('BULLETIN DE NOTES', 'REPORT OF MARKS', 'BOLETÍN DE NOTAS')}
        </div>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td className="px-2 py-1 font-bold" style={{ background: apercu.tint, color: apercu.texte, border: `1px solid ${apercu.bordure}` }}>
                {sec ? t('Matière', 'Subject', 'Asignatura') : t('Compétence évaluée', 'Competence assessed', 'Competencia evaluada')}
              </td>
              <td className="px-2 py-1 text-center" style={{ border: `1px solid ${apercu.bordure}` }}>14 /20</td>
            </tr>
            <tr>
              <td className="px-2 py-1 font-bold" style={{ background: apercu.tintFort, color: apercu.texte, border: `1px solid ${apercu.bordure}` }}>
                {t('TOTAL GÉNÉRAL', 'OVERALL TOTAL', 'TOTAL GENERAL')}
              </td>
              <td className="px-2 py-1 text-center font-bold" style={{ border: `1px solid ${apercu.bordure}` }}>56 /80</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {t(
          'Barre de titre, en-têtes de colonnes, lignes TOTAL et titres de blocs. Les notes et cotes gardent leurs couleurs. Le texte est assombri automatiquement pour rester lisible.',
          'Title bar, column headers, TOTAL rows and block titles. Marks and grades keep their own colours. Text is darkened automatically to stay legible.',
          'Barra de título, encabezados, filas TOTAL y títulos de bloques. Las notas conservan sus colores.',
        )}
      </p>
    </div>
  );
}
