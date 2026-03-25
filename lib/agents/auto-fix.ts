/**
 * CEO Auto-Fix System
 *
 * Allows the CEO agent (Noah) to modify system configuration
 * parameters to fix issues automatically, WITH guardrails.
 *
 * What CEO CAN do:
 * - Adjust email limits, batch sizes, delays
 * - Toggle content auto-publish
 * - Modify cron batch sizes
 * - Adjust learning thresholds
 *
 * What CEO CANNOT do:
 * - Modify code structure
 * - Delete data
 * - Change authentication/security settings
 * - Access user credentials
 * - Modify Stripe/payment settings
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface ConfigUpdate {
  key: string;
  value: any;
  reason: string;
}

interface ConfigResult {
  key: string;
  success: boolean;
  oldValue?: any;
  newValue?: any;
  error?: string;
}

/**
 * Read a system config value.
 */
export async function getConfig(supabase: SupabaseClient, key: string): Promise<any> {
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', key)
    .single();
  if (!data) return null;
  try { return JSON.parse(data.value); } catch { return data.value; }
}

/**
 * Read all configs for a category.
 */
export async function getConfigsByCategory(supabase: SupabaseClient, category: string): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('system_config')
    .select('key, value')
    .eq('category', category);
  const configs: Record<string, any> = {};
  for (const row of data || []) {
    try { configs[row.key] = JSON.parse(row.value); } catch { configs[row.key] = row.value; }
  }
  return configs;
}

/**
 * CEO updates a system config with guardrails.
 * Returns success/failure with details.
 */
export async function updateConfig(
  supabase: SupabaseClient,
  update: ConfigUpdate,
): Promise<ConfigResult> {
  const { key, value, reason } = update;

  // 1. Fetch current config with guardrails
  const { data: config } = await supabase
    .from('system_config')
    .select('*')
    .eq('key', key)
    .single();

  if (!config) {
    return { key, success: false, error: `Config "${key}" not found` };
  }

  const oldValue = config.value;

  // 2. Validate against guardrails
  const numValue = typeof value === 'number' ? value : parseFloat(value);

  if (config.min_value !== null && !isNaN(numValue)) {
    const min = parseFloat(config.min_value);
    if (numValue < min) {
      return { key, success: false, error: `Value ${numValue} below minimum ${min}` };
    }
  }

  if (config.max_value !== null && !isNaN(numValue)) {
    const max = parseFloat(config.max_value);
    if (numValue > max) {
      return { key, success: false, error: `Value ${numValue} above maximum ${max}` };
    }
  }

  if (config.allowed_values) {
    try {
      const allowed = JSON.parse(config.allowed_values);
      if (Array.isArray(allowed) && !allowed.includes(value) && !allowed.includes(String(value))) {
        return { key, success: false, error: `Value "${value}" not in allowed values: ${allowed.join(', ')}` };
      }
    } catch {}
  }

  // 3. Apply the update
  const { error } = await supabase
    .from('system_config')
    .update({
      value: JSON.stringify(value),
      updated_by: 'ceo',
      updated_at: new Date().toISOString(),
    })
    .eq('key', key);

  if (error) {
    return { key, success: false, error: error.message };
  }

  // 4. Log the change
  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'auto_fix_config',
    status: 'ok',
    data: {
      key,
      old_value: oldValue,
      new_value: value,
      reason,
      guardrails_passed: true,
    },
    created_at: new Date().toISOString(),
  });

  console.log(`[AutoFix] CEO updated ${key}: ${oldValue} → ${value} (reason: ${reason})`);

  return { key, success: true, oldValue, newValue: value };
}

/**
 * CEO analyzes issues and proposes fixes.
 * Called by the CEO cron after detecting problems.
 */
export async function analyzeAndFix(
  supabase: SupabaseClient,
  issues: Array<{ agent: string; error: string; count: number }>,
): Promise<ConfigResult[]> {
  const results: ConfigResult[] = [];

  for (const issue of issues) {
    // Timeout issues → increase batch delay or reduce batch size
    if (issue.error.includes('timeout') || issue.error.includes('FUNCTION_INVOCATION_TIMEOUT')) {
      if (issue.agent === 'email') {
        results.push(await updateConfig(supabase, {
          key: 'cron_email_batch_size',
          value: 10, // Reduce batch size
          reason: `Agent ${issue.agent} timeout ${issue.count}x — reducing batch size`,
        }));
      } else if (issue.agent === 'dm_instagram') {
        results.push(await updateConfig(supabase, {
          key: 'cron_dm_batch_size',
          value: 20, // Reduce DM batch
          reason: `Agent ${issue.agent} timeout ${issue.count}x — reducing DM batch`,
        }));
      }
    }

    // Quota exceeded → reduce daily limits
    if (issue.error.includes('quota') || issue.error.includes('limit') || issue.error.includes('rate')) {
      if (issue.agent === 'email') {
        const current = await getConfig(supabase, 'email_max_per_day');
        const reduced = Math.max(100, Math.round((current || 300) * 0.8));
        results.push(await updateConfig(supabase, {
          key: 'email_max_per_day',
          value: reduced,
          reason: `Quota exceeded ${issue.count}x — reducing daily limit to ${reduced}`,
        }));
      }
    }

    // Bounce rate too high → increase warmup week
    if (issue.error.includes('bounce') || issue.error.includes('reputation')) {
      const currentWeek = await getConfig(supabase, 'email_warmup_week');
      results.push(await updateConfig(supabase, {
        key: 'email_warmup_week',
        value: Math.min((currentWeek || 1) + 1, 10),
        reason: `High bounce rate detected — extending warmup period`,
      }));
    }
  }

  // Notify admin of all changes
  if (results.length > 0) {
    const successCount = results.filter(r => r.success).length;
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'auto_fix_summary',
      status: 'ok',
      data: {
        total_fixes: results.length,
        successful: successCount,
        failed: results.length - successCount,
        details: results.map(r => `${r.key}: ${r.success ? `${r.oldValue}→${r.newValue}` : r.error}`),
      },
      created_at: new Date().toISOString(),
    });
  }

  return results;
}
