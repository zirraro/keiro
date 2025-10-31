'use client';

type PricingModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function PricingModal({ isOpen, onClose }: PricingModalProps) {
  if (!isOpen) return null;

  const plans = [
    {
      name: 'Starter',
      price: '29',
      period: '/mois',
      description: 'Parfait pour démarrer',
      features: [
        '50 générations d&apos;images / mois',
        '20 générations de vidéos / mois',
        'Éditions illimitées',
        'Sauvegarde dans la librairie',
        'Téléchargement HD',
        'Support par email',
      ],
      cta: 'Choisir Starter',
      popular: false,
    },
    {
      name: 'Pro',
      price: '79',
      period: '/mois',
      description: 'Pour les professionnels',
      features: [
        '200 générations d&apos;images / mois',
        '100 générations de vidéos / mois',
        'Éditions illimitées',
        'Sauvegarde dans la librairie',
        'Téléchargement HD & 4K',
        'Support prioritaire',
        'API access',
        'Branding personnalisé',
      ],
      cta: 'Choisir Pro',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Sur mesure',
      period: '',
      description: 'Pour les grandes équipes',
      features: [
        'Générations illimitées',
        'Vidéos illimitées',
        'Éditions illimitées',
        'Stockage illimité',
        'Support dédié 24/7',
        'API prioritaire',
        'White-label',
        'Formation personnalisée',
      ],
      cta: 'Nous contacter',
      popular: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full p-8 relative my-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-neutral-400 hover:text-neutral-600 transition-colors"
          aria-label="Fermer"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-neutral-900 mb-2">
            Débloquez tout le potentiel de Keiro
          </h2>
          <p className="text-neutral-600">
            Choisissez le plan qui correspond à vos besoins et continuez à créer sans limites
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border-2 p-6 relative transition-all hover:shadow-lg ${
                plan.popular
                  ? 'border-purple-500 shadow-lg scale-105'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-semibold px-4 py-1 rounded-full">
                  Plus populaire
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-neutral-900 mb-2">{plan.name}</h3>
                <p className="text-sm text-neutral-600 mb-4">{plan.description}</p>
                <div className="mb-1">
                  <span className="text-4xl font-bold text-neutral-900">{plan.price}</span>
                  {plan.period && <span className="text-neutral-600">{plan.period}</span>}
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <svg
                      className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded-lg font-semibold transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                    : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-neutral-600">
            🔒 Paiement sécurisé • ✨ Annulation à tout moment • 💯 Garantie 30 jours satisfait ou remboursé
          </p>
        </div>
      </div>
    </div>
  );
}
