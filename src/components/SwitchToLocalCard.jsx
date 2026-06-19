// src/components/SwitchToLocalCard.jsx
// Encart « Passer en local (hors-ligne) » — édition CLOUD uniquement, admin.
//
// L'app cloud ne peut pas créer elle-même une base SQLite locale : le passage
// au local se fait dans l'app NotesCam LAN installée sur un PC de l'école, qui
// télécharge automatiquement les données de ce compte. Cet encart explique la
// marche à suivre (l'inverse de « Activer NotesCam Cloud » côté LAN).
//
// Auto-masqué en édition LAN (où c'est l'inverse qui s'applique) et pour les
// non-admins.
import { useState } from 'react';
import { IS_LAN } from '../lib/edition';
import { useAuthStore } from '../store/authStore';

export default function SwitchToLocalCard() {
  const role = useAuthStore((s) => s.role);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  if (IS_LAN || role !== 'admin') return null;

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">💻 Passer en local (hors-ligne)</h2>
        <button className="text-sm font-semibold text-brand-500 hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Masquer' : 'Voir les étapes'}
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Utilisez NotesCam <strong>sans Internet</strong> sur un PC de l'école. Vos données ne sont
        pas recréées : elles sont <strong>téléchargées automatiquement</strong> depuis ce compte cloud,
        puis l'établissement continue de travailler hors-ligne (et reste synchronisable).
      </p>

      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        Compte de connexion à utiliser sur le poste local : <b>{user?.email || '—'}</b>
      </div>

      {open && (
        <ol className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-700">
          <li><b>1.</b> Installez <b>NotesCam Local</b> sur le PC serveur de l'école (fichier d'installation fourni par votre fournisseur).</li>
          <li><b>2.</b> À la première ouverture, lancez l'assistant de migration et connectez-vous avec <b>{user?.email || 'votre compte cloud'}</b>.</li>
          <li><b>3.</b> NotesCam télécharge toutes vos données (écoles, classes, élèves, notes, paiements, périodes…) dans la base locale.</li>
          <li><b>4.</b> Vérifiez le récapitulatif d'intégrité, puis vous pouvez <b>débrancher Internet</b> : tout fonctionne en local.</li>
          <li><b>5.</b> Les autres postes du réseau accèdent via <code className="rounded bg-gray-100 px-1">http://&lt;IP-du-PC&gt;:8080</code>.</li>
          <li><b>6.</b> Plus tard, depuis l'app locale, vous pourrez <b>repasser au cloud</b> ou activer la <b>synchronisation continue</b>.</li>
        </ol>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Besoin du fichier d'installation NotesCam Local ? Contactez votre fournisseur NotesCam.
      </p>
    </div>
  );
}
