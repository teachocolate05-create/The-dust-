import { RESOURCE_BY_ID } from "../config/resources";
import type { ResourceBundle, ResourceId } from "./types";

export function canAfford(have: Record<ResourceId, number>, cost: ResourceBundle): boolean {
  return (Object.keys(cost) as ResourceId[]).every((k) => have[k] >= (cost[k] ?? 0));
}

export function missingText(have: Record<ResourceId, number>, cost: ResourceBundle): string {
  return (Object.keys(cost) as ResourceId[])
    .filter((k) => have[k] < (cost[k] ?? 0))
    .map((k) => `${RESOURCE_BY_ID[k].name} ${(cost[k] ?? 0) - have[k]} 부족`)
    .join(", ");
}

export function applyBundle(
  have: Record<ResourceId, number>,
  bundle: ResourceBundle,
  sign: 1 | -1,
): Record<ResourceId, number> {
  const next = { ...have };
  for (const k of Object.keys(bundle) as ResourceId[]) next[k] = next[k] + sign * (bundle[k] ?? 0);
  return next;
}

export function scaleBundle(bundle: ResourceBundle, rate: number): ResourceBundle {
  const out: ResourceBundle = {};
  for (const k of Object.keys(bundle) as ResourceId[]) {
    const v = Math.floor((bundle[k] ?? 0) * rate);
    if (v > 0) out[k] = v;
  }
  return out;
}

export function isEmptyBundle(b: ResourceBundle): boolean {
  return (Object.keys(b) as ResourceId[]).every((k) => !b[k]);
}

export function bundleText(b: ResourceBundle): string {
  const parts = (Object.keys(b) as ResourceId[])
    .filter((k) => b[k])
    .map((k) => `${RESOURCE_BY_ID[k].name} ${b[k]}`);
  return parts.length ? parts.join(" · ") : "없음";
}
