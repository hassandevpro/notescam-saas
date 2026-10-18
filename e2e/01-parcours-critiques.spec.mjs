// PARCOURS CRITIQUES — squelette assume, a remplir parcours par parcours.
//
// Les huit parcours ci-dessous sont ceux designes comme critiques le 2026-10-18 :
// authentification, etablissements, eleves, paiements, caisse, synchronisation,
// sauvegardes, isolation des donnees.
//
// Ils sont declares en `test.fixme` : Playwright les COMPTE et les affiche comme
// « a faire », sans les executer et sans faire echouer la suite. C'est volontaire,
// et preferable aux deux alternatives :
//   - un test vide qui passe donnerait une CI verte mensongere ;
//   - ne rien ecrire perdrait la liste des parcours et leur prerequis exact.
//
// CE QUI MANQUE POUR LES ECRIRE, et c'est la seule chose qui manque : une ecole
// de semence et un compte de test sur la base SQLite jetable. Les briques
// existent deja dans le depot :
//   - `packaging/make-seed-ecole.mjs`      (npm run seed:ecole)
//   - `scripts/seed-college-la-retraite.mjs`
//   - `scripts/seed-transfer-test.mjs`
//   - `server/reset-password-cli.mjs`      (pose un mot de passe local)
// Le travail restant est de les enchainer dans un `globalSetup` qui amorce la
// base de `NOTESCAM_DATA_DIR` avant la premiere navigation, puis d'ecrire les
// assertions. Tant que ce n'est pas fait, ces tests ne doivent PAS etre actives.
import { test } from '@playwright/test';

test.describe('1. Authentification', () => {
  test.fixme('un compte inconnu est refuse, sans divulguer si l identifiant existe', async () => {});
  test.fixme('une session valide survit a un rechargement de page', async () => {});
  test.fixme('la deconnexion vide le cache local (aucune donnee d ecole ne reste lisible)', async () => {});
});

test.describe('2. Etablissements', () => {
  test.fixme('un administrateur ne voit que son etablissement', async () => {});
  test.fixme('changer d annee scolaire change le perimetre des classes affichees', async () => {});
});

test.describe('3. Eleves', () => {
  test.fixme('inscrire un eleve le fait apparaitre dans sa classe', async () => {});
  // Garde-fou de l incident I6 (THE GENIUS, 2026-09-10) porte au niveau du parcours :
  // le test unitaire existe deja mais il est en echec, voir PROJECT_STATUS.md B2.
  test.fixme('importer un tableur range la date et le lieu de naissance dans les bons champs', async () => {});
  test.fixme('un doublon de nom est signale a l inscription', async () => {});
});

test.describe('4. Paiements', () => {
  // Regle imperative : ces tests ne doivent JAMAIS modifier de donnee financiere
  // existante. Ils creent leur propre eleve et leurs propres frais sur la base
  // jetable, et n y touchent qu a ceux-la.
  test.fixme('un versement reduit le du de l eleve du montant exact', async () => {});
  test.fixme('un meme frais ne peut pas etre compte deux fois (incident I7)', async () => {});
  test.fixme('l annulation d un versement laisse une trace et retablit le du', async () => {});
});

test.describe('5. Caisse', () => {
  test.fixme('ouvrir puis clore une session de caisse equilibre les mouvements', async () => {});
  test.fixme('une balance de document illisible est conservee telle quelle, pas ecartee', async () => {});
});

test.describe('6. Synchronisation', () => {
  // Le coeur du produit : ces tests valent plus que tous les autres reunis.
  // A ecrire contre le serveur LAN avec le Cloud INJOIGNABLE (aucune cle), afin
  // de verifier la mise en file sans jamais pousser vers la production.
  test.fixme('une saisie faite serveur injoignable part en file et n est pas perdue', async () => {});
  test.fixme('la file survit a un redemarrage du serveur (incident I5)', async () => {});
  test.fixme('une entree refusee ne bloque pas les suivantes (incident I2)', async () => {});
});

test.describe('7. Sauvegardes', () => {
  test.fixme('une sauvegarde se telecharge et se restaure a l identique', async () => {});
  test.fixme('restaurer une sauvegarde plus ancienne ne detruit pas la file en attente', async () => {});
});

test.describe('8. Isolation des donnees', () => {
  // Le risque le plus grave du produit : voir les donnees d une autre ecole.
  test.fixme('un enseignant ne voit que les classes ou il a une affectation', async () => {});
  test.fixme('un surveillant limite a un secteur ne voit pas les autres secteurs', async () => {});
  test.fixme('aucune requete ne renvoie de ligne portant un autre school_id', async () => {});
});
