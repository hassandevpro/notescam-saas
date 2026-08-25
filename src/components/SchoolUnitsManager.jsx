// Gestion du COMPLEXE SCOLAIRE : unités pédagogiques (maternelle / primaire /
// collège / lycée…), chacune avec sa propre identité (nom, logo, cachet,
// signature, directeur, adresse, contacts, devise, couleurs).
//
// Configurable entièrement depuis les Paramètres — aucune modification de code.
// Les documents (bulletins, cartes, relevés, certificats) récupèrent
// automatiquement l'identité de l'unité de la classe concernée
// (cf. lib/schoolIdentity.js). Sans unité, l'identité reste celle de l'école.

import { useState } from 'react';
import { useT } from '../lib/i18n';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS, classSectionKey } from '../core/engineResolver';
import { resolveClassUnit } from '../lib/schoolIdentity';
import { uploadUnitAsset } from '../lib/schoolUnitService';

const SECTION_OPTS = SECTIONS.filter((s) => s.key !== 'autre');

// Uploader d'image compact (logo / cachet / signature d'une unité).
function UnitAsset({ label, currentUrl, onUpload, onRemove, uploading, hint }) {
  const t = useT();
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      {currentUrl ? (
        <div className="flex items-start gap-2">
          <div className="w-16 h-16 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={currentUrl} alt={label} className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-col gap-1 pt-0.5">
            <label className={`inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? t('Envoi…', 'Uploading…', 'Enviando…') : t('Remplacer', 'Replace', 'Reemplazar')}
              <input type="file" accept="image/jpeg,image/png,image/svg+xml,image/webp" className="hidden"
                onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} disabled={uploading} />
            </label>
            <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:underline text-left">
              {t('Supprimer', 'Remove', 'Quitar')}
            </button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center w-20 h-16 border-2 border-dashed rounded-xl cursor-pointer ${uploading ? 'border-gray-200 opacity-50 pointer-events-none' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50'}`}>
          <span className="text-xl leading-none">+</span>
          <span className="text-[10px] text-gray-400">{uploading ? t('Envoi…', 'Uploading…', 'Enviando…') : t('Choisir', 'Choose', 'Elegir')}</span>
          <input type="file" accept="image/jpeg,image/png,image/svg+xml,image/webp" className="hidden"
            onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} disabled={uploading} />
        </label>
      )}
      {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange, onBlur, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <input type={type} className="form-input" value={value || ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
    </div>
  );
}

// Champs texte de l'unité — la liste sert à la fois à l'enregistrement groupé
// et au calcul des modifications en attente.
const TEXT_FIELDS = ['name', 'director', 'motto', 'address', 'phone', 'email', 'establishment_no'];

// Carte d'édition d'une unité. Les champs texte s'enregistrent quand on les
// quitte (onBlur), ET une barre en pied de carte montre ce qui reste en attente
// avec un bouton explicite — le blur seul ne couvre pas tous les cas (fermeture
// d'onglet, navigation clavier).
function UnitCard({ unit, classes, onSave, onDelete }) {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const [draft, setDraft] = useState(unit);
  const [uploading, setUploading] = useState(null);

  const setField = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const commit = (patch) => onSave(unit.id, patch);
  // Filet de sécurité : on enregistre dès qu'on quitte un champ modifié. Sans
  // cela, une saisie non suivie d'un clic sur « Enregistrer » était perdue en
  // silence — c'est ce qui se passait, le bouton étant noyé entre les deux
  // sélecteurs de couleur.
  const commitField = (k) => () => { if (draft[k] !== unit[k]) commit({ [k]: (draft[k] || null) }); };

  // Modifications en attente : sert à afficher la barre d'enregistrement.
  const pending = TEXT_FIELDS.filter((k) => (draft[k] || '') !== (unit[k] || ''));

  const attachedCount = (classes || []).filter((c) => resolveClassUnit([unit], c) === unit).length;

  const handleUpload = async (assetType, column, file) => {
    setUploading(assetType);
    const { url } = await uploadUnitAsset(school.id, unit.id, file, assetType);
    setUploading(null);
    if (url) { setDraft((d) => ({ ...d, [column]: url })); commit({ [column]: url }); }
  };
  const handleRemove = (column) => { setDraft((d) => ({ ...d, [column]: null })); commit({ [column]: null }); };

  const sectionLabel = SECTIONS.find((s) => s.key === draft.section_key);

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {draft.logo_url
            ? <img src={draft.logo_url} alt="" className="w-10 h-10 object-contain flex-shrink-0" />
            : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">🏫</div>}
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 truncate">{draft.name || t('Unité sans nom', 'Unnamed unit', 'Unidad sin nombre')}</div>
            <div className="text-xs text-slate-400">
              {sectionLabel ? t(sectionLabel.fr, sectionLabel.en, sectionLabel.es) : t('Section libre', 'Free section', 'Sección libre')}
              {' · '}
              {t(`${attachedCount} classe(s)`, `${attachedCount} class(es)`, `${attachedCount} clase(s)`)}
            </div>
          </div>
        </div>
        <button type="button" onClick={() => onDelete(unit.id)} className="text-xs text-red-500 hover:underline flex-shrink-0">
          {t('Supprimer', 'Delete', 'Eliminar')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label={t('Nom de l\'unité', 'Unit name', 'Nombre de la unidad')} value={draft.name}
          onChange={setField('name')} onBlur={commitField('name')} placeholder={t('Ex : École Primaire ABC', 'E.g. ABC Primary School')} />
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Section', 'Section', 'Sección')}</label>
          <select className="form-input" value={draft.section_key || ''}
            onChange={(e) => { setField('section_key')(e.target.value); commit({ section_key: e.target.value || null }); }}>
            <option value="">{t('— Aucune (rattachement manuel) —', '— None (manual) —', '— Ninguna —')}</option>
            {SECTION_OPTS.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 -mt-1">
        {t("Les classes de cette section sont automatiquement rattachées à cette unité.",
           'Classes of this section are automatically attached to this unit.',
           'Las clases de esta sección se vinculan automáticamente a esta unidad.')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label={t('Directeur / Responsable', 'Head / Principal', 'Director')} value={draft.director}
          onChange={setField('director')} onBlur={commitField('director')} placeholder={t('Nom du responsable', 'Head name')} />
        <TextField label={t('Devise (optionnelle)', 'Motto (optional)', 'Lema (opcional)')} value={draft.motto}
          onChange={setField('motto')} onBlur={commitField('motto')} placeholder={t('Travail — Discipline — Succès', 'Work — Discipline — Success')} />
        <TextField label={t('Adresse (si différente)', 'Address (if different)', 'Dirección')} value={draft.address}
          onChange={setField('address')} onBlur={commitField('address')} />
        <TextField label={t('Téléphone', 'Phone', 'Teléfono')} value={draft.phone} onChange={setField('phone')} onBlur={commitField('phone')} />
        <TextField label="Email" type="email" value={draft.email} onChange={setField('email')} onBlur={commitField('email')} />
        <TextField label={t('N° établissement (optionnel)', 'Establishment No. (optional)', 'N.º de centro')} value={draft.establishment_no}
          onChange={setField('establishment_no')} onBlur={commitField('establishment_no')} />
      </div>
      {/* Sauvegarde des champs texte au blur groupé */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          {t('Couleur principale', 'Primary color', 'Color principal')}
          <input type="color" value={draft.color_primary || '#1e3a5f'}
            onChange={(e) => { setField('color_primary')(e.target.value); }}
            onBlur={() => draft.color_primary !== unit.color_primary && commit({ color_primary: draft.color_primary })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          {t('Couleur secondaire', 'Secondary color', 'Color secundario')}
          <input type="color" value={draft.color_secondary || '#c9a24b'}
            onChange={(e) => { setField('color_secondary')(e.target.value); }}
            onBlur={() => draft.color_secondary !== unit.color_secondary && commit({ color_secondary: draft.color_secondary })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-1">
        <UnitAsset label={t('Logo', 'Logo', 'Logo')} currentUrl={draft.logo_url}
          onUpload={(f) => handleUpload('logo', 'logo_url', f)} onRemove={() => handleRemove('logo_url')}
          uploading={uploading === 'logo'} hint={t('PNG carré transparent.', 'Square transparent PNG.')} />
        <UnitAsset label={t('Cachet', 'Stamp', 'Sello')} currentUrl={draft.stamp_url}
          onUpload={(f) => handleUpload('stamp', 'stamp_url', f)} onRemove={() => handleRemove('stamp_url')}
          uploading={uploading === 'stamp'} hint={t('PNG rond.', 'Round PNG.')} />
        <UnitAsset label={t('Signature', 'Signature', 'Firma')} currentUrl={draft.signature_url}
          onUpload={(f) => handleUpload('signature', 'signature_url', f)} onRemove={() => handleRemove('signature_url')}
          uploading={uploading === 'signature'} />
      </div>

      {/* BARRE D'ENREGISTREMENT — visible et explicite. Les champs se
          sauvegardent déjà quand on les quitte ; cette barre existe pour que
          l'utilisateur VOIE ce qui reste en attente et puisse valider d'un
          geste, sans dépendre du blur (touche Entrée, fermeture d'onglet…). */}
      <div className={`flex items-center justify-between gap-3 pt-3 border-t ${
        pending.length ? 'border-amber-200' : 'border-slate-100'}`}>
        <span className={`text-xs ${pending.length ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
          {pending.length
            ? t(`${pending.length} modification(s) non enregistrée(s)`,
                `${pending.length} unsaved change(s)`,
                `${pending.length} cambio(s) sin guardar`)
            : t('Toutes les modifications sont enregistrées.', 'All changes saved.', 'Todos los cambios guardados.')}
        </span>
        <button type="button" disabled={!pending.length}
          onClick={() => {
            const patch = {};
            for (const k of pending) patch[k] = draft[k] || null;
            if (Object.keys(patch).length) commit(patch);
          }}
          className={pending.length ? 'btn-primary' : 'btn-secondary'}
          style={{ width: 'auto', paddingInline: '1.25rem', opacity: pending.length ? 1 : 0.5 }}>
          {t('Enregistrer les modifications', 'Save changes', 'Guardar cambios')}
        </button>
      </div>
    </div>
  );
}

export default function SchoolUnitsManager() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const units = useSchoolStore((s) => s.schoolUnits);
  const classes = useSchoolStore((s) => s.classes);
  const addUnit = useSchoolStore((s) => s.addUnit);
  const updateUnit = useSchoolStore((s) => s.updateUnit);
  const deleteUnit = useSchoolStore((s) => s.deleteUnit);
  const [newName, setNewName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [busy, setBusy] = useState(false);

  const orderedUnits = [...(units || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Sections pédagogiques réellement présentes parmi les classes (pour la
  // création guidée « en un clic » des unités standard du complexe).
  const presentSections = SECTION_OPTS.filter((s) =>
    (classes || []).some((c) => classSectionKey(c) === s.key) &&
    !(units || []).some((u) => u.section_key === s.key)
  );

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    await addUnit({ name: newName.trim(), section_key: newSection || null });
    setNewName(''); setNewSection('');
    setBusy(false);
  };

  const handleAutoCreate = async () => {
    setBusy(true);
    for (const s of presentSections) {
      await addUnit({ name: `${school?.name || ''} — ${t(s.fr, s.en, s.es)}`.trim(), section_key: s.key });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="bg-brand-50/60 border border-brand-100 rounded-xl px-4 py-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-700 mb-1">
          {t('Complexe scolaire', 'School complex', 'Complejo escolar')} — {school?.name}
        </p>
        <p className="text-[13px] leading-snug">
          {t("Définissez ici les unités pédagogiques du groupe (maternelle, primaire, collège, lycée…). Chaque unité imprime sa propre identité sur les documents de ses classes. Les rapports globaux gardent l'identité du groupe.",
             'Define the group\'s teaching units here (nursery, primary, college, high school…). Each unit prints its own identity on its classes\' documents. Group-wide reports keep the group identity.',
             'Defina aquí las unidades pedagógicas del grupo. Cada unidad imprime su propia identidad en los documentos de sus clases.')}
        </p>
      </div>

      {presentSections.length > 0 && (
        <button type="button" onClick={handleAutoCreate} disabled={busy}
          className="btn-secondary text-sm" style={{ width: 'auto', paddingInline: '1.25rem' }}>
          {t(`Créer automatiquement ${presentSections.length} unité(s) standard`,
             `Auto-create ${presentSections.length} standard unit(s)`,
             `Crear ${presentSections.length} unidad(es) estándar`)}
        </button>
      )}

      <div className="space-y-4">
        {orderedUnits.map((u) => (
          <UnitCard key={u.id} unit={u} classes={classes} onSave={updateUnit} onDelete={(id) => {
            if (window.confirm(t('Supprimer cette unité pédagogique ?', 'Delete this teaching unit?', '¿Eliminar esta unidad?'))) deleteUnit(id);
          }} />
        ))}
        {orderedUnits.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            {t('Aucune unité pédagogique. L\'établissement fonctionne comme une école unique.',
               'No teaching unit yet. The school works as a single establishment.',
               'Sin unidades. El centro funciona como un único establecimiento.')}
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
          {t('Ajouter une unité', 'Add a unit', 'Añadir unidad')}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Nom', 'Name', 'Nombre')}</label>
            <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder={t('Ex : Lycée ABC', 'E.g. ABC High School')}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Section', 'Section', 'Sección')}</label>
            <select className="form-input" value={newSection} onChange={(e) => setNewSection(e.target.value)}>
              <option value="">{t('— Aucune —', '— None —', '— Ninguna —')}</option>
              {SECTION_OPTS.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
            </select>
          </div>
          <button type="button" onClick={handleAdd} disabled={busy || !newName.trim()}
            className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
            {t('Ajouter', 'Add', 'Añadir')}
          </button>
        </div>
      </div>
    </div>
  );
}
