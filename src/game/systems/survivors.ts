// 생존자 시스템 (기획서 5장): 영입, 업무 배정, 업무 결과, 피로도·건강.
// 업무 결과는 구간이 끝날 때(time.endPhase) 계산되고, 밤잠은 다음 날 시작(time.startNextDay)에 처리된다.

import { FACILITY_BY_ID } from "../config/facilities";
import { RULES } from "../config/rules";
import { BACKGROUNDS, JOB_BY_ID, NAMES, SKILLS, SURVIVOR_RULES as R, type JobId } from "../config/survivors";
import { RESOURCE_BY_ID } from "../config/resources";
import { nextRandom, randomInt } from "../core/random";
import { bundleText, canAfford } from "../core/resources";
import type { Check, GameState, LogEntry, PendingSurvivor, Point, ResourceBundle, ResourceId, Survivor } from "../core/types";
import { computeAccess } from "./access";
import { addCapped, hasWorking } from "./operation";
import { canModifyBase } from "./phase";
import { doHeal, healChance, lifeBlockReason, lifeWorkMultiplier, rollTraits, workFatigueExtra } from "./life";
import { threatInjury } from "./events";
import { THREAT_RULES } from "../config/events";

export const PLAYER_ID = "player";

export function createPlayer(): Survivor {
  return {
    id: PLAYER_ID,
    name: "나",
    age: 34,
    isPlayer: true,
    health: 100,
    fatigue: 10,
    skills: { tech: 2, medic: 1, gather: 2, farm: 1, manage: 2 },
    job: "rest",
    background: "이 역을 거점으로 삼기로 한 사람. 행동은 직접 한다.",
    traits: [],
    conditions: [],
    morale: 100,
  };
}

export function population(state: GameState): number {
  return state.survivors.length;
}

/** 출입 가능한 거주실의 침상 수 */
export function bedCount(state: GameState): number {
  const access = computeAccess(state);
  let n = 0;
  for (const room of state.rooms) {
    if (room.type !== "residence" || !access.roomAccess[room.id]) continue;
    for (const f of room.facilities) n += FACILITY_BY_ID[f.type].beds;
  }
  return n;
}

export function skillFactor(s: Survivor, job: JobId): number {
  const skill = JOB_BY_ID[job].skill;
  const level = skill ? s.skills[skill] : 1;
  let f = R.skillBase + R.skillStep * level;
  if (s.fatigue >= R.tiredAt) f *= 0.5;
  // 업데이트 2: 특성·부상·질병·사기
  return f * lifeWorkMultiplier(s, job);
}

export type SurvivorStatus = "player" | "working" | "resting" | "exhausted" | "critical";

export function survivorStatus(s: Survivor): SurvivorStatus {
  if (s.health < R.criticalHealth) return "critical";
  if (s.fatigue >= 100) return "exhausted";
  if (s.isPlayer) return "player";
  return s.job === "rest" ? "resting" : "working";
}

export const STATUS_TEXT: Record<SurvivorStatus, string> = {
  player: "직접 행동",
  working: "작업 중",
  resting: "휴식",
  exhausted: "탈진",
  critical: "위독",
};

// ───────────── 새 생존자 만들기 ─────────────

export function generateSurvivor(seed: number, id: string, usedNames: string[]): [Survivor, number] {
  let s = seed;
  let v: number;
  const free = NAMES.filter((n) => !usedNames.includes(n));
  [v, s] = randomInt(s, 0, Math.max(0, free.length - 1));
  const name = free[v] ?? `생존자 ${id}`;
  let age: number;
  [age, s] = randomInt(s, 19, 61);
  let bi: number;
  [bi, s] = randomInt(s, 0, BACKGROUNDS.length - 1);
  const bg = BACKGROUNDS[bi];
  const skills = { tech: 1, medic: 1, gather: 1, farm: 1, manage: 1 } as Survivor["skills"];
  for (const sk of SKILLS) {
    [v, s] = randomInt(s, 1, 3);
    skills[sk.id] = v;
  }
  [v, s] = randomInt(s, 4, 5);
  skills[bg.skill] = v;
  let health: number;
  [health, s] = randomInt(s, 45, 80);
  let fatigue: number;
  [fatigue, s] = randomInt(s, 30, 60);
  let traits: Survivor["traits"];
  [traits, s] = rollTraits(s);
  let morale: number;
  [morale, s] = randomInt(s, 45, 65);
  return [{ id, name, age, isPlayer: false, health, fatigue, skills, job: "rest", background: bg.text, traits, conditions: [], morale }, s];
}

// ───────────── 수용 / 업무 배정 ─────────────

export function canAccept(state: GameState, index: number): Check {
  const p = state.pending[index];
  if (!p) return { ok: false, reason: "대상을 찾을 수 없습니다." };
  if (p.stage !== "arrived") return { ok: false, reason: "아직 구조하지 않았습니다. 낮에 '생존자 구조' 행동을 하세요." };
  if (!canModifyBase(state)) return { ok: false, reason: "수용 여부는 정비 시간에 정합니다." };
  if (bedCount(state) <= population(state))
    return { ok: false, reason: `침상이 부족합니다 (침상 ${bedCount(state)} / 인원 ${population(state)}). 거주실에 침상을 더 놓으세요.` };
  return { ok: true, cost: {}, refund: {} };
}

function log(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

export function acceptSurvivor(state: GameState, index: number): GameState {
  if (!canAccept(state, index).ok) return state;
  const p = state.pending[index];
  const s = { ...state, survivors: [...state.survivors, p.survivor], pending: state.pending.filter((_, i) => i !== index) };
  return log(s, `${p.survivor.name}(${p.survivor.age}세)을(를) 거점에 받아들였다.`, "build");
}

export function dismissSurvivor(state: GameState, index: number): GameState {
  const p = state.pending[index];
  if (!p) return state;
  const s = { ...state, pending: state.pending.filter((_, i) => i !== index) };
  return log(s, `${p.survivor.name}을(를) 돌려보냈다.`);
}

export function canSetJob(state: GameState, survivorId: string, job: JobId): Check {
  const sv = state.survivors.find((x) => x.id === survivorId);
  if (!sv) return { ok: false, reason: "생존자를 찾을 수 없습니다." };
  if (sv.isPlayer) return { ok: false, reason: "플레이어는 '행동'으로 직접 일합니다." };
  if (!JOB_BY_ID[job]) return { ok: false, reason: "알 수 없는 업무입니다." };
  return { ok: true, cost: {}, refund: {} };
}

export function setJob(state: GameState, survivorId: string, job: JobId): GameState {
  if (!canSetJob(state, survivorId, job).ok) return state;
  const sv = state.survivors.find((x) => x.id === survivorId)!;
  if (sv.job === job) return state;
  const s = { ...state, survivors: state.survivors.map((x) => (x.id === survivorId ? { ...x, job } : x)) };
  return log(s, `${sv.name} 업무 변경: ${JOB_BY_ID[sv.job].name} → ${JOB_BY_ID[job].name}`);
}

/** 잔해 정리 지정/해제 (언제든 가능, 비용 없음) */
export function setDebrisMarks(state: GameState, points: Point[], on: boolean): GameState {
  const set = new Set(state.debrisMarks);
  let changed = 0;
  for (const p of points) {
    const k = `${p.x},${p.y}`;
    if (on && state.map[p.y]?.[p.x] === "debris" && !set.has(k)) {
      set.add(k);
      changed++;
    }
    if (!on && set.delete(k)) changed++;
  }
  if (!changed) return state;
  return { ...state, debrisMarks: [...set].sort() };
}

// ───────────── 구간 작업 ─────────────

export interface WorkPlan {
  survivorId: string;
  name: string;
  job: JobId;
  /** 사람이 읽는 예상 결과 */
  expect: string;
  /** 일할 수 없는 이유 */
  blocked?: string;
}

function rate(state: GameState, s: Survivor, job: JobId): number {
  let f = skillFactor(s, job);
  if (state.phase === "night" && JOB_BY_ID[job].outside) f *= R.nightOutsideRate;
  return f;
}

/** 통로와 맞닿은 지정 잔해 */
export function reachableMarks(state: GameState): Point[] {
  const access = computeAccess(state);
  const marks = new Set(state.debrisMarks);
  const out: Point[] = [];
  for (const k of marks) {
    const [x, y] = k.split(",").map(Number);
    if (state.map[y]?.[x] !== "debris") continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => access.corridor.has(`${x + dx},${y + dy}`))) out.push({ x, y });
  }
  return out;
}

export function planWork(state: GameState): WorkPlan[] {
  return state.survivors
    .filter((s) => !s.isPlayer)
    .map((s) => {
      const job = JOB_BY_ID[s.job];
      const plan: WorkPlan = { survivorId: s.id, name: s.name, job: s.job, expect: "" };
      if (s.fatigue >= 100) {
        plan.blocked = "탈진해서 일할 수 없습니다 (강제 휴식)";
        return plan;
      }
      const lifeBlock = lifeBlockReason(s, s.job);
      if (lifeBlock) {
        plan.blocked = lifeBlock;
        return plan;
      }
      const f = rate(state, s, s.job);
      if (s.job === "rest") plan.expect = `피로 -${R.restRecovery}`;
      else if (job.yields)
        plan.expect = Object.entries(job.yields)
          .map(([k, [a, b]]) => `${RESOURCE_BY_ID[k as ResourceId].name} ${Math.floor(a * f)}~${Math.floor(b * f)}`)
          .join(", ");
      else if (s.job === "debris") {
        const n = s.skills.gather >= 4 ? 2 : 1;
        plan.expect = `지정 잔해 ${n}칸`;
        if (state.debrisMarks.length === 0) plan.blocked = "정리할 잔해가 지정되지 않았습니다 (행동 탭 → 잔해 정리 → 정리 지정)";
        else if (reachableMarks(state).length === 0) plan.blocked = "지정한 잔해 중 통로와 맞닿은 칸이 없습니다";
      } else if (s.job === "heal") {
        const anyone = state.survivors.some((x) => x.conditions.length);
        plan.expect = `치료 성공 확률 ${Math.round(healChance(state, s) * 100)}%`;
        if (!anyone) plan.expect += " (지금은 환자 없음)";
      } else if (s.job === "maintain") plan.expect = `기계 내구도 +${Math.round(R.maintainBase + R.maintainPerSkill * s.skills.tech * (s.fatigue >= R.tiredAt ? 0.5 : 1))}`;
      else if (s.job === "craft") {
        plan.expect = `${bundleText(R.craftInput)} → ${bundleText(R.craftOutput)}`;
        if (!hasWorking(state, "workbench")) plan.blocked = "전력이 들어오는 작업대가 없습니다";
        else if (!canAfford(state.resources, R.craftInput)) plan.blocked = "자재가 부족합니다";
      }
      if (s.fatigue >= R.tiredAt && s.job !== "rest") plan.expect += " (피로로 효율 절반)";
      return plan;
    });
}

/** 구간 종료 시 생존자 작업 처리 (자원·잔해·내구도) */
export function processWork(state: GameState): GameState {
  let s = state;
  let seed = s.seed;
  for (const sv of state.survivors) {
    if (sv.isPlayer || sv.job === "rest" || sv.fatigue >= 100) continue;
    if (lifeBlockReason(sv, sv.job)) {
      s = log(s, `${sv.name} — ${lifeBlockReason(sv, sv.job)}`, "warn");
      continue;
    }
    const job = JOB_BY_ID[sv.job];
    const f = rate(s, sv, sv.job);
    let gained: ResourceBundle = {};
    let text = "";
    if (job.yields) {
      const threatRate = s.threat && job.outside ? THREAT_RULES.outsideYieldRate : 1;
      for (const [k, [a, b]] of Object.entries(job.yields) as [ResourceId, [number, number]][]) {
        let v: number;
        [v, seed] = randomInt(seed, a, b);
        v = Math.floor(v * f * threatRate);
        if (v > 0) gained[k] = v;
      }
      text = Object.keys(gained).length ? `${job.name}: ${bundleText(gained)}` : `${job.name}: 허탕`;
      if (job.outside && s.threat) {
        const inj = threatInjury({ ...s, seed }, sv.id, THREAT_RULES.workInjuryChance, THREAT_RULES.workInjuryDamage);
        s = inj.state;
        seed = s.seed;
        text += inj.text;
      }
    } else if (sv.job === "debris") {
      const n = sv.skills.gather >= 4 ? 2 : 1;
      let cleared = 0;
      for (let i = 0; i < n; i++) {
        const t = reachableMarks(s)[0];
        if (!t) break;
        const map = s.map.map((row) => [...row]);
        map[t.y][t.x] = "floor";
        s = { ...s, map, debrisMarks: s.debrisMarks.filter((k) => k !== `${t.x},${t.y}`) };
        cleared++;
      }
      if (cleared) {
        gained = { materials: cleared };
        text = `잔해 ${cleared}칸 정리`;
      } else text = "정리할 수 있는 지정 잔해가 없었다";
    } else if (sv.job === "maintain") {
      const amount = Math.round(R.maintainBase + R.maintainPerSkill * sv.skills.tech * (sv.fatigue >= R.tiredAt ? 0.5 : 1));
      const access = computeAccess(s);
      let target: { roomId: string; id: string; ratio: number; name: string } | null = null;
      for (const room of s.rooms) {
        if (!access.roomAccess[room.id]) continue;
        for (const fac of room.facilities) {
          const def = FACILITY_BY_ID[fac.type];
          if (!def.operates) continue;
          const ratio = fac.durability / def.maxDurability;
          if (ratio < 1 && (!target || ratio < target.ratio)) target = { roomId: room.id, id: fac.id, ratio, name: def.name };
        }
      }
      if (target) {
        const tg = target;
        s = {
          ...s,
          rooms: s.rooms.map((r) =>
            r.id !== tg.roomId
              ? r
              : { ...r, facilities: r.facilities.map((fac) => (fac.id === tg.id ? { ...fac, durability: Math.min(FACILITY_BY_ID[fac.type].maxDurability, fac.durability + amount) } : fac)) },
          ),
        };
        text = `${tg.name} 내구도 +${amount}`;
      } else text = "손볼 기계가 없었다";
    } else if (sv.job === "heal") {
      const r = doHeal({ ...s, seed }, sv);
      s = r.state;
      seed = s.seed;
      text = r.text;
    } else if (sv.job === "craft") {
      if (hasWorking(s, "workbench") && canAfford(s.resources, R.craftInput)) {
        const r = { ...s.resources };
        for (const [k, v] of Object.entries(R.craftInput) as [ResourceId, number][]) r[k] -= v;
        s = { ...s, resources: r };
        gained = { ...R.craftOutput };
        text = `제작: ${bundleText(R.craftOutput)}`;
      } else text = "제작할 수 없었다 (작업대·자재 확인)";
    }
    if (Object.keys(gained).length) {
      const capped = addCapped(s, gained);
      s = { ...s, resources: capped.resources };
      if (Object.keys(capped.lost).length) text += ` (저장 공간 부족으로 ${bundleText(capped.lost)} 버림)`;
    }
    s = log(s, `${sv.name} — ${text}`, "build");
  }
  return { ...s, seed };
}

/** 구간 종료 시 피로·건강 변화. shortage: 배급하지 못한 자원 */
export function processNeeds(state: GameState, shortage: ResourceBundle): GameState {
  const starving = Object.keys(shortage).length;
  // 공동 생활실 식탁 등: 쉬는 생존자 추가 회복 (가장 큰 효과 하나만)
  const access = computeAccess(state);
  let restBonus = 0;
  for (const room of state.rooms)
    if (access.roomAccess[room.id]) for (const f of room.facilities) restBonus = Math.max(restBonus, FACILITY_BY_ID[f.type].restBonus);
  const out: Survivor[] = [];
  let s = state;
  for (const sv of state.survivors) {
    let { health, fatigue } = sv;
    const resting = !sv.isPlayer && (sv.job === "rest" || sv.fatigue >= 100);
    if (!sv.isPlayer) fatigue = resting ? fatigue - R.restRecovery - restBonus : fatigue + R.workFatigue + workFatigueExtra(sv);
    if (sv.fatigue >= 100) health -= R.exhaustedHealthLoss;
    if (starving) health -= R.starvationHealthLoss * starving;
    else if (resting) health += R.restHealthGain;
    health = Math.max(0, Math.min(100, health));
    fatigue = Math.max(0, Math.min(100, fatigue));
    if (health <= 0 && !sv.isPlayer) {
      s = log(s, `${sv.name}이(가) 버티지 못하고 거점을 떠났다.`, "warn");
      continue;
    }
    if (health < R.criticalHealth && sv.health >= R.criticalHealth) s = log(s, `${sv.name}의 상태가 위독하다!`, "warn");
    if (fatigue >= 100 && sv.fatigue < 100) s = log(s, `${sv.name}이(가) 탈진했다.`, "warn");
    out.push({ ...sv, health, fatigue });
  }
  return { ...s, survivors: out };
}

/** 밤잠: 침상 수만큼 침상에서 자고, 나머지는 바닥에서 잔다 */
export function processSleep(state: GameState): GameState {
  const beds = bedCount(state);
  const survivors = state.survivors.map((sv, i) => ({
    ...sv,
    fatigue: Math.max(0, sv.fatigue - (i < beds ? R.sleepRecoveryBed : R.sleepRecoveryNoBed)),
  }));
  let s = { ...state, survivors };
  if (beds < state.survivors.length) s = log(s, `침상이 부족해 ${state.survivors.length - beds}명이 바닥에서 잤다.`, "warn");
  return s;
}

/** 다음 날: 기한이 지난 대기 생존자는 떠난다 */
export function expirePending(state: GameState): GameState {
  let s = state;
  const keep: PendingSurvivor[] = [];
  for (const p of state.pending) {
    if (state.day > p.leavesAfterDay) {
      s = log(s, p.stage === "arrived" ? `${p.survivor.name}은(는) 답을 듣지 못하고 떠났다.` : `발견했던 ${p.survivor.name}의 흔적이 사라졌다.`, "warn");
    } else keep.push(p);
  }
  return { ...s, pending: keep };
}

// ───────────── 수색·구조 행동 ─────────────

export function searchBlockReason(state: GameState): string | null {
  if (state.pending.some((p) => p.stage === "found")) return "이미 발견한 생존자가 있습니다. 먼저 '생존자 구조'를 하세요.";
  return null;
}

export function doSearch(state: GameState): { state: GameState; text: string } {
  let seed = state.seed;
  let roll: number;
  [roll, seed] = nextRandom(seed);
  const chance = state.phase === "night" ? R.searchChanceNight : R.searchChance;
  if (roll >= chance) return { state: { ...state, seed }, text: "인기척을 찾지 못했다." };
  const used = [...state.survivors, ...state.pending.map((p) => p.survivor)].map((x) => x.name);
  let sv: Survivor;
  [sv, seed] = generateSurvivor(seed, `sv${state.nextId}`, used);
  const pending: PendingSurvivor = { survivor: sv, stage: "found", leavesAfterDay: state.day + R.foundExpireDays };
  return {
    state: { ...state, seed, nextId: state.nextId + 1, pending: [...state.pending, pending] },
    text: `무너진 상가에서 ${sv.name}(${sv.age}세)을(를) 발견했다. ${R.foundExpireDays}일 안에 구조해야 한다.`,
  };
}

export function rescueBlockReason(state: GameState): string | null {
  if (!state.pending.some((p) => p.stage === "found")) return "구조할 생존자가 없습니다. 먼저 '생존자 수색'을 하세요.";
  return null;
}

export function doRescue(state: GameState): { state: GameState; text: string } {
  const i = state.pending.findIndex((p) => p.stage === "found");
  const p = state.pending[i];
  const pending = state.pending.map((x, j) => (j === i ? { ...x, stage: "arrived" as const, leavesAfterDay: state.day } : x));
  return { state: { ...state, pending }, text: `${p.survivor.name}을(를) 입구까지 데려왔다. 오늘 정비 시간에 수용 여부를 정해야 한다.` };
}
