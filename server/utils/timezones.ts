// Country Code to UTC Offset Mapping
// Provides approximate timezone offsets for customer country codes
// Used for normalizing transaction timestamps to local customer time

const COUNTRY_OFFSETS: Record<string, number> = {
  // North America
  'US': -5, 'CA': -5, 'MX': -6,
  // Europe
  'GB': 0, 'UK': 0, 'IE': 0, 'PT': 0, 'IS': 0,
  'FR': 1, 'DE': 1, 'IT': 1, 'ES': 1, 'NL': 1, 'BE': 1, 'AT': 1, 'CH': 1, 'PL': 1, 'CZ': 1, 'SK': 1, 'HU': 1, 'DK': 1, 'SE': 1, 'NO': 1,
  'FI': 2, 'EE': 2, 'LV': 2, 'LT': 2, 'GR': 2, 'RO': 2, 'BG': 2, 'UA': 2,
  'RU': 3, 'TR': 3,
  // Middle East
  'AE': 4, 'SA': 3, 'IL': 2, 'QA': 3, 'KW': 3, 'BH': 3, 'OM': 4,
  // Asia
  'IN': 5.5, 'PK': 5, 'BD': 6, 'NP': 5.75,
  'TH': 7, 'VN': 7, 'ID': 7, 'MY': 8, 'SG': 8, 'PH': 8, 'HK': 8, 'TW': 8,
  'CN': 8, 'KR': 9, 'JP': 9,
  // Oceania
  'AU': 10, 'NZ': 12,
  // South America
  'BR': -3, 'AR': -3, 'CL': -4, 'CO': -5, 'PE': -5,
  // Africa
  'ZA': 2, 'EG': 2, 'NG': 1, 'KE': 3, 'GH': 0, 'MA': 1,
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getTimezoneOffset(countryCode: string | null | undefined): number {
  if (!countryCode) return 0;
  return COUNTRY_OFFSETS[countryCode.toUpperCase()] ?? 0;
}

export function getLocalDayHour(utcTimestamp: number, countryCode: string | null | undefined): string {
  const offsetHours = getTimezoneOffset(countryCode);
  const localDate = new Date(utcTimestamp * 1000 + offsetHours * 60 * 60 * 1000);
  
  const dayName = DAYS_OF_WEEK[localDate.getUTCDay()];
  const hour = localDate.getUTCHours().toString().padStart(2, '0');
  
  return `${dayName}_${hour}`;
}

export function mergeLiquidityMaps(
  existing: Record<string, number>,
  incoming: Record<string, number>
): Record<string, number> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = (merged[key] || 0) + value;
  }
  return merged;
}

export function findGoldenHour(liquidityMap: Record<string, number> | null | undefined): string | null {
  if (!liquidityMap || Object.keys(liquidityMap).length === 0) {
    return null;
  }
  
  let maxSlot: string | null = null;
  let maxCount = 0;
  
  for (const [slot, count] of Object.entries(liquidityMap)) {
    if (count > maxCount) {
      maxCount = count;
      maxSlot = slot;
    }
  }
  
  return maxSlot;
}
