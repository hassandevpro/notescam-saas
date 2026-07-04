import { useState } from 'react';

// ── « Envoyer aux parents » via le portail parents (Section 9) ───────────────
// Pas d'e-mail backend : on partage les liens du portail parents existant
// (/parent/:token), copiables ou ouvrables dans WhatsApp pré-rempli.
export default function ParentLinksModal({ links = [], t }) {
  const [copied, setCopied] = useState(null);
  const withToken = links.filter((l) => l.hasToken);
  const without = links.length - withToken.length;

  const copy = async (l) => {
    try { await navigator.clipboard.writeText(l.url); setCopied(l.id); setTimeout(() => setCopied(null), 1500); }
    catch { /* presse-papiers indisponible */ }
  };

  const copyAll = async () => {
    const text = withToken.map((l) => `${l.name}: ${l.url}`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied('all'); setTimeout(() => setCopied(null), 1500); }
    catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {t('Partagez le lien sécurisé du portail parents pour chaque élève.',
           'Share the secure parent-portal link for each student.',
           'Comparta el enlace del portal de padres.')}
      </p>

      {without > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          {without} {t('élève(s) sans lien parent (portail non activé).', 'student(s) without parent link (portal not enabled).', 'sin enlace de padres.')}
        </p>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={copyAll} disabled={!withToken.length}
          className="btn-secondary text-sm disabled:opacity-50" style={{ width: 'auto' }}>
          {copied === 'all' ? t('Copié ✓', 'Copied ✓', 'Copiado ✓') : t('Copier tous les liens', 'Copy all links', 'Copiar todo')}
        </button>
      </div>

      <ul className="max-h-80 overflow-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{l.name}</span>
            {l.hasToken ? (
              <>
                <button type="button" onClick={() => copy(l)}
                  className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                  {copied === l.id ? t('Copié ✓', 'Copied ✓', 'Copiado ✓') : t('Copier', 'Copy', 'Copiar')}
                </button>
                <a href={l.whatsapp} target="_blank" rel="noreferrer"
                  className="shrink-0 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200">
                  WhatsApp
                </a>
              </>
            ) : (
              <span className="shrink-0 text-xs text-slate-400">{t('lien indisponible', 'no link', 'sin enlace')}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
