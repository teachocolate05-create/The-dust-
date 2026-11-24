// 시드 기반 난수 (mulberry32). 같은 시드면 같은 결과가 나온다.
// 상태에 시드를 저장하므로 새로고침으로 결과를 바꿀 수 없다.

export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const newSeed = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, newSeed];
}

/** min~max 정수 */
export function randomInt(seed: number, min: number, max: number): [number, number] {
  const [v, s] = nextRandom(seed);
  return [min + Math.floor(v * (max - min + 1)), s];
}

/** 가중치 목록에서 하나 고르기 */
export function pickWeighted<T extends { weight: number }>(seed: number, items: T[]): [T, number] {
  const total = items.reduce((n, i) => n + i.weight, 0);
  const [v, s] = nextRandom(seed);
  let r = v * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return [item, s];
  }
  return [items[items.length - 1], s];
}
