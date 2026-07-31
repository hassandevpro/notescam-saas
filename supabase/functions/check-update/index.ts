// supabase/functions/check-update/index.ts
// Détection de version (OTA) : le serveur LAN envoie sa version courante ; le Cloud
// renvoie la dernière version publiée du canal + si une mise à jour est disponible.
// Manifeste PUBLIC (aucune donnée d'école) → pas de jeton requis.
//
// Déploiement : supabase functions deploy check-update
// Prérequis : supabase_app_releases.sql appliqué.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Comparaison semver simple (a<b => -1, a==b => 0, a>b => 1).
function cmp(a: string, b: string): number {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const { version, channel } = await req.json().catch(() => ({}));
  const ch = channel || 'stable';

  const { data, error } = await admin.from('app_releases')
    .select('version, min_version, sha256, signature, url, mandatory, notes, published_at')
    .eq('channel', ch).order('published_at', { ascending: false }).limit(50);
  if (error) return json(400, { error: error.message });

  // La « dernière » = version la plus haute (semver) du canal.
  let latest = null as null | Record<string, unknown>;
  for (const r of data || []) if (!latest || cmp(r.version as string, latest.version as string) > 0) latest = r;
  if (!latest) return json(200, { available: false, latest: null });

  const available = cmp(latest.version as string, version || '0') > 0;
  return json(200, {
    available,
    latest,
    // Palier requis : si la version courante est < min_version de la cible.
    stepRequired: latest.min_version ? cmp(version || '0', latest.min_version as string) < 0 : false,
  });
});
