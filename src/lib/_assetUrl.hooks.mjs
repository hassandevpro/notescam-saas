// Résolveur de doublures pour _assetUrl.test.mjs.
//
//   node --experimental-loader ./src/lib/_assetUrl.hooks.mjs src/lib/_assetUrl.test.mjs
//
// `storage.js` importe `./supabase`, qui lit `import.meta.env` — absent hors de
// Vite. On remplace donc le client par une doublure qui COMPTE les appels, ce
// qui est tout l'objet du test : prouver qu'un affichage ne déclenche plus
// qu'une seule résolution d'URL.
//
// Les hooks tournent dans un THREAD séparé et ne partagent pas `globalThis`
// avec le test : le code de la doublure est écrit ici et dialogue avec le test
// par des globales qu'il lit à l'exécution (les modules `data:` s'exécutent,
// eux, dans le thread principal). Même mécanique que _syncBatch.hooks.mjs.
const STUBS = {
  './supabase': `
    export const supabase = {
      storage: {
        from(bucket) {
          return {
            getPublicUrl(path) {
              globalThis.__assetCalls.push({ kind: 'getPublicUrl', bucket, path });
              return { data: { publicUrl: 'https://exemple.supabase.co/storage/v1/object/public/' + bucket + '/' + path } };
            },
            async createSignedUrl(path, ttl) {
              globalThis.__assetCalls.push({ kind: 'createSignedUrl', bucket, path, ttl });
              const mode = globalThis.__assetSign;
              // Laisse le temps à d'autres appelants d'arriver : c'est ce qui
              // rend la déduplication des appels concurrents observable.
              await new Promise((r) => setTimeout(r, 5));
              if (mode === 'error') return { data: null, error: { message: 'refusé' } };
              if (mode === 'throw') throw new Error('réseau injoignable');
              if (mode === 'empty') return { data: {}, error: null };
              return { data: { signedUrl: 'https://exemple.supabase.co/storage/v1/object/sign/' + bucket + '/' + path + '?token=' + (globalThis.__assetToken++) }, error: null };
            },
          };
        },
      },
    };`,
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
    for (const suffix of ['.js', '.jsx', '/index.js']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}
