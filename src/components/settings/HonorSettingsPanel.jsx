// Paramètres › Tableaux d'honneur (administrateur).
//
// Le SEUIL décide qui figure au tableau d'honneur : saisi et affiché SUR 20, jamais en %.
// L'écriture est réservée à l'administrateur CÔTÉ SERVEUR (policy Cloud « schools: update
// admins », garde LAN guardSchoolWrite) et chaque changement est journalisé (audit_events).
// Enregistrement SÉPARÉ du reste des paramètres : seuls ces champs partent, pour que l'audit
// ne voie que ce qui a changé et qu'un Cloud pas encore migré n'empêche pas le reste.
import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/authStore';
import {
  lireReglagesHonneur, serialiserOptions, validerSeuil, SEUILS_PROPOSES, SEUIL_DEFAUT,
} from '../../core/honorSettings';

const virgule = (n) => String(n).replace('.', ',');

export default function HonorSettingsPanel() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const updateSchool = useAuthStore((s) => s.updateSchool);
  const isAdmin = role === 'admin';
  const init = lireReglagesHonneur(school);

  const [seuil, setSeuil] = useState(virgule(init.minAvg));
  const [enc, setEnc] = useState({ on: init.levels.enc.on, min: virgule(init.levels.enc.min) });
  const [fel, setFel] = useState({ on: init.levels.fel.on, min: virgule(init.levels.fel.min) });
  const [excl, setExcl] = useState(init.excludeSanctioned);
  const [langue, setLangue] = useState(init.lang);
  const [etat, setEtat] = useState(null);   // { ok } | { erreur }

  const vSeuil = validerSeuil(seuil);
  const vEnc = enc.on ? validerSeuil(enc.min) : { ok: true };
  const vFel = fel.on ? validerSeuil(fel.min) : { ok: true };
  // Les niveaux doivent monter : TH ≤ Encouragements ≤ Félicitations.
  const ordreOk = vSeuil.ok
    && (!enc.on || !vEnc.ok || vEnc.valeur >= vSeuil.valeur)
    && (!fel.on || !vFel.ok || vFel.valeur >= (enc.on && vEnc.ok ? vEnc.valeur : vSeuil.valeur));
  const valide = vSeuil.ok && vEnc.ok && vFel.ok && ordreOk;

  const enregistrer = async () => {
    if (!valide || !isAdmin) return;
    setEtat(null);
    const options = serialiserOptions({
      ...init,
      levels: { enc: { on: enc.on, min: vEnc.ok && enc.on ? vEnc.valeur : init.levels.enc.min },
                fel: { on: fel.on, min: vFel.ok && fel.on ? vFel.valeur : init.levels.fel.min } },
      excludeSanctioned: excl, lang: langue,
    });
    const res = await updateSchool({ honor_min_avg: vSeuil.valeur, honor_options: options });
    if (res?.error) {
      const msg = String(res.error);
      setEtat({ erreur: /honor_|schema cache|column/i.test(msg)
        ? t("Le serveur en ligne n'a pas encore ces réglages (mise à jour de la base à appliquer). Rien n'a été modifié.",
            'The online server does not have these settings yet (database update pending). Nothing was changed.')
        : msg });
    } else setEtat({ ok: true });
  };

  const champ = (val, set, invalide) => (
    <input inputMode="decimal" value={val} disabled={!isAdmin} onChange={(e) => set(e.target.value)}
      className={`w-24 px-3 py-2 rounded-lg border-2 text-sm ${invalide ? 'border-red-400' : 'border-slate-200'}`} />
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">{t("Moyenne minimale pour le tableau d'honneur", 'Minimum average for the honour roll')}</h3>
        <p className="text-sm text-slate-500">
          {t(`Tout élève dont la moyenne de la période atteint ce seuil figure au tableau d'honneur. Sur 20 (défaut ${SEUIL_DEFAUT}). Une classe notée sur 100 est comparée au même seuil ramené à son barème. Chaque modèle peut le remplacer.`,
             `Every student whose average for the period reaches this threshold is on the honour roll. Out of 20 (default ${SEUIL_DEFAUT}). A class graded out of 100 is compared with the same threshold on its own scale. Each template can override it.`)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {SEUILS_PROPOSES.map((n) => (
            <button key={n} disabled={!isAdmin} onClick={() => setSeuil(String(n))}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 ${vSeuil.ok && vSeuil.valeur === n ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
              {n}/20
            </button>
          ))}
          {champ(seuil, setSeuil, !vSeuil.ok)}<span className="text-sm text-slate-500">/20</span>
        </div>
        {!vSeuil.ok && <p className="text-xs text-red-600">{t('Une valeur de 0 à 20 est attendue (deux décimales au plus).', 'A value from 0 to 20 is expected (two decimals at most).')}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">{t('Niveaux de distinction', 'Distinction levels')}</h3>
        <p className="text-sm text-slate-500">{t("Au-dessus du tableau d'honneur, deux niveaux facultatifs. Décochés, il n'y a qu'un niveau.", 'Above the honour roll, two optional levels. Unchecked, there is a single level.')}</p>
        {[['enc', t('Encouragements', 'Encouragements'), enc, setEnc, vEnc], ['fel', t('Félicitations', 'Congratulations'), fel, setFel, vFel]].map(([k, label, v, set, val]) => (
          <div key={k} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 w-44 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={v.on} disabled={!isAdmin} onChange={(e) => set({ ...v, on: e.target.checked })} />{label}
            </label>
            {v.on && <>{t('à partir de', 'from')} {champ(v.min, (m) => set({ ...v, min: m }), !val.ok)}<span className="text-sm text-slate-500">/20</span></>}
          </div>
        ))}
        {!ordreOk && vSeuil.ok && <p className="text-xs text-red-600">{t("Les seuils doivent monter : tableau d'honneur ≤ encouragements ≤ félicitations.", 'Thresholds must increase: honour roll ≤ encouragements ≤ congratulations.')}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={excl} disabled={!isAdmin} onChange={(e) => setExcl(e.target.checked)} />
          <span>
            <span className="font-semibold">{t('Exclure les élèves sanctionnés', 'Exclude sanctioned students')}</span><br />
            <span className="text-slate-500">{t('Un blâme ou une exclusion dans la période (registre de vie scolaire ou saisie du conseil) retire l’élève du tableau d’honneur.', 'A reprimand or an exclusion during the period (school life register or council entry) removes the student from the honour roll.')}</span>
          </span>
        </label>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">{t("Langue des tableaux d'honneur", 'Honour roll language')}</h3>
        <select className="form-input max-w-sm" value={langue} disabled={!isAdmin} onChange={(e) => setLangue(e.target.value)}>
          <option value="auto">{t('Automatique — langue de chaque classe (FR / EN)', 'Automatic — language of each class (FR / EN)')}</option>
          <option value="bilingue">{t('Toujours bilingue (français + anglais)', 'Always bilingual (French + English)')}</option>
          <option value="fr">{t('Français uniquement', 'French only')}</option>
          <option value="en">{t('Anglais uniquement', 'English only')}</option>
        </select>
      </section>

      {isAdmin ? (
        <div className="flex items-center gap-3">
          <button onClick={enregistrer} disabled={!valide} className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingInline: '1.5rem' }}>
            {t('Enregistrer', 'Save')}
          </button>
          {etat?.ok && <span className="text-sm text-emerald-700">{t('Enregistré.', 'Saved.')}</span>}
          {etat?.erreur && <span className="text-sm text-red-600">{etat.erreur}</span>}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("Seul l'administrateur peut modifier ces réglages.", 'Only the administrator can change these settings.')}</p>
      )}
    </div>
  );
}
