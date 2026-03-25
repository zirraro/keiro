/**
 * Timezone helper for client-adapted scheduling.
 *
 * Each client has a timezone in their profile.
 * Agents use this to schedule actions at optimal LOCAL times.
 * Ex: "9h local" for a Paris client = 9h UTC+1 = 8h UTC
 *     "9h local" for a NY client = 9h UTC-5 = 14h UTC
 */

// Timezone offsets (hours from UTC) — common timezones
const TIMEZONE_OFFSETS: Record<string, number> = {
  // Europe
  'Europe/Paris': 1, // CET (winter +1, summer +2)
  'Europe/Brussels': 1,
  'Europe/London': 0,
  'Europe/Berlin': 1,
  'Europe/Madrid': 1,
  'Europe/Lisbon': 0,
  'Europe/Rome': 1,
  'Europe/Amsterdam': 1,
  'Europe/Zurich': 1,
  'Europe/Moscow': 3,
  'Europe/Istanbul': 3,
  'Europe/Stockholm': 1,
  'Europe/Oslo': 1,
  'Europe/Copenhagen': 1,
  'Europe/Helsinki': 2,
  'Europe/Warsaw': 1,
  'Europe/Prague': 1,
  'Europe/Bucharest': 2,
  'Europe/Athens': 2,
  // Americas
  'America/New_York': -5,
  'America/Chicago': -6,
  'America/Denver': -7,
  'America/Los_Angeles': -8,
  'America/Toronto': -5,
  'America/Montreal': -5,
  'America/Vancouver': -8,
  'America/Mexico_City': -6,
  'America/Sao_Paulo': -3,
  'America/Buenos_Aires': -3,
  'America/Bogota': -5,
  'America/Lima': -5,
  // Middle East
  'Asia/Dubai': 4,
  'Asia/Riyadh': 3,
  'Asia/Qatar': 3,
  'Asia/Beirut': 2,
  // Africa
  'Africa/Casablanca': 1,
  'Africa/Tunis': 1,
  'Africa/Dakar': 0,
  'Africa/Abidjan': 0,
  'Africa/Lagos': 1,
  'Africa/Johannesburg': 2,
  // Asia
  'Asia/Tokyo': 9,
  'Asia/Shanghai': 8,
  'Asia/Singapore': 8,
  'Asia/Kolkata': 5.5,
  'Asia/Bangkok': 7,
  // Oceania
  'Australia/Sydney': 10,
  'Pacific/Auckland': 12,
};

/**
 * Get UTC offset for a timezone string.
 */
export function getTimezoneOffset(timezone: string): number {
  return TIMEZONE_OFFSETS[timezone] ?? 1; // Default: Paris (+1)
}

/**
 * Convert a local hour (0-23) to UTC hour.
 * Ex: localHourToUtc(9, 'Europe/Paris') = 8
 * Ex: localHourToUtc(9, 'America/New_York') = 14
 */
export function localHourToUtc(localHour: number, timezone: string): number {
  const offset = getTimezoneOffset(timezone);
  const utcHour = (localHour - offset + 24) % 24;
  return utcHour;
}

/**
 * Convert a UTC hour to local hour.
 * Ex: utcHourToLocal(8, 'Europe/Paris') = 9
 * Ex: utcHourToLocal(14, 'America/New_York') = 9
 */
export function utcHourToLocal(utcHour: number, timezone: string): number {
  const offset = getTimezoneOffset(timezone);
  const localHour = (utcHour + offset + 24) % 24;
  return localHour;
}

/**
 * Check if a UTC hour is appropriate for a client in their timezone.
 * "Appropriate" = between 7h and 22h local time.
 */
export function isAppropriateHour(utcHour: number, timezone: string): boolean {
  const localHour = utcHourToLocal(utcHour, timezone);
  return localHour >= 7 && localHour <= 22;
}

/**
 * Get optimal sending hours in UTC for a client's timezone.
 * Returns 3 hours: morning, midday, evening (in UTC).
 */
export function getOptimalHoursUtc(timezone: string): { morning: number; midday: number; evening: number } {
  return {
    morning: localHourToUtc(9, timezone),    // 9h local
    midday: localHourToUtc(13, timezone),    // 13h local
    evening: localHourToUtc(18, timezone),   // 18h local
  };
}

/**
 * Format context for agents about the client's timezone.
 */
export function formatTimezoneContext(timezone: string, country: string, city?: string): string {
  const offset = getTimezoneOffset(timezone);
  const now = new Date();
  const localHour = (now.getUTCHours() + offset + 24) % 24;
  const localMin = now.getUTCMinutes();
  const optimal = getOptimalHoursUtc(timezone);

  return `LOCALISATION CLIENT: ${city || country || 'Non specifie'} (${timezone}, UTC${offset >= 0 ? '+' : ''}${offset})
Heure locale actuelle: ${localHour}h${String(localMin).padStart(2, '0')}
Heures optimales envoi (UTC): matin ${optimal.morning}h, midi ${optimal.midday}h, soir ${optimal.evening}h
${localHour >= 22 || localHour < 7 ? 'ATTENTION: Le client est probablement endormi. Reporter les actions non-urgentes.' : ''}`;
}
