// Résolveur ESM « à la Vite » pour exécuter les modules de src/ dans Node :
// le dépôt importe sans extension (`./printStyles`, `../countries`), ce que Node
// ne résout pas nativement. Utilisé par les scripts de test.
//
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/test-print.mjs
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) throw err;
    for (const suffix of ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}
