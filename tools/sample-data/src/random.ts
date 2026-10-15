/** A small seeded generator (mulberry32): the same seed always gives the same pack. */
export interface Random {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error("Cannot pick from an empty list");
    return item;
  };
  const weighted = <T>(items: ReadonlyArray<readonly [T, number]>): T => {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let remaining = next() * total;
    for (const [item, weight] of items) {
      remaining -= weight;
      if (remaining < 0) return item;
    }
    const last = items.at(-1);
    if (!last) throw new Error("Cannot pick from an empty list");
    return last[0];
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick,
    weighted,
  };
}
