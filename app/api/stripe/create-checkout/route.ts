import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import {
  getStripe,
  getOrCreateStripeCustomer,
  getPlanToPrice,
  getPlanToPriceAnnual,
  getSprintPriceId,
  getPackPrices,
  SUBSCRIPTION_PLANS,
  ANNUAL_PLAN_SUFFIX,
} from '@/lib/stripe';

export const runtime = 'edge';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiro.ai';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth optionnelle — fonctionne avec ou sans connexion
    const { user } = await getAuthUser();

    const { planKey, upsellFrom } = await request.json();
    if (!planKey) {
      return NextResponse.json({ error: 'planKey requis' }, { status: 400 });
    }

    // Upsell: si le client vient du plan Créateur et upgrade vers Pro → coupon -40% 1er mois
    const isUpsellProFromCreateur = planKey === 'pro' && upsellFrom === 'createur';
    const PRO_UPSELL_COUPON = process.env.STRIPE_COUPON_PRO_UPSELL || 'FIRST_MONTH_40'; // Coupon Stripe -40% 1er mois

    const stripe = getStripe();
    let sessionParams: any;

    // Params communs selon que l'user est connecté ou non
    const isAuthenticated = !!user;
    const metadata: Record<string, string> = { planKey };
    if (isAuthenticated) {
      metadata.userId = user.id;
    }

    // Success URL : si connecté → mon-compte, sinon → login avec session_id pour lier le paiement
    const successUrlAuth = `${SITE_URL}/mon-compte?section=billing&success=1`;
    const successUrlGuest = `${SITE_URL}/login?stripe_session_id={CHECKOUT_SESSION_ID}&plan=${planKey}&payment_success=1`;
    const successUrl = isAuthenticated ? successUrlAuth : successUrlGuest;
    const cancelUrl = `${SITE_URL}/pricing?cancelled=1`;

    // Créer un Stripe Customer si connecté (sinon Stripe en crée un automatiquement)
    let customerId: string | undefined;
    if (isAuthenticated) {
      customerId = await getOrCreateStripeCustomer(
        user.id,
        user.email!,
        user.user_metadata?.first_name
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
          : undefined
      );
    }

    // ---- AGENTS VENDUS SEULS (add-ons) ----
    //
    // 2026-07-31 — Généralisé à partir du cas Stella. Un add-on est un
    // abonnement séparé qui débloque UN agent sans toucher au plan.
    //
    // Deux garde-fous, appris de Louis : on ne facture jamais un agent que le
    // plan du client contient déjà (ce serait vendre du vide), et on ne facture
    // jamais une capacité qui n'est pas encore réellement livrée.
    const ADDONS: Record<string, { agent: string; envPrice: string; label: string; includedFrom: string; capability?: string }> = {
      stella_addon: { agent: 'whatsapp', envPrice: 'STRIPE_PRICE_STELLA_ADDON', label: 'Stella (WhatsApp)', includedFrom: 'pro', capability: 'stella_whatsapp' },
      theo_addon: { agent: 'gmaps', envPrice: 'STRIPE_PRICE_THEO_ADDON', label: 'Théo (avis Google)', includedFrom: 'createur', capability: 'theo_reviews' },
      sara_addon: { agent: 'rh', envPrice: 'STRIPE_PRICE_SARA_ADDON', label: 'Sara (RH & juridique)', includedFrom: 'createur', capability: 'sara_docs' },
    };

    // Louis a été retiré de la vente le 2026-07-29 : il est inclus dès Créateur.
    // Le prix Stripe reste actif pour les abonnements en cours (le webhook les
    // honore), mais on ne crée plus de checkout.
    if (planKey === 'louis_addon') {
      return NextResponse.json({
        error: 'Louis (Finance) est inclus dès le plan Créateur — aucun add-on nécessaire.',
        included_from: 'createur',
      }, { status: 400 });
    }

    if (ADDONS[planKey]) {
      const addon = ADDONS[planKey];

      // Honnêteté : on ne facture pas une capacité qui n'est pas encore live.
      if (addon.capability) {
        const { isBillable } = await import('@/lib/capability-status');
        if (!isBillable(addon.capability as any)) {
          return NextResponse.json({ error: `${addon.label} arrive bientôt — pas encore facturable. On te préviendra dès son activation.` }, { status: 409 });
        }
      }

      if (!isAuthenticated) return NextResponse.json({ error: 'Connexion requise pour activer un add-on' }, { status: 401 });

      // Le plan du client contient peut-être déjà l'agent : dans ce cas on
      // refuse l'achat au lieu de l'encaisser.
      try {
        // Runtime edge : pas de client Supabase, on interroge PostgREST en REST.
        const profRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user!.id}&select=subscription_plan`,
          { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` } },
        );
        const prof = (await profRes.json())?.[0];
        const PLAN_RANK = ['free', 'gratuit', 'sprint', 'solo', 'createur', 'pro', 'fondateurs', 'standard', 'business', 'elite', 'agence'];
        const current = PLAN_RANK.indexOf(String(prof?.subscription_plan || 'free'));
        const needed = PLAN_RANK.indexOf(addon.includedFrom);
        if (needed >= 0 && current >= needed) {
          return NextResponse.json({
            error: `${addon.label} est déjà inclus dans ton plan — aucun add-on nécessaire.`,
            included_from: addon.includedFrom,
          }, { status: 400 });
        }
      } catch { /* profil illisible → on laisse passer plutôt que bloquer un achat légitime */ }

      const addonPrice = process.env[addon.envPrice];
      if (!addonPrice) return NextResponse.json({ error: `Add-on ${addon.label} non configuré` }, { status: 400 });

      const addonKey = planKey.replace('_addon', '');
      const addonMeta = { addon: addonKey, userId: user!.id };
      const addonSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: addonPrice, quantity: 1 }],
        customer: customerId,
        metadata: addonMeta,
        subscription_data: { metadata: addonMeta },
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        success_url: `${SITE_URL}/assistant/agent/${addon.agent}?addon=success`,
        cancel_url: `${SITE_URL}/assistant/agent/${addon.agent}?addon=cancelled`,
      });
      return NextResponse.json({ url: addonSession.url });
    }

    // Détecter si c'est un plan annuel (ex: pro_annual → basePlan=pro, annual=true)
    const isAnnual = planKey.endsWith(ANNUAL_PLAN_SUFFIX);
    const basePlan = isAnnual ? planKey.replace(ANNUAL_PLAN_SUFFIX, '') : planKey;

    if (SUBSCRIPTION_PLANS.includes(basePlan) && (planKey === basePlan || isAnnual)) {
      // ---- ABONNEMENT RÉCURRENT (MENSUEL OU ANNUEL) ----
      let priceId: string | undefined;
      if (isAnnual) {
        const annualPrices = getPlanToPriceAnnual();
        priceId = annualPrices[basePlan];
      } else {
        const monthlyPrices = getPlanToPrice();
        priceId = monthlyPrices[basePlan];
      }

      if (!priceId) {
        return NextResponse.json({ error: `Prix ${isAnnual ? 'annuel' : 'mensuel'} non configuré pour ce plan` }, { status: 400 });
      }

      // Le planKey stocké dans metadata est toujours le basePlan (ex: pro, pas pro_annual)
      const subMetadata = { ...metadata, planKey: basePlan, billing: isAnnual ? 'annual' : 'monthly' };

      sessionParams = {
        mode: 'subscription' as const,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: subMetadata,
        subscription_data: {
          metadata: subMetadata,
          trial_period_days: 7, // 7 jours gratuits — carte capturee mais pas chargee
        },
        payment_method_collection: 'always' as const, // Toujours demander la carte
        allow_promotion_codes: true, // Le client peut entrer un code promo manuellement
        custom_text: {
          submit: {
            message: 'Annulation en 1 clic à tout moment. Aucun engagement, résiliez quand vous voulez.',
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      };

      // Upsell Créateur → Pro : appliquer le coupon -40% sur le 1er mois
      if (isUpsellProFromCreateur && PRO_UPSELL_COUPON) {
        sessionParams.discounts = [{ coupon: PRO_UPSELL_COUPON }];
        // Quand on utilise discounts, on ne peut pas utiliser allow_promotion_codes en même temps
        delete sessionParams.allow_promotion_codes;
      }
      if (customerId) sessionParams.customer = customerId;

    } else if (planKey === 'sprint') {
      // ---- SPRINT: PAIEMENT UNIQUE (3 jours) ----
      const sprintPriceId = getSprintPriceId();
      if (!sprintPriceId) {
        return NextResponse.json({ error: 'Prix Sprint non configuré' }, { status: 400 });
      }

      sessionParams = {
        mode: 'payment' as const,
        line_items: [{ price: sprintPriceId, quantity: 1 }],
        metadata,
        custom_text: {
          submit: {
            message: 'Paiement unique sécurisé. Accès immédiat après paiement.',
          },
        },
        success_url: isAuthenticated ? `${SITE_URL}/generate?sprint=activated` : successUrlGuest,
        cancel_url: cancelUrl,
      };
      if (customerId) sessionParams.customer = customerId;

    } else if (planKey.startsWith('pack_')) {
      // ---- PACK CRÉDITS: PAIEMENT UNIQUE ----
      const packPrices = getPackPrices();
      const packPriceId = packPrices[planKey];
      if (!packPriceId) {
        return NextResponse.json({ error: 'Pack non configuré' }, { status: 400 });
      }

      sessionParams = {
        mode: 'payment' as const,
        line_items: [{ price: packPriceId, quantity: 1 }],
        metadata,
        success_url: isAuthenticated ? `${SITE_URL}/mon-compte?section=billing&pack=1` : successUrlGuest,
        cancel_url: cancelUrl,
      };
      if (customerId) sessionParams.customer = customerId;

    } else {
      return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Stripe Checkout] Session created:', {
      userId: user?.id || 'guest',
      planKey,
      sessionId: session.id,
      mode: sessionParams.mode,
      authenticated: isAuthenticated,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[Stripe Checkout] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
