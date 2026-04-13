import { createClient } from '@supabase/supabase-js';
import {
  CREDIT_COSTS,
  PLAN_CREDITS,
  FREE_MONTHLY_LIMIT,
  SIGNUP_BONUS_CREDITS,
  FREE_TRIAL_DAYS,
  getVideoCreditCost,
} from './constants';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Lazy monthly refresh avec rollover (max 2 mois) + expiration promo
 */
async function ensureMonthlyReset(userId: string): Promise<void> {
  const supabase = getAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance, credits_monthly_allowance, credits_reset_at, credits_expires_at, subscription_plan')
    .eq('id', userId)
    .single();

  if (!profile) return;

  const now = new Date();

  // Check promo expiration: si credits_expires_at est passé, reset à free
  if (profile.credits_expires_at && new Date(profile.credits_expires_at) < now) {
    const freeAllowance = PLAN_CREDITS.free || 15;
    await supabase
      .from('profiles')
      .update({
        subscription_plan: 'free',
        credits_balance: freeAllowance,
        credits_monthly_allowance: freeAllowance,
        credits_expires_at: null,
        credits_reset_at: now.toISOString(),
      })
      .eq('id', userId);

    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: freeAllowance,
      balance_after: freeAllowance,
      type: 'promo_expired',
      feature: 'promo_expired',
      description: `Crédits promo expirés — retour au plan Gratuit (${freeAllowance} crédits)`,
    });
    return;
  }

  const resetAt = profile.credits_reset_at ? new Date(profile.credits_reset_at) : null;

  const needsReset = !resetAt ||
    resetAt.getMonth() !== now.getMonth() ||
    resetAt.getFullYear() !== now.getFullYear();

  if (needsReset && profile.credits_monthly_allowance > 0) {
    // Rollover: les crédits restants sont reportés (max = 1x allowance de report)
    const currentBalance = profile.credits_balance || 0;
    const allowance = profile.credits_monthly_allowance;
    const carryOver = Math.min(currentBalance, allowance);
    const newBalance = allowance + carryOver;

    await supabase
      .from('profiles')
      .update({
        credits_balance: newBalance,
        credits_reset_at: now.toISOString(),
      })
      .eq('id', userId);

    // Log transaction
    const desc = carryOver > 0
      ? `Renouvellement mensuel: ${allowance} crédits + ${carryOver} reportés`
      : `Renouvellement mensuel: ${allowance} crédits`;
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: newBalance,
      balance_after: newBalance,
      type: 'monthly_reset',
      feature: 'monthly_reset',
      description: desc,
    });
  }
}

/**
 * Vérifie si l'utilisateur est dans sa période d'essai gratuit (7 jours après inscription)
 * Pendant l'essai: modifications d'images (image_i2i) illimitées
 */
async function isInFreeTrial(userId: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .single();

  if (!data?.created_at) return false;

  const createdAt = new Date(data.created_at);
  const trialEnd = new Date(createdAt.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return new Date() < trialEnd;
}

/**
 * Récupère le solde crédits d'un utilisateur (avec lazy refresh)
 */
export async function getCreditsBalance(userId: string): Promise<number> {
  await ensureMonthlyReset(userId);

  const supabase = getAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  return data?.credits_balance ?? 0;
}

/**
 * Récupère le profil crédits complet
 */
export async function getCreditsProfile(userId: string) {
  await ensureMonthlyReset(userId);

  const supabase = getAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('credits_balance, credits_monthly_allowance, credits_reset_at, credits_expires_at, subscription_plan, is_admin')
    .eq('id', userId)
    .single();

  return data;
}

/**
 * Vérifie si l'utilisateur a assez de crédits pour une feature
 */
export async function checkCredits(
  userId: string,
  feature: string,
  duration?: number
): Promise<{ allowed: boolean; cost: number; balance: number }> {
  const balance = await getCreditsBalance(userId);

  let cost: number;
  if (feature === 'video_t2v' || feature === 'video_i2v') {
    cost = getVideoCreditCost(duration || 5);
  } else {
    cost = (CREDIT_COSTS as any)[feature] ?? 0;
  }

  // Modifications illimitées pendant l'essai gratuit
  if (feature === 'image_i2i' && cost > 0 && await isInFreeTrial(userId)) {
    cost = 0;
  }

  return {
    allowed: balance >= cost,
    cost,
    balance,
  };
}

/**
 * Déduit les crédits via la fonction Postgres atomique
 */
export async function deductCredits(
  userId: string,
  feature: string,
  description?: string,
  duration?: number
): Promise<{ success: boolean; newBalance: number }> {
  const supabase = getAdminClient();

  let cost: number;
  if (feature === 'video_t2v' || feature === 'video_i2v') {
    cost = getVideoCreditCost(duration || 5);
  } else {
    cost = (CREDIT_COSTS as any)[feature] ?? 0;
  }

  // Modifications illimitées pendant l'essai gratuit
  if (feature === 'image_i2i' && cost > 0 && await isInFreeTrial(userId)) {
    cost = 0;
  }

  if (cost === 0) {
    const balance = await getCreditsBalance(userId);
    return { success: true, newBalance: balance };
  }

  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_feature: feature,
    p_description: description || null,
  });

  if (error || !data || data.length === 0) {
    console.error('[Credits] deduct_credits error:', error);
    return { success: false, newBalance: 0 };
  }

  return {
    success: data[0].success,
    newBalance: data[0].new_balance,
  };
}

/**
 * Ajoute des crédits à un utilisateur
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  feature: string,
  description: string
): Promise<{ newBalance: number }> {
  const supabase = getAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  const currentBalance = profile?.credits_balance ?? 0;
  const newBalance = currentBalance + amount;

  await supabase
    .from('profiles')
    .update({ credits_balance: newBalance })
    .eq('id', userId);

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: amount,
    balance_after: newBalance,
    type,
    feature,
    description,
  });

  return { newBalance };
}

/**
 * Active un code promo pour un utilisateur
 */
export async function redeemPromoCode(
  userId: string,
  code: string
): Promise<{ success: boolean; credits?: number; expiresAt?: string; error?: string }> {
  const supabase = getAdminClient();

  // Trouver le code (case-insensitive)
  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('*')
    .ilike('code', code.trim())
    .single();

  if (!promoCode) {
    return { success: false, error: 'Code promo invalide' };
  }

  if (!promoCode.is_active) {
    return { success: false, error: 'Ce code promo n\'est plus actif' };
  }

  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return { success: false, error: 'Ce code promo a expiré' };
  }

  if (promoCode.max_uses && promoCode.used_count >= promoCode.max_uses) {
    return { success: false, error: 'Ce code promo a atteint sa limite d\'utilisation' };
  }

  // Vérifier si l'utilisateur a déjà utilisé un code promo (1 seul code promo par utilisateur, tous codes confondus)
  const { data: existing } = await supabase
    .from('promo_code_redemptions')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Vous avez déjà utilisé un code promo' };
  }

  // Si plan_override: remplacer le solde (pas additionner)
  // Sinon: ajouter les crédits au solde existant
  let expiresAt: string | undefined;
  if (promoCode.plan_override) {
    const planCredits = PLAN_CREDITS[promoCode.plan_override] || promoCode.credits_amount;
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 14); // 2 semaines
    expiresAt = expDate.toISOString();

    // Set balance TO credits_amount (not add)
    await supabase
      .from('profiles')
      .update({
        subscription_plan: promoCode.plan_override,
        credits_balance: promoCode.credits_amount,
        credits_monthly_allowance: planCredits,
        credits_expires_at: expiresAt,
      })
      .eq('id', userId);

    // Log transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: promoCode.credits_amount,
      balance_after: promoCode.credits_amount,
      type: 'promo_code',
      feature: 'promo_code',
      description: `Code promo: ${promoCode.code} (${promoCode.credits_amount} crédits, plan ${promoCode.plan_override})`,
    });
  } else {
    await addCredits(
      userId,
      promoCode.credits_amount,
      'promo_code',
      'promo_code',
      `Code promo: ${promoCode.code} (+${promoCode.credits_amount} crédits)`
    );
  }

  // Enregistrer la rédemption
  await supabase.from('promo_code_redemptions').insert({
    user_id: userId,
    promo_code_id: promoCode.id,
    credits_granted: promoCode.credits_amount,
  });

  // Incrémenter le compteur
  await supabase
    .from('promo_codes')
    .update({ used_count: promoCode.used_count + 1 })
    .eq('id', promoCode.id);

  return { success: true, credits: promoCode.credits_amount, expiresAt };
}

/**
 * Vérifie si un utilisateur gratuit (non-auth) peut générer
 */
export async function checkFreeGeneration(
  ipAddress: string,
  generationType: string
): Promise<{ allowed: boolean; used: number; limit: number; reason?: string }> {
  // En mode gratuit, seules les images sont autorisées
  if (generationType !== 'image') {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      reason: 'requires_account',
    };
  }

  const supabase = getAdminClient();

  // Compter les générations ce mois-ci pour cette IP
  const { count } = await supabase
    .from('free_generations')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ipAddress)
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const used = count || 0;

  return {
    allowed: used < FREE_MONTHLY_LIMIT,
    used,
    limit: FREE_MONTHLY_LIMIT,
    reason: used >= FREE_MONTHLY_LIMIT ? 'free_limit' : undefined,
  };
}

/**
 * Enregistre une génération gratuite
 */
export async function recordFreeGeneration(
  ipAddress: string,
  fingerprint: string | null,
  generationType: string
): Promise<void> {
  const supabase = getAdminClient();

  await supabase.from('free_generations').insert({
    ip_address: ipAddress,
    fingerprint: fingerprint || null,
    generation_type: generationType,
  });
}

/**
 * Initialise les crédits pour un nouvel utilisateur
 */
export async function initializeUserCredits(
  userId: string,
  plan: string = 'free'
): Promise<void> {
  const supabase = getAdminClient();
  const monthlyAllowance = PLAN_CREDITS[plan] || PLAN_CREDITS.free;
  const initialBalance = monthlyAllowance + SIGNUP_BONUS_CREDITS;

  await supabase
    .from('profiles')
    .update({
      credits_balance: initialBalance,
      credits_monthly_allowance: monthlyAllowance,
      credits_reset_at: new Date().toISOString(),
    })
    .eq('id', userId);

  // Log bonus inscription
  if (SIGNUP_BONUS_CREDITS > 0) {
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: SIGNUP_BONUS_CREDITS,
      balance_after: initialBalance,
      type: 'signup_bonus',
      feature: 'signup_bonus',
      description: `Bonus inscription: +${SIGNUP_BONUS_CREDITS} crédits`,
    });
  }
}

/**
 * Récupère l'historique des transactions (paginé)
 */
export async function getCreditHistory(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ transactions: any[]; total: number }> {
  const supabase = getAdminClient();
  const offset = (page - 1) * limit;

  const { data, count } = await supabase
    .from('credit_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    transactions: data || [],
    total: count || 0,
  };
}

/**
 * Vérifie si un user est admin (bypass crédits)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();

  return data?.is_admin === true;
}

/**
 * Extrait l'IP depuis les headers de la request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '0.0.0.0';
}
