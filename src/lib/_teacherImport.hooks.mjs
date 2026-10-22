// Résolveur de doublures pour _teacherImport.test.mjs.
//
//   node --experimental-loader ./src/lib/_teacherImport.hooks.mjs src/lib/_teacherImport.test.mjs
//
// `teacherImport.js` tire i18n (pour les libellés) et exportCsv (pour l'écriture
// du classeur), qui tirent à leur tour `edition.js` — seul module à lire
// `import.meta.env`, absent hors de Vite. On le remplace donc par une doublure
// « édition cloud ». Le reste (parsing, résolution des matières) est du code pur
// et tourne tel quel.
const STUBS = {
  './edition':     'export const IS_LAN = false;\nexport const backendOnline = () => true;',
  '../lib/edition': 'export const IS_LAN = false;\nexport const backendOnline = () => true;',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
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
