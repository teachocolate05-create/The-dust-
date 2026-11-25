// 시간 진행 시스템: 구간 종료 계산, 정비 시간 진입, 다음 날 시작.
// forecastPhaseEnd()는 진행 전 예상치를 보여 주고, endPhase()도 같은 계산(simulatePeriod)을 사용한다.

import { FACILITY_BY_ID } from "../config/facilities";
import { RESOURCE_BY_ID, RESOURCES } from "../config/resources";
import { RULES } from "../config/rules";
import { nextRandom } from "../core/random";
import { bundleText } from "../core/resources";
import type { GameState, LogEntry, ResourceBundle, ResourceId } from "../core/types";
import { atRisk, capacity, simulatePeriod, type PeriodSim } from "./operation";
import { isDayPhase, nextPhase, PHASE_NAMES } from "./phase";
import { rollEvents } from "./events";
import { processLifeDay, processLifePeriod } from "./life";
import { processExpeditions, processRaid } from "./world";
import { bedCount, expirePending, planWork, population, processNeeds, processSleep, processWork, type WorkPlan } from "./survivors";
import { SURVIVOR_RULES } from "../config/survivors";

export { population };

/** 인원의 식량·식수 소비. 조리대가 가동 중이면 식량 25% 절약 (올림) */
export function upkeep(state: GameState, sim?: PeriodSim): ResourceBundle {
  const people = population(state);
  const kitchen = (sim ?? simulatePeriod(state)).reports.some((r) => r.status === "running" && FACILITY_BY_ID[r.type].kitchen);
  const out: ResourceBundle = {};
  for (const [k, v] of Object.entries(RULES.upkeepPerPerson) as [ResourceId, number][])
    out[k] = k === "food" && kitchen ? Math.ceil(v * people * 0.75) : v * people;
  return out;
}

export interface PhaseForecast {
  sim: PeriodSim;
  /** 시설 생산 */
  production: ResourceBundle;
  /** 시설 소비 + 인원 소비 */
  consumption: ResourceBundle;
  upkeep: ResourceBundle;
  /** 순변화 */
  delta: ResourceBundle;
  /** 변화 후 예상 보유량 (0 ~ 최대 저장량) */
  after: Record<ResourceId, number>;
  /** 모자라서 배급하지 못하는 양 */
  shortage: ResourceBundle;
  /** 저장 공간이 넘쳐 버려지는 양 */
  overflow: ResourceBundle;
  warnings: string[];
  /** 생존자별 작업 예상 */
  work: WorkPlan[];
  next: { day: number; phase: GameState["phase"] };
}

export function forecastPhaseEnd(state: GameState): PhaseForecast {
  const warnings: string[] = [];
  const sim = simulatePeriod(state);
  const up = isDayPhase(state.phase) ? upkeep(state, sim) : {};
  const production = isDayPhase(state.phase) ? sim.production : {};
  const facilityUse = isDayPhase(state.phase) ? sim.facilityUse : {};
  const cap = capacity(state);

  const consumption: ResourceBundle = {};
  const delta: ResourceBundle = {};
  const after = { ...state.resources };
  const shortage: ResourceBundle = {};
  const overflow: ResourceBundle = {};

  for (const r of RESOURCES) {
    if (r.kind !== "stock") continue;
    const k = r.id;
    const use = (facilityUse[k] ?? 0) + (up[k] ?? 0);
    const prod = production[k] ?? 0;
    if (use) consumption[k] = use;
    const d = prod - use;
    if (d) delta[k] = d;
    const raw = state.resources[k] + d;
    if (raw < 0) shortage[k] = -raw;
    if (raw > cap[k]) overflow[k] = raw - Math.max(cap[k], state.resources[k]);
    after[k] = Math.max(0, Math.min(raw, Math.max(cap[k], state.resources[k])));
  }

  if (isDayPhase(state.phase)) {
    for (const k of Object.keys(shortage) as ResourceId[])
      warnings.push(`${RESOURCE_BY_ID[k].name}이(가) ${shortage[k]} 부족합니다. 배급을 받지 못합니다.`);
    for (const k of Object.keys(up) as ResourceId[]) {
      if (shortage[k]) continue;
      const net = -(delta[k] ?? 0);
      if (net > 0 && after[k] < net * RULES.lowStockPeriods)
        warnings.push(`${RESOURCE_BY_ID[k].name}이(가) 얼마 남지 않았습니다. 이대로면 약 ${Math.floor(after[k] / net)}구간 버팁니다.`);
    }
    for (const k of Object.keys(overflow) as ResourceId[])
      warnings.push(`저장 공간이 부족해 ${RESOURCE_BY_ID[k].name} ${overflow[k]}을(를) 버리게 됩니다. 창고 시설을 늘리세요.`);
    for (const r of sim.reports) {
      const name = FACILITY_BY_ID[r.type].name;
      if (r.status === "noFuel") warnings.push(`${name}: 연료가 없어 멈춥니다.`);
      if (r.status === "noPower") warnings.push(`${name}: 연결된 전력망의 전력이 부족해 멈춥니다.`);
      if (r.status === "noPowerLine") warnings.push(`${name}: 전력선이 연결되지 않아 멈춥니다.`);
      if (r.status === "noWaterLine") warnings.push(`${name}: 급수원과 이어진 수도관이 없어 멈춥니다.`);
      if (r.status === "noRawWater") warnings.push(`${name}: 급수원 공급량이 부족해 멈춥니다.`);
      if (r.status === "running" && FACILITY_BY_ID[r.type].power > 0) {
        const net = sim.powerNets.find((n) => n.id === r.powerNet);
        if (!net) warnings.push(`${name}: 전력선에 연결되지 않아 연료만 태웁니다. 연결하거나 정지하세요.`);
        else if (net.demand === 0) warnings.push(`${name}: 전력망에 전력을 쓰는 시설이 없어 연료만 태웁니다.`);
      }
      if (r.status === "broken") warnings.push(`${name}: 고장 상태입니다. 수리가 필요합니다.`);
      if (r.status === "running") {
        const f = state.rooms.flatMap((x) => x.facilities).find((x) => x.id === r.facilityId)!;
        const nextF = { ...f, durability: Math.max(0, f.durability - r.decay) };
        if (nextF.durability === 0) warnings.push(`${name}: 이번 구간이 끝나면 내구도가 바닥나 고장 납니다.`);
        else if (atRisk(nextF)) warnings.push(`${name}: 내구도가 낮아 고장 날 수 있습니다. (${nextF.durability})`);
      }
    }
    for (const w of planWork(state)) if (w.blocked && w.job !== "rest") warnings.push(`${w.name}: ${w.blocked}`);
    for (const sv of state.survivors) {
      if (sv.health < SURVIVOR_RULES.criticalHealth) warnings.push(`${sv.name}: 건강이 위독합니다 (${sv.health}). ${sv.isPlayer ? "0이 되면 게임 오버입니다!" : "쉬게 하고 식량·식수를 확보하세요."}`);
      else if (sv.fatigue >= SURVIVOR_RULES.tiredAt && !(sv.job === "rest" && !sv.isPlayer))
        warnings.push(`${sv.name}: 피로가 높습니다 (${sv.fatigue}). ${sv.isPlayer ? "행동을 줄이세요." : "휴식을 배정하세요."}`);
    }
    if (state.threat) warnings.push(`위협(${state.threat.name}): 밖에서 일하는 생존자가 다칠 수 있습니다.`);
    if (state.actionsLeft > 0) warnings.push(`사용하지 않은 행동 ${state.actionsLeft}회는 사라집니다.`);
    if (state.phase === "night") warnings.push("야간이 끝나면 정비 시간이 시작됩니다.");
  }

  const np = nextPhase(state.phase);
  return {
    sim,
    production,
    consumption,
    upkeep: up,
    delta,
    after,
    shortage,
    overflow,
    warnings,
    work: isDayPhase(state.phase) ? planWork(state) : [],
    next: { day: np === "morning" ? state.day + 1 : state.day, phase: np },
  };
}

function addLog(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

/** 오전·오후·야간 구간을 끝낸다. (정비 시간에는 startNextDay 사용) */
export function endPhase(state: GameState): GameState {
  if (!isDayPhase(state.phase)) return state;
  const f = forecastPhaseEnd(state);

  // 1) 자원
  let s: GameState = { ...state, resources: { ...state.resources, ...f.after } };
  const parts: string[] = [];
  if (Object.keys(f.production).length) parts.push(`생산 ${bundleText(f.production)}`);
  if (Object.keys(f.consumption).length) parts.push(`소비 ${bundleText(f.consumption)}`);
  s = addLog(s, `${PHASE_NAMES[state.phase]} 종료 — ${parts.join(" / ") || "변화 없음"}`);
  for (const k of Object.keys(f.shortage) as ResourceId[])
    s = addLog(s, `${RESOURCE_BY_ID[k].name} 부족! 모두 제대로 먹고 마시지 못해 건강이 나빠졌다.`, "warn");
  if (Object.keys(f.overflow).length) s = addLog(s, `저장 공간이 부족해 ${bundleText(f.overflow)}을(를) 버렸다.`, "warn");

  // 2) 생존자 작업과 피로·건강
  s = processWork(s);
  s = processNeeds(s, f.shortage);
  s = processLifePeriod(s, Object.keys(f.shortage).length > 0);

  // 3) 내구도 감소와 고장
  let seed = s.seed;
  const breakdowns: string[] = [];
  const harvests: string[] = [];
  s = {
    ...s,
    rooms: s.rooms.map((room) => ({
      ...room,
      facilities: room.facilities.map((fac) => {
        const rep = f.sim.byId[fac.id];
        // 재배 시설 성장 (수확하면 처음부터)
        if (rep && rep.grow > 0) {
          const crop = FACILITY_BY_ID[fac.type].crop!;
          const g = (fac.growth ?? 0) + rep.grow;
          fac = { ...fac, growth: g >= crop.cycle ? 0 : g };
          if (rep.harvest) harvests.push(`${FACILITY_BY_ID[fac.type].name} 수확: 식량 +${rep.produced.food ?? 0}`);
        }
        if (!rep || rep.decay <= 0) return fac;
        let durability = Math.max(0, fac.durability - rep.decay);
        const name = FACILITY_BY_ID[fac.type].name;
        if (durability === 0) breakdowns.push(`${name}의 내구도가 바닥나 고장 났다.`);
        else if (atRisk({ type: fac.type, durability })) {
          let roll: number;
          [roll, seed] = nextRandom(seed);
          if (roll < RULES.facility.breakdownChance) {
            durability = 0;
            breakdowns.push(`${name}이(가) 갑자기 멈췄다. 고장!`);
          }
        }
        return { ...fac, durability };
      }),
    })),
    seed,
  };
  for (const b of breakdowns) s = addLog(s, b, "warn");
  for (const h of harvests) s = addLog(s, h, "build");

  // 사건
  s = rollEvents(s);

  // 4) 다음 구간
  const np = nextPhase(state.phase);
  s = { ...s, phase: np, actionsLeft: np === "maintenance" ? 0 : RULES.actionsPerPhase };
  if (np === "maintenance") s = addLog(s, "하루 일과가 끝났다. 정비 시간 — 거점을 정리하고 내일을 준비한다.");
  return s;
}

/** 정비 시간을 끝내고 다음 날 오전을 시작한다. 하루 단위 처리는 이후 단계에서 여기에 추가한다. */
export function startNextDay(state: GameState): GameState {
  if (state.phase !== "maintenance") return state;
  let s: GameState = processSleep(state);
  // 업데이트 2: 회복·악화, 침상 없는 밤, 떠남, 생존자 간 사건
  const life = processLifeDay(s, bedCount(s));
  s = life.state;
  // 업데이트 4: 원정대 귀환, 약탈단 습격
  const exp = processExpeditions(s);
  s = exp.state;
  const raid = processRaid(s);
  s = raid.state;
  s = { ...s, day: state.day + 1, phase: "morning", actionsLeft: RULES.actionsPerPhase };
  s = expirePending(s);
  s = { ...s, events: { serial: s.events.serial + 1, list: [...exp.events, ...raid.events, ...life.events] } };
  return addLog(s, `${s.day}일차 아침이 밝았다. (인원 ${population(s)}명 · 침상 ${bedCount(s)}개)`);
}
