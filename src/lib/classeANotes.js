// Cette classe porte-t-elle des NOTES, dans N'IMPORTE LEQUEL des moteurs ?
//
// Lecture d'EXISTENCE seulement (une ligne suffit), jamais de contenu : le garde-fou du mode d'évaluation
// n'a besoin que d'un oui ou d'un non. Quatre endroits où une classe peut avoir des notes :
//   • `grades`           (matières, secondaire et primaire « par matières ») — par classe ;
//   • `prim_notes`       (primaire par compétences)  — par élève ;
//   • `apc_notes`        (premier cycle APC)         — par élève ;
//   • `mat_observations` (maternelle)                — par élève.
// Une ligne de `prim_notes` / `apc_notes` à `note` NULL est un BARÈME posé sans note : ce n'est pas une note.
//
// Rend true | false | null. null = on n'a pas pu vérifier (hors connexion, lecture refusée) : l'appelant
// traite null comme « peut-être », jamais comme « non ».
const PAQUET = 200;

async function existe(q) {
  const { data, error } = await q.limit(1);
  if (error) return null;
  return (data || []).length > 0;
}

// `client` est injectable (les tests n'ont pas l'environnement Vite) ; par défaut, le client de l'application.
export async function classeADesNotes({ classId, studentIds = [], client = null }) {
  if (!classId) return false;
  client = client || (await import('./supabase')).supabase;
  let inconnu = false;
  const verdict = (v) => { if (v === true) return true; if (v === null) inconnu = true; return false; };

  if (verdict(await existe(client.from('grades').select('id').eq('class_id', classId).neq('value', '')))) return true;
  for (let i = 0; i < studentIds.length; i += PAQUET) {
    const ids = studentIds.slice(i, i + PAQUET);
    if (verdict(await existe(client.from('prim_notes').select('id').in('eleve_id', ids).gt('note', -1)))) return true;
    if (verdict(await existe(client.from('apc_notes').select('id').in('eleve_id', ids).gt('note', -1)))) return true;
    if (verdict(await existe(client.from('mat_observations').select('id').in('eleve_id', ids)))) return true;
  }
  return inconnu ? null : false;
}
