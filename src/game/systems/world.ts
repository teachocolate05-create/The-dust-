// 업데이트 4: 외부 세계 시스템 — 지상 지역 발견, 원정, 다른 집단(교역·선물·진료), 약탈단 습격, 사기 회복.

import { FACILITY_BY_ID } from "../config/facilities";
import { RULES } from "../config/rules";
import { FACTION_BY_ID, FACTIONS, REGION_BY_ID, REGIONS, WORLD_RULES as W, type FactionId, type RegionId, type TradeOffer } from "../config/world";
import { nextRandom, randomInt } from "../core/random";
import { bundleText, canAfford, missingText } from "../core/resources";
import type { Check, Expedition, GameEvent, GameState, LogEntry, ResourceBundle, ResourceId, Survivor, WorldState } from "../core/types";
import { computeAccess } from "./access";
import { addCondition, hurtMultiplier, isInjured, lifeWorkMultiplier, tryFindMedicine } from "./life";
import { addCapped } from "./operation";
import { canModifyBase, NOT_MAINTENANCE_REASON } from "./phase";

export function createWorld(): WorldState {
  const regions: WorldState["regions"] = {};
  for (const r of REGIONS) regions[r.id] = { discovered: r.id === "plaza", visits: 0 };
  const factions: WorldState["factions"] = {};
  for (const f of FACTIONS) factions[f.id] = { contacted: false, relation: f.startRelation, lastTradeDay: 0 };
  return { regions, factions, expeditions: [] };
}

function log(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

const fail = (reason: string): Check => ({ ok: false, reason });
const ok = (cost: ResourceBundle = {}): Check => ({ ok: true, cost, refund: {} });

function pay(state: GameState, b: ResourceBundle): GameState {
  const r = { ...state.resources };
  for (const [k, v] of Object.entries(b) as [ResourceId, number][]) r[k] -= v;
  return { ...state, resources: r };
}

function setFaction(state: GameState, id: FactionId, fn: (f: WorldState["factions"][string]) => WorldState["factions"][string]): GameState {
  return { ...state, world: { ...state.world, factions: { ...state.world.factions, [id]: fn(state.world.factions[id]) } } };
}

export function factionAttitude(rel: number): string {
  if (rel >= 50) return "우호";
  if (rel >= 0) return "중립";
  if (rel > -40) return "경계";
  return "적대";
}

// ───────────── 지역 ─────────────

export function regionStock(state: GameState, id: RegionId): number {
  return Math.max(W.minStock, 1 - W.depletion * (state.world.regions[id]?.visits ?? 0));
}

/** 아직 못 찾은 지역 중 이미 아는 지역과 이어진 곳 */
function frontier(state: GameState): RegionId[] {
  const known = REGIONS.filter((r) => state.world.regions[r.id]?.discovered);
  const out = new Set<RegionId>();
  for (const r of known) for (const l of r.links) if (!state.world.regions[l]?.discovered) out.add(l);
  return [...out];
}

function discover(state: GameState, id: RegionId): GameState {
  if (state.world.regions[id]?.discovered) return state;
  return { ...state, world: { ...state.world, regions: { ...state.world.regions, [id]: { ...state.world.regions[id], discovered: true } } } };
}

/** 지상 탐사 행동 */
export function doSurfaceScout(state: GameState): { state: GameState; text: string } {
  const [roll, seed] = nextRandom(state.seed);
  let s = { ...state, seed };
  const f = frontier(s);
  if (!f.length) return { state: s, text: "주변 지역은 모두 파악했다. 원정을 보내 더 멀리 가 보자." };
  if (roll >= W.scoutChance) return { state: s, text: "먼지 폭풍 때문에 멀리 보이지 않았다." };
  let i: number;
  let seed2: number;
  [i, seed2] = randomInt(s.seed, 0, f.length - 1);
  s = discover({ ...s, seed: seed2 }, f[i]);
  const r = REGION_BY_ID[f[i]];
  return { state: s, text: `멀리 ${r.name}을(를) 발견했다. ${r.desc} 원정을 보낼 수 있다.` };
}

// ───────────── 원정 ─────────────

export function teamProblem(sv: Survivor): string | null {
  if (sv.isPlayer) return "플레이어는 거점을 지킵니다";
  if (isInjured(sv)) return "다친 사람은 원정을 갈 수 없습니다";
  if (sv.fatigue >= W.maxFatigue) return `피로가 ${W.maxFatigue} 이상입니다`;
  return null;
}

export function expeditionCost(regionId: RegionId, members: number): ResourceBundle {
  const r = REGION_BY_ID[regionId];
  const n = members * r.distance * W.rationPerMemberDay;
  return { food: n, water: n };
}

export function expeditionRisk(state: GameState, regionId: RegionId, ids: string[]): number {
  const r = REGION_BY_ID[regionId];
  const team = state.survivors.filter((s) => ids.includes(s.id));
  if (!team.length) return 0;
  const avg = team.reduce((n, s) => n + Math.min(1, W.injuryPerDanger * r.danger * hurtMultiplier(s)), 0) / team.length;
  return avg;
}

export function canSendExpedition(state: GameState, regionId: RegionId, ids: string[]): Check {
  if (!canModifyBase(state)) return fail("원정대는 정비 시간에 꾸려 다음 날 아침 출발합니다.");
  const r = REGION_BY_ID[regionId];
  if (!r || !state.world.regions[regionId]?.discovered) return fail("아직 모르는 지역입니다.");
  if (state.world.expeditions.some((e) => e.regionId === regionId)) return fail("이미 이 지역에 원정대가 가 있습니다.");
  if (!ids.length) return fail("원정 보낼 생존자를 고르세요.");
  if (ids.length > W.maxTeam) return fail(`원정대는 최대 ${W.maxTeam}명입니다.`);
  for (const id of ids) {
    const sv = state.survivors.find((x) => x.id === id);
    if (!sv) return fail("생존자를 찾을 수 없습니다.");
    const p = teamProblem(sv);
    if (p) return fail(`${sv.name}: ${p}`);
  }
  const cost = expeditionCost(regionId, ids.length);
  if (!canAfford(state.resources, cost)) return fail(`준비물이 부족합니다 (${missingText(state.resources, cost)})`);
  return ok(cost);
}

export function sendExpedition(state: GameState, regionId: RegionId, ids: string[]): GameState {
  const chk = canSendExpedition(state, regionId, ids);
  if (!chk.ok) return state;
  const r = REGION_BY_ID[regionId];
  const members = state.survivors.filter((s) => ids.includes(s.id));
  const exp: Expedition = { id: `ex${state.nextId}`, regionId, members, daysLeft: r.distance, departedDay: state.day };
  let s = pay(state, chk.cost);
  s = {
    ...s,
    nextId: s.nextId + 1,
    survivors: s.survivors.filter((x) => !ids.includes(x.id)),
    world: { ...s.world, expeditions: [...s.world.expeditions, exp] },
  };
  return log(s, `원정대(${members.map((m) => m.name).join(", ")})가 ${r.name}(으)로 떠났다. ${r.distance}일 뒤 돌아온다. (${bundleText(chk.cost)} 챙김)`, "build");
}

/** 하루가 지날 때: 원정 진행, 돌아온 원정대 결과 */
export function processExpeditions(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  let seed = s.seed;
  const events: GameEvent[] = [];
  const staying: Expedition[] = [];
  for (const e0 of state.world.expeditions) {
    const e = { ...e0, daysLeft: e0.daysLeft - 1 };
    if (e.daysLeft > 0) {
      staying.push(e);
      continue;
    }
    const r = REGION_BY_ID[e.regionId as RegionId];
    // 획득량: 지역 물자 × 인원 보너스 × 대원 평균 채집 효율
    const stock = regionStock(s, r.id);
    const team = 1 + W.teamBonus * (e.members.length - 1);
    const skill = e.members.reduce((n, m) => n + (0.6 + 0.2 * m.skills.gather) * lifeWorkMultiplier(m, "scavenge"), 0) / e.members.length;
    const gained: ResourceBundle = {};
    for (const [k, [a, b]] of Object.entries(r.loot) as [ResourceId, [number, number]][]) {
      let v: number;
      [v, seed] = randomInt(seed, a, b);
      v = Math.floor(v * stock * team * skill);
      if (v > 0) gained[k] = v;
    }
    // 부상
    const back: Survivor[] = [];
    const hurtNames: string[] = [];
    for (const m of e.members) {
      let roll: number;
      [roll, seed] = nextRandom(seed);
      let mm: Survivor = { ...m, fatigue: Math.min(100, m.fatigue + 15 * r.distance) };
      if (roll < Math.min(1, W.injuryPerDanger * r.danger * hurtMultiplier(m))) {
        const dmg = Math.round(W.injuryDamage * hurtMultiplier(m));
        mm = { ...mm, health: Math.max(1, mm.health - dmg) };
        const has = mm.conditions.find((c) => c.kind === "injury");
        mm = { ...mm, conditions: has ? mm.conditions.map((c) => (c.kind === "injury" ? { ...c, severity: Math.min(3, c.severity + 1) } : c)) : [...mm.conditions, { kind: "injury", severity: 1 }] };
        hurtNames.push(m.name);
      }
      back.push(mm);
    }
    s = { ...s, seed, survivors: [...s.survivors, ...back] };
    const capped = addCapped(s, gained);
    s = { ...s, resources: capped.resources };
    // 지역 기록, 이웃 지역 발견, 집단과 접촉
    s = {
      ...s,
      world: { ...s.world, regions: { ...s.world.regions, [r.id]: { discovered: true, visits: (s.world.regions[r.id]?.visits ?? 0) + 1 } } },
    };
    const found: string[] = [];
    for (const l of r.links)
      if (!s.world.regions[l]?.discovered) {
        s = discover(s, l);
        found.push(REGION_BY_ID[l].name);
      }
    let contact = "";
    if (r.faction && !s.world.factions[r.faction].contacted) {
      s = setFaction(s, r.faction, (f) => ({ ...f, contacted: true }));
      contact = ` ${FACTION_BY_ID[r.faction].name}과(와) 처음 마주쳤다 (${factionAttitude(s.world.factions[r.faction].relation)}).`;
    }
    const med = tryFindMedicine({ ...s, seed });
    s = med.state;
    seed = s.seed;
    const text =
      `${r.name} 원정대가 돌아왔다. ${Object.keys(gained).length ? `획득: ${bundleText(gained)}.` : "빈손이었다."}` +
      (Object.keys(capped.lost).length ? ` (저장 공간 부족으로 ${bundleText(capped.lost)} 버림)` : "") +
      (hurtNames.length ? ` ${hurtNames.join(", ")} 부상.` : "") +
      (found.length ? ` 새 지역 발견: ${found.join(", ")}.` : "") +
      (med.found ? " 의약품 1개도 찾아왔다." : "") +
      contact;
    s = log(s, `[원정] ${text}`, "event");
    s = { ...s, stats: { ...s.stats, expeditions: s.stats.expeditions + 1 } };
    events.push({ id: "expedition", title: "원정대 귀환", text, tone: hurtNames.length ? "bad" : "good" });
  }
  s = { ...s, seed, world: { ...s.world, expeditions: staying } };
  return { state: s, events };
}

// ───────────── 교역·선물·진료 ─────────────

export function offerGet(state: GameState, fid: FactionId, offer: TradeOffer): ResourceBundle {
  const rel = state.world.factions[fid].relation;
  if (rel < W.friendlyBonusAt) return offer.get;
  const out: ResourceBundle = {};
  for (const [k, v] of Object.entries(offer.get) as [ResourceId, number][]) out[k] = v + 1;
  return out;
}

export function canTrade(state: GameState, fid: FactionId, index: number): Check {
  const f = state.world.factions[fid];
  const def = FACTION_BY_ID[fid];
  if (!f?.contacted) return fail("아직 만나지 못한 집단입니다.");
  if (!canModifyBase(state)) return fail("교역·선물·진료는 정비 시간에 합니다 (무전으로 연락).");
  if (f.relation < 0) return fail("관계가 나빠 거래를 거절합니다. 선물로 관계를 개선하세요.");
  if (f.lastTradeDay === state.day) return fail("오늘은 이미 거래했습니다.");
  const offer = def.offers[index];
  if (!offer) return fail("없는 거래입니다.");
  if (!canAfford(state.resources, offer.give)) return fail(missingText(state.resources, offer.give));
  return ok(offer.give);
}

export function trade(state: GameState, fid: FactionId, index: number): GameState {
  const chk = canTrade(state, fid, index);
  if (!chk.ok) return state;
  const offer = FACTION_BY_ID[fid].offers[index];
  const get = offerGet(state, fid, offer);
  let s = pay(state, offer.give);
  const capped = addCapped(s, get);
  s = { ...s, resources: capped.resources };
  s = setFaction(s, fid, (f) => ({ ...f, lastTradeDay: state.day, relation: Math.min(100, f.relation + 2) }));
  return log(s, `${FACTION_BY_ID[fid].name}과(와) 거래: ${bundleText(offer.give)} → ${bundleText(get)}`, "build");
}

export function canGift(state: GameState, fid: FactionId): Check {
  const f = state.world.factions[fid];
  if (!f?.contacted) return fail("아직 만나지 못한 집단입니다.");
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const g = FACTION_BY_ID[fid].gift.give;
  if (!canAfford(state.resources, g)) return fail(missingText(state.resources, g));
  return ok(g);
}

export function gift(state: GameState, fid: FactionId): GameState {
  const chk = canGift(state, fid);
  if (!chk.ok) return state;
  const def = FACTION_BY_ID[fid];
  let s = pay(state, chk.cost);
  s = setFaction(s, fid, (f) => ({ ...f, relation: Math.min(100, f.relation + def.gift.gain) }));
  return log(s, `${def.name}에 ${bundleText(chk.cost)}을(를) 보냈다. 관계 +${def.gift.gain}`, "build");
}

export function canClinic(state: GameState, survivorId: string): Check {
  const f = state.world.factions.clinic;
  const def = FACTION_BY_ID.clinic;
  if (!f?.contacted) return fail("병원 공동체를 아직 만나지 못했습니다.");
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  if (f.relation < 0) return fail("관계가 나빠 진료를 거절합니다.");
  const sv = state.survivors.find((x) => x.id === survivorId);
  if (!sv || !sv.conditions.length) return fail("치료할 부상·질병이 없습니다.");
  if (!canAfford(state.resources, def.clinic!)) return fail(missingText(state.resources, def.clinic!));
  return ok(def.clinic!);
}

export function clinic(state: GameState, survivorId: string): GameState {
  const chk = canClinic(state, survivorId);
  if (!chk.ok) return state;
  let s = pay(state, chk.cost);
  const sv = s.survivors.find((x) => x.id === survivorId)!;
  s = { ...s, survivors: s.survivors.map((x) => (x.id === survivorId ? { ...x, conditions: [] } : x)) };
  s = setFaction(s, "clinic", (f) => ({ ...f, relation: Math.min(100, f.relation + 2) }));
  return log(s, `병원 공동체 의료진이 ${sv.isPlayer ? "나" : sv.name}을(를) 치료해 주었다. (${bundleText(chk.cost)})`, "build");
}

// ───────────── 방어와 습격 ─────────────

export function defensePower(state: GameState): { total: number; people: number; guards: number; facilities: number } {
  const people = state.survivors.length * W.defensePerPerson;
  const guards = state.survivors
    .filter((s) => !s.isPlayer && s.job === "guard" && s.fatigue < 100)
    .reduce((n, s) => n + W.defensePerGuard * (0.6 + 0.2 * s.skills.manage) * lifeWorkMultiplier(s, "guard"), 0);
  const access = computeAccess(state);
  let facilities = 0;
  for (const room of state.rooms) {
    if (!access.roomAccess[room.id]) continue;
    for (const f of room.facilities) if (f.durability > 0) facilities += FACILITY_BY_ID[f.type].defense ?? 0;
  }
  const g = Math.round(guards);
  return { total: people + g + facilities, people, guards: g, facilities };
}

export function raidStrength(state: GameState): number {
  return Math.round(W.raidBase + W.raidPerDay * state.day);
}

export function raidPossible(state: GameState): boolean {
  return state.day >= W.raidStartDay && state.world.factions.raiders.relation < W.raidRelation;
}

/** 하루가 지날 때 약탈단 습격 */
export function processRaid(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!raidPossible(state)) return { state, events: [] };
  const [roll, seed0] = nextRandom(state.seed);
  let seed = seed0;
  let s = { ...state, seed };
  if (roll >= W.raidChance) return { state: s, events: [] };
  const known = s.world.factions.raiders.contacted;
  const name = known ? "철로 약탈단" : "정체를 알 수 없는 무리";
  const def = defensePower(s);
  const str = raidStrength(s);
  let text: string;
  let tone: "good" | "bad";
  if (def.total >= str) {
    s = setFaction(s, "raiders", (f) => ({ ...f, contacted: true, relation: Math.max(-100, f.relation - 5) }));
    s = { ...s, survivors: s.survivors.map((x) => (x.isPlayer ? x : { ...x, morale: Math.min(100, x.morale + 5) })) };
    s = { ...s, stats: { ...s.stats, raidsRepelled: s.stats.raidsRepelled + 1 } };
    text = `밤사이 ${name}이(가) 입구로 몰려왔지만 막아 냈다 (방어 ${def.total} ≥ 공격 ${str}). 모두 사기 +5.`;
    tone = "good";
  } else {
    let rate: number;
    [rate, seed] = nextRandom(seed);
    const loss = W.raidLoss[0] + rate * (W.raidLoss[1] - W.raidLoss[0]);
    const lost: ResourceBundle = {};
    const r = { ...s.resources };
    for (const k of ["food", "water", "materials", "parts", "fuel"] as ResourceId[]) {
      const n = Math.floor(r[k] * loss);
      if (n > 0) {
        lost[k] = n;
        r[k] -= n;
      }
    }
    s = { ...s, resources: r, seed };
    let i: number;
    [i, seed] = randomInt(seed, 0, s.survivors.length - 1);
    const victim = s.survivors[i];
    s = addCondition({ ...s, seed }, victim.id, "injury", 1).state;
    s = { ...s, survivors: s.survivors.map((x) => (x.isPlayer ? x : { ...x, morale: Math.max(0, x.morale - 8) })) };
    s = setFaction(s, "raiders", (f) => ({ ...f, contacted: true }));
    text = `밤사이 ${name}이(가) 습격했다 (방어 ${def.total} < 공격 ${str}). ${bundleText(lost) || "물자"}을(를) 빼앗겼고 ${victim.isPlayer ? "내가" : victim.name + "이(가)"} 다쳤다. 경비실을 짓고 '경비'를 세우거나, 선물로 관계를 풀자.`;
    tone = "bad";
  }
  s = log(s, `[습격] ${text}`, "event");
  return { state: s, events: [{ id: "raid", title: "약탈단 습격", text, tone }] };
}

// ───────────── 사기 회복 ─────────────

export function canEncourage(state: GameState): string | null {
  if (!state.survivors.some((x) => !x.isPlayer)) return "격려할 생존자가 없습니다.";
  return null;
}

export function doEncourage(state: GameState): { state: GameState; text: string } {
  const s = { ...state, survivors: state.survivors.map((x) => (x.isPlayer ? x : { ...x, morale: Math.min(100, x.morale + W.encourage) })) };
  return { state: s, text: `한 명 한 명과 이야기를 나눴다. 모두 사기 +${W.encourage}.` };
}

export function feastCost(state: GameState): ResourceBundle {
  const n = Math.max(1, state.survivors.filter((x) => !x.isPlayer).length);
  return { food: n, water: n };
}

export function canFeast(state: GameState): Check {
  if (!canModifyBase(state)) return fail("특별 배급은 정비 시간에 합니다.");
  if (!state.survivors.some((x) => !x.isPlayer)) return fail("함께할 생존자가 없습니다.");
  if (state.feastDay === state.day) return fail("오늘은 이미 특별 배급을 했습니다.");
  const cost = feastCost(state);
  if (!canAfford(state.resources, cost)) return fail(missingText(state.resources, cost));
  return ok(cost);
}

export function feast(state: GameState): GameState {
  const chk = canFeast(state);
  if (!chk.ok) return state;
  let s = pay(state, chk.cost);
  s = { ...s, feastDay: state.day, survivors: s.survivors.map((x) => (x.isPlayer ? x : { ...x, morale: Math.min(100, x.morale + W.feast) })) };
  return log(s, `아껴 둔 식량으로 특별 배급을 했다. 모두 사기 +${W.feast}. (${bundleText(chk.cost)})`, "build");
}
