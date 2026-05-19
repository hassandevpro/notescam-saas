# NotesCam — SaaS

Plateforme de gestion scolaire pour le Cameroun. Multi-écoles, multi-utilisateurs, multi-langues.

**Sprint 1 livré** : Setup Vite + React + Tailwind + Router + Zustand + Auth Supabase.

## Stack

- **Frontend** : Vite + React 18 + Tailwind CSS
- **Routing** : React Router 6
- **State** : Zustand
- **Backend** : Supabase (PostgreSQL + Auth + RLS)
- **Déploiement cible** : Vercel

## Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer en dev
npm run dev
```

L'app sera disponible sur **http://localhost:3000**.

## Structure

```
src/
├── main.jsx              # Point d'entrée React
├── App.jsx               # Routing + init store
├── lib/
│   ├── supabase.js       # Client Supabase
│   └── auth.js           # Helpers auth (getSession, getCurrentUserContext, logout)
├── store/
│   └── authStore.js      # Store Zustand (session, user, school, role)
├── components/
│   ├── Layout.jsx        # Header + container pour pages protégées
│   └── ProtectedRoute.jsx # Wrapper qui redirige vers /login si pas auth
├── pages/
│   ├── Login.jsx         # Page de connexion
│   ├── Signup.jsx        # Inscription école + admin
│   └── Dashboard.jsx     # Tableau de bord après auth
└── styles/
    └── index.css         # Tailwind + composants custom
```

## Routes

| Route | Accès | Description |
|---|---|---|
| `/` | redirige `/app` | — |
| `/login` | public | Page de connexion |
| `/signup` | public | Inscription d'une nouvelle école |
| `/app` | protégée | Tableau de bord (nécessite auth) |

## Variables d'environnement

Copie `.env.example` en `.env.local` et ajuste si besoin :

```env
VITE_SUPABASE_URL=https://ltxopwoxvgslsgzixbpx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

⚠️ **Ne commite jamais `.env.local`** (déjà dans `.gitignore`).

## Build pour production

```bash
npm run build
```

Le résultat est dans `dist/`, prêt à déployer sur Vercel.

## Déploiement Vercel

1. Pousse ce dossier sur GitHub
2. Sur Vercel : `New Project` → import depuis GitHub
3. Vercel détecte automatiquement Vite
4. Ajoute les variables d'env `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Settings → Environment Variables
5. Deploy

## Prochaines étapes (Sprint 2+)

- Sprint 2 : Configuration école détaillée + CRUD classes + CRUD matières
- Sprint 3 : CRUD élèves + import CSV + CRUD comptes enseignants
- Sprint 4 : Saisie notes
- Sprint 5+ : Dashboard, Bulletins, Sync offline, PWA...

Voir `SPEC_NotesCam.md` pour le plan complet.
