// Résolveur de doublures pour _honorSettings.test.mjs.
//
// Le moteur des tableaux d'honneur lit `lib/useCountry`, qui importe le store
// d'authentification (et donc le client Supabase, qui exige `import.meta.env` de
// Vite). Le test n'a besoin d'aucun des deux : on double le store.
const STUBS = {
  '../store/authStore': 'export const useAuthStore = Object.assign((sel) => sel({ school: null }), { getState: () => ({ school: null }) });',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) throw err;
    for (const suffix of ['.js', '.jsx', '/index.js']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}
