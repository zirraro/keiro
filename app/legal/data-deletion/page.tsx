export const metadata = {
  title: 'Suppression des données | Keiro',
  description: 'Instructions pour demander la suppression de vos données personnelles sur Keiro',
  alternates: {
    canonical: 'https://keiroai.com/legal/data-deletion'
  }
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-neutral-900 mb-8">Suppression des données utilisateur</h1>

        <div className="prose prose-neutral max-w-none">
          <p className="text-sm text-neutral-600 mb-8">
            Dernière mise à jour : 6 février 2026
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">1. Vos droits</h2>
            <p className="text-neutral-700 mb-4">
              Conformément au Règlement Général sur la Protection des Données (RGPD) et aux exigences de Meta/Facebook,
              vous avez le droit de demander la suppression de toutes les données personnelles que Keiro a collectées
              via votre utilisation de notre service, y compris les données obtenues via Facebook Login ou Instagram.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">2. Données collectées</h2>
            <p className="text-neutral-700 mb-4">
              Lorsque vous utilisez Keiro, nous pouvons collecter les données suivantes :
            </p>
            <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
              <li>Informations de profil (nom, email, photo de profil)</li>
              <li>Identifiants de compte Facebook/Instagram</li>
              <li>Tokens d'accès aux API (stockés de manière chiffrée)</li>
              <li>Images et vidéos générées via notre plateforme</li>
              <li>Brouillons de publications et contenus planifiés</li>
              <li>Historique d'utilisation du service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">3. Comment demander la suppression de vos données</h2>
            <p className="text-neutral-700 mb-4">
              Vous pouvez demander la suppression de vos données de plusieurs manières :
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Option 1 : Par email</h3>
              <p className="text-blue-800 mb-2">
                Envoyez un email à <a href="mailto:privacy@keiroai.com" className="underline font-medium">privacy@keiroai.com</a> avec :
              </p>
              <ul className="list-disc pl-6 text-blue-800 space-y-1">
                <li>L'objet : "Demande de suppression de données"</li>
                <li>L'adresse email associée à votre compte Keiro</li>
                <li>Votre nom complet</li>
              </ul>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-purple-900 mb-3">Option 2 : Depuis votre compte</h3>
              <p className="text-purple-800">
                Connectez-vous à votre compte Keiro, accédez aux paramètres de votre compte et
                utilisez l'option "Supprimer mon compte et mes données".
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-green-900 mb-3">Option 3 : Via Facebook</h3>
              <p className="text-green-800">
                Vous pouvez supprimer vos données directement depuis les paramètres Facebook :
                Paramètres &gt; Applications et sites web &gt; Keiro &gt; Supprimer.
                Cette action déclenchera automatiquement la suppression de vos données sur nos serveurs.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">4. Ce qui sera supprimé</h2>
            <p className="text-neutral-700 mb-4">
              Lors de la suppression, nous supprimerons :
            </p>
            <ul className="list-disc pl-6 text-neutral-700 space-y-2 mb-4">
              <li>Votre compte utilisateur et toutes les informations de profil</li>
              <li>Tous les tokens d'accès aux réseaux sociaux</li>
              <li>Toutes les images et vidéos générées</li>
              <li>Tous les brouillons et publications planifiées</li>
              <li>L'historique d'utilisation et les statistiques</li>
              <li>Toutes les données associées à votre identifiant Facebook/Instagram</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">5. Délai de traitement</h2>
            <p className="text-neutral-700 mb-4">
              Votre demande de suppression sera traitée dans un délai maximum de <strong>30 jours</strong>.
              Vous recevrez une confirmation par email une fois la suppression effectuée.
            </p>
            <p className="text-neutral-700 mb-4">
              Certaines données peuvent être conservées plus longtemps si la loi l'exige
              (obligations comptables, fiscales ou légales), mais elles ne seront plus utilisées
              à des fins commerciales.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">6. Contact</h2>
            <p className="text-neutral-700 mb-4">
              Pour toute question concernant la suppression de vos données, contactez notre
              délégué à la protection des données :
            </p>
            <ul className="list-none text-neutral-700 space-y-1">
              <li><strong>Email :</strong> <a href="mailto:privacy@keiroai.com" className="text-blue-600 underline">privacy@keiroai.com</a></li>
              <li><strong>Site :</strong> <a href="https://keiroai.com" className="text-blue-600 underline">keiroai.com</a></li>
            </ul>
          </section>
        </div>

        <div className="mt-12 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 transition-colors"
          >
            Retour à l'accueil
          </a>
        </div>
      </div>
    </div>
  );
}
