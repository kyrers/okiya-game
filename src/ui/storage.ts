/** Tiny localStorage wrapper that never throws (private mode, blocked storage, quota). */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    if (fallback === null || typeof fallback !== 'object') return parsed as T;
    return { ...fallback, ...(parsed as Partial<T>) } as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** FNV-1a 32-bit hash of a string, for turning names/dates into PRNG seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed shared by everyone on the same calendar day (local time). */
export function dailySeed(date = new Date()): number {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return hashString(`okiya-daily-${key}`);
}
