/** Shuffle each catalogue and interleave them so the opening page spans languages.
 * Copies the inputs: cached API results must keep their original search order.
 */
export function mixFeedPools<T>(pools: readonly (readonly T[])[], random = Math.random): T[] {
  const shuffle = <V>(values: readonly V[]): V[] => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const shuffled = shuffle(pools.map((pool) => shuffle(pool)));
  const result: T[] = [];
  const longest = Math.max(0, ...shuffled.map((pool) => pool.length));
  for (let row = 0; row < longest; row++) {
    for (const pool of shuffled) {
      if (row < pool.length) result.push(pool[row]);
    }
  }
  return result;
}
