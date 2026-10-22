// supabase/functions/asset-sync/index.ts
// RÉPLICATION DES FICHIERS LAN → Cloud (photos d'élèves, logos, cachets, signatures).
//
// LE TROU QUE CECI COMBLE
// La synchronisation répliquait les LIGNES mais jamais les FICHIERS : les deux
// stockages — bucket Supabase côté Cloud, disque `FILES_DIR` côté LAN — n'ont
// jamais été réconciliés (cf. docs/AUDIT_HYBRID_ARCHITECTURE.md). Une école LAN
// voyait donc ses `photo_url` arriver au Cloud en pointant vers des fichiers
// restés sur le PC de l'école : 79 photos référencées, 0 présente.
//
// Le serveur LAN ne détient AUCUN secret privilégié — seulement son jeton scellé.
// Il ne peut donc pas écrire dans le Storage directement, et ne le doit pas. Cette
// fonction lui délivre, à la demande, une URL de téléversement signée CANTONNÉE au
// dossier de son école. Le service_role reste confiné ici.
//
// Body : { action: 'inventory' }            → { files: [{ path, size }] }
//        { action: 'upload-url', path }     → { path, token, signedUrl }
//
// Déploiement : supabase functions deploy asset-sync
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function sha256(s: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

const BUCKET = 'school-assets';
const PAGE = 1000;      // pagination de l'inventaire
const MAX_FILES = 20000; // borne dure

async function schoolOfToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from('school_server_tokens')
    .select('school_id').eq('token_hash', await sha256(token)).is('revoked_at', null).maybeSingle();
  return data?.school_id ?? null;
}

// Liste récursive du dossier d'une école. `storage.objects` n'est pas interrogeable
// en SQL depuis ici : on descend l'arborescence par l'API Storage, qui ne renvoie
// qu'un niveau à la fois.
async function listDir(prefix: string, out: { path: string; size: number }[]) {
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error || !data?.length) return;
    for (const e of data) {
      const chemin = prefix ? `${prefix}/${e.name}` : e.name;
      // Un « dossier » est renvoyé sans id ni métadonnées : on descend dedans.
      if (!e.id) { if (out.length < MAX_FILES) await listDir(chemin, out); continue; }
      if (out.length >= MAX_FILES) return;
      out.push({ path: chemin, size: (e.metadata as Record<string, number> | null)?.size ?? 0 });
    }
    if (data.length < PAGE) return;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const schoolId = await schoolOfToken(token);
  if (!schoolId) return json(401, { error: 'bad_token' });

  const { action, path } = await req.json().catch(() => ({}));

  if (action === 'inventory') {
    const files: { path: string; size: number }[] = [];
    await listDir(schoolId, files);
    return json(200, { files });
  }

  if (action === 'upload-url') {
    // CLOISONNEMENT : le chemin doit être DANS le dossier de l'école du jeton.
    // Contrôlé par segments, jamais par `startsWith` seul — « <id>evil/x.jpg »
    // commence bien par l'identifiant sans être dans son dossier. Les remontées
    // de répertoire sont refusées pour la même raison.
    const p = String(path || '');
    const segments = p.split('/');
    if (!p || segments[0] !== schoolId || segments.length < 2
        || segments.some((s) => !s || s === '.' || s === '..')) {
      return json(400, { error: 'chemin_hors_perimetre' });
    }
    // `upsert: true` : une photo remplacée à l'école doit pouvoir écraser la sienne.
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(p, { upsert: true });
    if (error) return json(400, { error: error.message });
    return json(200, { path: p, token: data.token, signedUrl: data.signedUrl });
  }

  return json(400, { error: 'action_inconnue' });
});
