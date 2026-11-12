// Réglages du BULLETIN DE MATERNELLE (Paramètres → Affichage du bulletin → Maternelle).
//
//   1. Format par défaut de l'école : deux cartes à aperçu — « Classique » (l'ancien bulletin) et « Enfantin ».
//   2. Émojis du format Classique : oui / non (un « non » = l'ancien bulletin, lettres seules, à l'identique).
//   3. Visage du niveau « non acquis » : « Encourageant » ou « Un peu triste » (jamais de larme ni de colère).
//
// Le format d'UNE classe se règle dans Classes → Modifier la classe (« Utiliser le défaut de l'école » au départ).
// Aucune valeur n'est écrite tant que l'administrateur n'a rien cliqué : les colonnes restent NULL.

import MatVisage from '../bulletins/MatEmojis';
import { MAT_FORMAT_CLASSIQUE, MAT_FORMAT_ENFANTIN, visageNonAcquis, emojisClassique } from '../../core/matBulletin';

const Carte = ({ actif, titre, description, image, onClick, disabled, nom }) => (
  <button
    type="button" onClick={onClick} disabled={disabled} aria-pressed={actif} data-format={nom}
    className={`text-left rounded-xl border-2 p-2 transition-colors disabled:opacity-60 ${actif ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
    style={{ width: 'min(100%, 300px)' }}
  >
    <img src={image} alt="" loading="lazy" className="w-full rounded-lg border border-gray-200 bg-white" />
    <span className="mt-2 flex items-center gap-2">
      <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${actif ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`} />
      <span className="text-sm font-semibold text-gray-800">{titre}</span>
    </span>
    <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
  </button>
);

export default function BulletinMaternellePicker({ form, setForm, isAdmin, t }) {
  const format = form.bulletin_mat_format === MAT_FORMAT_ENFANTIN ? MAT_FORMAT_ENFANTIN : MAT_FORMAT_CLASSIQUE;
  const poser = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const aEmojis = 'bulletin_mat_emojis' in form;
  const aVisage = 'bulletin_mat_visage_na' in form;
  const emojis = emojisClassique(form);
  const visage = visageNonAcquis(form, format);

  return (
    <div className="mb-4" data-section="maternelle">
      <label className="form-label">{t('Bulletin de maternelle', 'Nursery report card', 'Boletín de preescolar')}</label>

      <div className="flex flex-wrap gap-3">
        <Carte nom="classique" actif={format === MAT_FORMAT_CLASSIQUE} disabled={!isAdmin}
          titre={t('Classique', 'Classic', 'Clásico')} image="/mat-apercu-classique.png"
          description={t('Le tableau habituel : N°, domaine, niveau, observations.', 'The usual table: No., area, level, remarks.')}
          onClick={() => poser('bulletin_mat_format', MAT_FORMAT_CLASSIQUE)} />
        <Carte nom="enfantin" actif={format === MAT_FORMAT_ENFANTIN} disabled={!isAdmin}
          titre={t('Enfantin', 'Playful', 'Infantil')} image="/mat-apercu-enfantin.png"
          description={t('Trois visages par domaine, celui de l’enfant mis en valeur.', 'Three faces per area, the child’s level highlighted.')}
          onClick={() => poser('bulletin_mat_format', MAT_FORMAT_ENFANTIN)} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {t('Format par défaut de l’école. Chaque classe peut avoir le sien : Classes → Modifier la classe. Changer de format ne touche à aucune évaluation saisie.',
          'The school’s default format. Each class can have its own: Classes → Edit class. Changing format never touches the saved assessments.')}
      </p>

      {aEmojis && (
        <label className="mt-3 flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" disabled={!isAdmin}
            checked={emojis} onChange={(e) => poser('bulletin_mat_emojis', e.target.checked)} />
          <span className="text-sm text-gray-700">
            {t('Afficher les émojis dans le format Classique', 'Show emojis in the Classic format', 'Mostrar emojis en el formato Clásico')}
            <span className="block text-xs text-gray-400">
              {t('Décoché : l’ancien bulletin, lettres seules, exactement comme avant. Le format Enfantin porte toujours ses visages.',
                'Unticked: the previous report card, letters only, exactly as before. The Playful format always shows its faces.')}
            </span>
          </span>
        </label>
      )}

      {aVisage && (
        <div className="mt-3">
          <p className="text-sm font-medium text-gray-700">{t('Visage du niveau « non acquis »', 'Face for the “not achieved” level', 'Cara del nivel «no logrado»')}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {[
              ['encourageant', t('Encourageant', 'Encouraging', 'Alentador'), t('sourire en coin, sourcils relevés, petit cœur', 'lopsided smile, raised brows, little heart')],
              ['triste', t('Un peu triste', 'A little sad', 'Un poco triste'), t('petite moue, sourcils inquiets', 'small pout, worried brows')],
            ].map(([v, lib, desc]) => (
              <button key={v} type="button" disabled={!isAdmin} onClick={() => poser('bulletin_mat_visage_na', v)} aria-pressed={visage === v} data-visage={v}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left disabled:opacity-60 ${visage === v ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <MatVisage niveau="NA" visage={v} taille={34} />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">{lib}</span>
                  <span className="block text-xs text-gray-500">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {t('Par défaut : « Un peu triste » en Classique, « Encourageant » en Enfantin. Aucune larme, aucune colère dans les deux cas.',
              'Default: “A little sad” in Classic, “Encouraging” in Playful. Never a tear, never anger.')}
          </p>
        </div>
      )}
    </div>
  );
}
