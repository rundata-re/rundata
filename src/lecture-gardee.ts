/**
 * Reads of the store by a key taken from the address (a video, a bulletin's file, a proposal's secret): the key's format
 * is checked by the caller first; here, what was read is kept in this isolate's memory a while, found or not, and
 * once `introuvablesParMinute` keys were read for nothing within the minute, a key not in memory is said not found
 * without a read until the next (a key that exists and is not in memory waits that minute too). The store is read once
 * per key and per while, not once per request.
 */
export interface Garde<T> {
  /** The value for `key`: from memory when it was read less than `ttlMs` ago, else from `read`; null when there is none. */
  lire(key: string, read: () => Promise<T | null>, now?: number): Promise<T | null>;
  /** Forgets `key`, after a change of what it names. */
  oublier(key: string): void;
}

export function garde<T>({ ttlMs, max, introuvablesParMinute, garder = () => true }: { ttlMs: number; max: number; introuvablesParMinute: number; garder?: (v: T) => boolean }): Garde<T> {
  const kept = new Map<string, { at: number; v: T | null }>();
  let minute = 0;
  let vains = 0;
  return {
    async lire(key, read, now = Date.now()) {
      const k = kept.get(key);
      if (k && now - k.at < ttlMs) return k.v;
      if (Math.floor(now / 60_000) !== minute) {
        minute = Math.floor(now / 60_000);
        vains = 0;
      }
      if (!k && vains >= introuvablesParMinute) return null;
      const v = await read();
      if (v === null) vains++;
      kept.delete(key);
      if (v === null || garder(v)) {
        kept.set(key, { at: now, v });
        // The oldest first: a Map keeps the order of insertion.
        while (kept.size > max) kept.delete(kept.keys().next().value!);
      }
      return v;
    },
    oublier(key) {
      kept.delete(key);
    },
  };
}
