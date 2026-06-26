# Politique de sécurité — KeiroAI

## Signaler une vulnérabilité

Si vous découvrez une faille de sécurité dans KeiroAI, merci de nous la signaler de manière
responsable, sans la divulguer publiquement avant correction.

- **Contact** : security@keiroai.com
- **Délai de réponse** : sous 72 h.
- **Périmètre** : keiroai.com et l'application (app.keiroai.com), les API `/api/*`, les intégrations
  OAuth (Google, Meta, TikTok, LinkedIn).

Merci d'inclure : description, étapes de reproduction, impact estimé, et toute PoC. Nous nous engageons
à ne pas poursuivre les chercheurs agissant de bonne foi (safe harbor).

## Mesures en place (résumé)

- TLS partout (HSTS preload), en-têtes de sécurité (CSP, X-Frame-Options, nosniff, Referrer-Policy).
- Secrets en variables d'environnement, jamais dans le code ni les logs ; `.env` non versionné.
- Chiffrement au repos (AES-256-GCM) des identifiants sensibles (mots de passe SMTP, tokens Google).
- Authentification : JWT Supabase (utilisateurs), `CRON_SECRET` (tâches planifiées), rôle admin pour
  l'administration. Webhooks vérifiés par signature (Stripe, Meta, Resend).
- Rate limiting sur les endpoints publics.
- Isolation des données par `user_id` / RLS Supabase ; clé `service_role` strictement côté serveur.

## Suppression des données

Voir https://keiroai.com/legal/data-deletion ou écrire à privacy@keiroai.com.
