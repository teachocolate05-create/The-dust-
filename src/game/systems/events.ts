// 사건 시스템 (기획서 9장): 구간이 끝날 때 일정 확률로 사건이 일어나 거점에 실제 영향을 준다.
// 위협(위험 제거 행동), 장소(주변 탐색 → 장소 조사), 게임 오버 판정도 여기서 다룬다.

import { EVENT_RULES as E, EVENTS, PLACE_RULES, PLACES, THREAT_RULES as T, type EventId } from "../config/events";
import { FACILITY_BY_ID } from "../config/facilities";
import { RULES } from "../config/rules";
import { SURVIVOR_RULES } from "../config/survivors";
import { nextRandom, pickWeighted, randomInt } from "../core/random";
import { bundleText } from "../core/resources";
import type { GameEvent, GameState, LogEntry, ResourceBundle, ResourceId } from "../core/types";
import { computeAccess } from "./access";
import { addCapped } from "./operation";
import { generateSurvivor } from "./survivors";

function log(state: GameState, text: string, kind: LogEntry["kind"] = "event"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

function randRate(seed: number, [a, b]: [number, number]): [number, number] {
  const [v, s] = nextRandom(seed);
  return [a + v * (b - a), s];
}

// ───────────── 사건 조건과 효과 ─────────────

function runningGenerators(state: GameState) {
  const access = computeAccess(state);
  return state.rooms.flatMap((r) =>
    access.roomAccess[r.id]
      ? r.facilities.filter((f) => FACILITY_BY_ID[f.type].power > 0 && f.enabled && f.durability > 0).map((f) => ({ room: r, f }))
      : [],
  );
}

function possible(state: GameState, id: EventId): boolean {
  switch (id) {
    case "genFailure":
      return runningGenerators(state).length > 0;
    case "waterContamination":
      return state.resources.water >= 5;
    case "spoilage":
      return state.resources.food >= 5;
    case "storageLoss":
      return state.resources.materials >= 10 || state.resources.parts >= 4;
    case "injury":
    case "badAir":
      return true;
    case "survivorFound":
      return !state.pending.some((p) => p.stage === "found");
    case "resourceCache":
      return true;
    case "threat":
      return !state.threat;
  }
}

function hurt(state: GameState, survivorId: string, amount: number): GameState {
  return { ...state, survivors: state.survivors.map((s) => (s.id === survivorId ? { ...s, health: Math.max(0, s.health - amount) } : s)) };
}

function apply(state: GameState, id: EventId): { state: GameState; text: string } {
  let s = state;
  let seed = s.seed;
  let text = "";
  const lose = (k: ResourceId, rate: number): number => {
    const n = Math.min(s.resources[k], Math.max(1, Math.floor(s.resources[k] * rate)));
    s = { ...s, resources: { ...s.resources, [k]: s.resources[k] - n } };
    return n;
  };
  switch (id) {
    case "genFailure": {
      const gens = runningGenerators(s);
      let i: number;
      [i, seed] = randomInt(seed, 0, gens.length - 1);
      const { room, f } = gens[i];
      s = {
        ...s,
        rooms: s.rooms.map((r) =>
          r.id !== room.id ? r : { ...r, facilities: r.facilities.map((x) => (x.id === f.id ? { ...x, durability: Math.max(0, x.durability - E.genFailureDamage) } : x)) },
        ),
      };
      text = `${FACILITY_BY_ID[f.type].name}에서 연기가 났다. 내구도 -${E.genFailureDamage}. 수리가 필요하다.`;
      break;
    }
    case "waterContamination": {
      let r: number;
      [r, seed] = randRate(seed, E.contaminationLoss);
      const n = lose("water", r);
      s = {
        ...s,
        rooms: s.rooms.map((room) => ({
          ...room,
          facilities: room.facilities.map((f) => (f.type === "filter" ? { ...f, durability: Math.max(0, f.durability - E.filterDamage) } : f)),
        })),
      };
      text = `저장한 물에서 이상한 냄새가 난다. 식수 ${n}을(를) 버렸다.${s.rooms.some((r) => r.facilities.some((f) => f.type === "filter")) ? ` 정수 필터 내구도 -${E.filterDamage}.` : ""}`;
      break;
    }
    case "spoilage": {
      let r: number;
      [r, seed] = randRate(seed, E.spoilageLoss);
      const box = s.rooms.some((room) => room.facilities.some((f) => f.type === "foodbox"));
      const n = lose("food", box ? r / 2 : r);
      text = `습기 때문에 식량 ${n}이(가) 상했다.${box ? " 식량 보관함 덕분에 피해가 절반으로 줄었다." : " 식량 보관함이 있으면 피해가 줄어든다."}`;
      break;
    }
    case "storageLoss": {
      let r: number;
      [r, seed] = randRate(seed, E.storageLoss);
      const m = lose("materials", r);
      const p = lose("parts", r);
      text = `배수관이 터져 창고가 물에 잠겼다. 자재 ${m}, 부품 ${p}을(를) 잃었다.`;
      break;
    }
    case "injury": {
      const workers = s.survivors.filter((x) => !x.isPlayer && x.job !== "rest");
      const pool = workers.length ? workers : s.survivors;
      let i: number;
      [i, seed] = randomInt(seed, 0, pool.length - 1);
      const who = pool[i];
      s = hurt(s, who.id, E.injuryDamage);
      text = `${who.name}이(가) 작업 중 무너진 철판에 다쳤다. 건강 -${E.injuryDamage}.`;
      break;
    }
    case "badAir": {
      s = { ...s, survivors: s.survivors.map((x) => ({ ...x, fatigue: Math.min(100, x.fatigue + E.badAirFatigue) })) };
      text = `환기 통로가 막혀 공기가 탁하다. 모두 피로 +${E.badAirFatigue}.`;
      break;
    }
    case "survivorFound": {
      const used = [...s.survivors, ...s.pending.map((p) => p.survivor)].map((x) => x.name);
      let sv;
      [sv, seed] = generateSurvivor(seed, `sv${s.nextId}`, used);
      s = {
        ...s,
        nextId: s.nextId + 1,
        pending: [...s.pending, { survivor: sv, stage: "found", leavesAfterDay: s.day + SURVIVOR_RULES.foundExpireDays }],
      };
      text = `입구 근처에서 ${sv.name}(${sv.age}세)의 구조 신호를 들었다. ${SURVIVOR_RULES.foundExpireDays}일 안에 '생존자 구조'를 하자.`;
      break;
    }
    case "resourceCache": {
      const gained: ResourceBundle = {};
      let v: number;
      [v, seed] = randomInt(seed, ...E.cache.materials);
      gained.materials = v;
      [v, seed] = randomInt(seed, ...E.cache.parts);
      gained.parts = v;
      const capped = addCapped(s, gained);
      s = { ...s, resources: capped.resources };
      text = `무너진 벽 틈에서 예전 보급 상자를 찾았다. ${bundleText(gained)}.${Object.keys(capped.lost).length ? ` (저장 공간 부족으로 ${bundleText(capped.lost)} 버림)` : ""}`;
      break;
    }
    case "threat": {
      let i: number;
      [i, seed] = randomInt(seed, 0, T.names.length - 1);
      s = { ...s, threat: { name: T.names[i], sinceDay: s.day } };
      text = `거점 주변에 ${T.names[i]}이(가) 나타났다. 밖에서 일하면 다칠 수 있고 얻는 양이 줄어든다. '위험 제거' 행동으로 없애자.`;
      break;
    }
  }
  return { state: { ...s, seed }, text };
}

/** 구간 종료 시 사건 판정 */
export function rollEvents(state: GameState): GameState {
  const serial = state.events.serial + 1;
  if (state.day < E.startDay) return { ...state, events: { serial, list: [] } };
  let seed = state.seed;
  let roll: number;
  [roll, seed] = nextRandom(seed);
  let s: GameState = { ...state, seed };
  if (roll >= E.chancePerPeriod) return { ...s, events: { serial, list: [] } };
  const candidates = EVENTS.filter((e) => possible(s, e.id));
  if (!candidates.length) return { ...s, events: { serial, list: [] } };
  let def: (typeof EVENTS)[number];
  [def, seed] = pickWeighted(seed, candidates);
  s = { ...s, seed };
  const r = apply(s, def.id);
  s = r.state;
  const ev: GameEvent = { id: def.id, title: def.title, text: r.text, tone: def.tone };
  s = log(s, `[사건: ${def.title}] ${r.text}`);
  return { ...s, events: { serial, list: [ev] } };
}

// ───────────── 위협 ─────────────

/** 위협이 있을 때 외부 활동 부상 판정. 피해를 입으면 사람 이름과 함께 문장을 돌려준다. */
export function threatInjury(state: GameState, survivorId: string, chance: number, damage: number): { state: GameState; text: string } {
  if (!state.threat) return { state, text: "" };
  const [roll, seed] = nextRandom(state.seed);
  let s = { ...state, seed };
  if (roll >= chance) return { state: s, text: "" };
  s = hurt(s, survivorId, damage);
  const who = s.survivors.find((x) => x.id === survivorId)!;
  return { state: s, text: ` ${state.threat.name}에게 습격당해 ${who.isPlayer ? "" : who.name + "이(가) "}다쳤다 (건강 -${damage}).` };
}

export function clearThreatChance(state: GameState): number {
  return state.phase === "night" ? T.clearChanceNight : T.clearChance;
}

export function doClearThreat(state: GameState): { state: GameState; text: string } {
  if (!state.threat) return { state, text: "" };
  const [roll, seed] = nextRandom(state.seed);
  const s = { ...state, seed };
  if (roll < clearThreatChance(state)) return { state: { ...s, threat: null }, text: `${state.threat.name}을(를) 몰아냈다. 이제 밖이 조금 안전하다.` };
  const hurtState = hurt(s, "player", T.clearFailDamage);
  return { state: hurtState, text: `${state.threat.name}을(를) 쫓아내지 못하고 물러났다. 건강 -${T.clearFailDamage}.` };
}

// ───────────── 장소 ─────────────

/** 주변 탐색 중 새 장소 발견 */
export function maybeDiscoverPlace(state: GameState): { state: GameState; text: string } {
  const unsurveyed = state.places.filter((p) => !p.surveyed).length;
  const known = new Set(state.places.map((p) => p.type));
  const left = PLACES.filter((p) => !known.has(p.type));
  if (unsurveyed >= PLACE_RULES.maxUnsurveyed || !left.length) return { state, text: "" };
  const [roll, seed0] = nextRandom(state.seed);
  let seed = seed0;
  if (roll >= PLACE_RULES.discoverChance) return { state: { ...state, seed }, text: "" };
  let i: number;
  [i, seed] = randomInt(seed, 0, left.length - 1);
  const def = left[i];
  const place = { id: `pl${state.nextId}`, type: def.type, name: def.name, surveyed: false, foundDay: state.day };
  return {
    state: { ...state, seed, nextId: state.nextId + 1, places: [...state.places, place] },
    text: ` 멀리 ${def.name}을(를) 봐 두었다. '장소 조사'로 뒤져 볼 수 있다.`,
  };
}

export function nextSurveyTarget(state: GameState) {
  return state.places.find((p) => !p.surveyed);
}

export function doSurvey(state: GameState, rate: number): { state: GameState; gained: ResourceBundle; text: string } {
  const place = nextSurveyTarget(state);
  if (!place) return { state, gained: {}, text: "" };
  const def = PLACES.find((p) => p.type === place.type)!;
  let seed = state.seed;
  const gained: ResourceBundle = {};
  for (const [k, [a, b]] of Object.entries(def.loot) as [ResourceId, [number, number]][]) {
    let v: number;
    [v, seed] = randomInt(seed, a, b);
    v = Math.floor(v * rate);
    if (v > 0) gained[k] = v;
  }
  return {
    state: { ...state, seed, places: state.places.map((p) => (p.id === place.id ? { ...p, surveyed: true } : p)) },
    gained,
    text: `${place.name}을(를) 샅샅이 뒤졌다. ${def.desc}`,
  };
}

// ───────────── 게임 오버 ─────────────

export function checkGameOver(state: GameState): GameState {
  if (state.gameOver) return state;
  const player = state.survivors.find((s) => s.isPlayer);
  if (player && player.health <= 0) {
    const s = log(state, "쓰러졌다. 거점의 불이 하나둘 꺼진다.", "warn");
    return { ...s, gameOver: { day: state.day, phase: state.phase, reason: "플레이어의 건강이 0이 되어 쓰러졌다." } };
  }
  return state;
}
