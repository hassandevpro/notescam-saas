import { Link } from 'react-router-dom';
import LogoMark from '../components/LogoMark';

const LAST_UPDATED = '17 mai 2026';

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-extrabold text-gray-900">NotesCam</span>
          </Link>
          <Link to="/login" className="text-sm text-brand-600 font-semibold hover:text-brand-700 transition-colors">
            Se connecter
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-12">
        {/* En-tête */}
        <div className="mb-10">
          <h1 className="text-3xl font-black text-gray-900 mb-2">Conditions Générales d'Utilisation</h1>
          <p className="text-sm text-gray-400">Dernière mise à jour : {LAST_UPDATED}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">

          <Section title="1. Présentation de la plateforme">
            <p>
              <strong className="text-gray-800">NotesCam</strong> est une plateforme SaaS (Software as a Service) de gestion scolaire
              destinée aux établissements d'enseignement privé d'Afrique francophone, notamment au Cameroun.
            </p>
            <p>
              La plateforme est développée, exploitée et commercialisée par <strong className="text-gray-800">Hassan Ousman</strong>,
              promoteur et actionnaire principal de NotesCam.
            </p>
            <p>
              Pour toute question, contacter l'équipe NotesCam via WhatsApp au{' '}
              <a href="https://wa.me/237670894721" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                +237 670 894 721
              </a>{' '}
              ou par email à{' '}
              <a href="mailto:contact@notescam.app" className="text-brand-600 hover:underline">contact@notescam.app</a>.
            </p>
          </Section>

          <Section title="2. Acceptation des conditions">
            <p>
              En créant un compte ou en utilisant NotesCam, l'utilisateur accepte pleinement et sans réserve les présentes
              Conditions Générales d'Utilisation (CGU). Si vous n'acceptez pas ces conditions, vous devez cesser d'utiliser
              la plateforme.
            </p>
            <p>
              Ces CGU sont susceptibles d'être modifiées à tout moment. Les utilisateurs seront informés de toute
              modification substantielle. La poursuite de l'utilisation après modification vaut acceptation des nouvelles conditions.
            </p>
          </Section>

          <Section title="3. Accès et création de compte">
            <p>
              L'accès à NotesCam requiert la création d'un compte administrateur au nom d'un établissement scolaire.
              L'utilisateur garantit que les informations fournies lors de l'inscription sont exactes, complètes et à jour.
            </p>
            <p>
              Chaque établissement dispose d'un compte administrateur unique. L'administrateur peut ensuite inviter des
              enseignants via un code d'accès propre à l'établissement.
            </p>
            <p>
              L'utilisateur est seul responsable de la confidentialité de ses identifiants de connexion. Toute utilisation
              non autorisée du compte doit être signalée immédiatement à NotesCam.
            </p>
          </Section>

          <Section title="4. Plans et abonnements">
            <p>
              NotesCam propose plusieurs plans tarifaires :
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-gray-800">Starter</strong> — Gratuit à vie. Limité à 1 classe, 30 élèves et fonctionnalités de base.</li>
              <li><strong className="text-gray-800">École</strong> — 8 500 FCFA/mois. Classes et élèves illimités, gestion des frais scolaires, enseignants, suivi des absences.</li>
              <li><strong className="text-gray-800">Pro</strong> — 15 000 FCFA/mois. Toutes les fonctionnalités École + emploi du temps, portail parents.</li>
              <li><strong className="text-gray-800">Réseau</strong> — Sur devis. Pour les groupes d'établissements.</li>
            </ul>
            <p>
              Les abonnements sont à renouveler mensuellement. Le paiement s'effectue via MTN Mobile Money ou Orange Money,
              en contactant l'équipe NotesCam sur WhatsApp. L'activation du plan est confirmée manuellement après réception du paiement.
            </p>
            <p>
              NotesCam se réserve le droit de modifier les tarifs en informant les utilisateurs avec un préavis de 30 jours.
            </p>
          </Section>

          <Section title="5. Utilisation de la plateforme">
            <p>L'utilisateur s'engage à utiliser NotesCam exclusivement à des fins légales et conformément aux présentes CGU. Il est notamment interdit de :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Reproduire, copier ou revendre tout ou partie de la plateforme sans autorisation préalable écrite de NotesCam.</li>
              <li>Utiliser la plateforme pour stocker ou diffuser des contenus illicites, offensants ou portant atteinte aux droits de tiers.</li>
              <li>Tenter de contourner les restrictions de plans ou d'accéder à des fonctionnalités non souscrites.</li>
              <li>Introduire des virus, chevaux de Troie ou tout code malveillant dans la plateforme.</li>
              <li>Partager ses identifiants avec des tiers non autorisés.</li>
            </ul>
          </Section>

          <Section title="6. Données personnelles et confidentialité">
            <p>
              NotesCam collecte et traite des données à caractère personnel dans le cadre de la fourniture de ses services :
              informations sur l'établissement, données des enseignants, données des élèves (nom, classe, notes, absences).
            </p>
            <p>
              Ces données sont hébergées sur l'infrastructure <strong className="text-gray-800">Supabase</strong> (cloud sécurisé).
              NotesCam s'engage à ne pas vendre, louer ou céder ces données à des tiers à des fins commerciales.
            </p>
            <p>
              L'établissement (administrateur) reste responsable des données des élèves et des enseignants qu'il saisit dans
              la plateforme. Il s'engage à avoir obtenu les consentements nécessaires conformément aux lois applicables.
            </p>
            <p>
              L'utilisateur dispose d'un droit d'accès, de rectification et de suppression de ses données. Toute demande
              doit être adressée à NotesCam via WhatsApp ou email.
            </p>
          </Section>

          <Section title="7. Responsabilités et garanties">
            <p>
              NotesCam met tout en œuvre pour assurer la disponibilité et la fiabilité de la plateforme, mais ne saurait
              être tenu responsable :
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Des interruptions temporaires de service dues à des maintenances, pannes ou cas de force majeure.</li>
              <li>De la perte de données résultant d'une utilisation incorrecte de la plateforme par l'utilisateur.</li>
              <li>Des dommages indirects liés à l'utilisation ou à l'impossibilité d'utiliser la plateforme.</li>
            </ul>
            <p>
              L'utilisateur est seul responsable de l'exactitude des données saisies (notes, absences, frais scolaires, etc.)
              et de leur conformité avec les réglementations scolaires en vigueur dans son pays.
            </p>
          </Section>

          <Section title="8. Propriété intellectuelle">
            <p>
              L'ensemble des éléments constituant NotesCam (code source, interface, marque, logo, contenu) est la propriété
              exclusive de <strong className="text-gray-800">Hassan Ousman</strong>, promoteur et actionnaire principal,
              et est protégé par les lois applicables en matière de propriété intellectuelle.
            </p>
            <p>
              Toute reproduction, représentation, modification ou exploitation non autorisée est strictement interdite et
              susceptible de donner lieu à des poursuites judiciaires.
            </p>
          </Section>

          <Section title="9. Résiliation">
            <p>
              L'utilisateur peut résilier son compte à tout moment en contactant NotesCam. Les données de l'établissement
              seront conservées 30 jours après la résiliation, puis définitivement supprimées.
            </p>
            <p>
              NotesCam se réserve le droit de suspendre ou de résilier un compte en cas de non-respect des présentes CGU,
              de non-paiement ou d'utilisation abusive de la plateforme, après mise en demeure restée sans effet.
            </p>
          </Section>

          <Section title="10. Droit applicable et litiges">
            <p>
              Les présentes CGU sont soumises au droit camerounais. En cas de litige, les parties s'engagent à rechercher
              une solution amiable avant tout recours judiciaire.
            </p>
            <p>
              À défaut d'accord amiable, tout litige sera soumis aux tribunaux compétents de Yaoundé, Cameroun.
            </p>
          </Section>

        </div>

        {/* Footer bas de page */}
        <div className="mt-8 text-center text-xs text-gray-400 space-y-1">
          <p>© {new Date().getFullYear()} NotesCam — Promoteur &amp; actionnaire principal : Hassan Ousman</p>
          <p>
            <Link to="/" className="hover:text-gray-600 transition-colors">Accueil</Link>
            {' · '}
            <Link to="/login" className="hover:text-gray-600 transition-colors">Connexion</Link>
            {' · '}
            <Link to="/signup" className="hover:text-gray-600 transition-colors">Créer un compte</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
