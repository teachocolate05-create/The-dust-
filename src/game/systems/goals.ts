// 업데이트 5: 장기 목표 판정
import { CITY_GOAL, GOALS } from "../config/goals";
import { ZONES } from "../config/zones";
import { RULES } from "../config/rules";
import type { GameEvent, GameState, LogEntry } from "../core/types";
import { simulatePeriod } from "./operation";
import { forecastPhaseEnd } from "./time";

/** 지금 상태에서 이뤄진 목표 id 목록 */
export function achievedNow(state: GameState): Set<string> {
  const out = new Set<string>();
  const sim = simulatePeriod(state);
  const pop = state.survivors.length + state.world.expeditions.reduce((n, e) => n + e.members.length, 0);
  if (sim.reports.some((r) => r.status === "running" && r.powerIn > 0)) out.add("firstLight");
  if (pop >= 2) out.add("companion");
  if (state.zones.length >= 1) out.add("zone");
  if (state.stats.harvests >= 1) out.add("harvest");
  if (state.stats.expeditions >= 1) out.add("surface");
  if (state.stats.raidsRepelled >= 1) out.add("defended");
  if (pop >= 5) out.add("community");
  if (state.zones.includes("lower_west")) out.add("deep");
  if (pop >= 8) out.add("population");
  const f = forecastPhaseEnd({ ...state, phase: state.phase === "maintenance" ? "morning" : state.phase });
  if ((f.production.food ?? 0) > 0 && (f.production.food ?? 0) >= (f.consumption.food ?? 0)) out.add("selfFood");
  if (sim.powerNets.reduce((n, p) => n + p.supply, 0) >= 30) out.add("power");
  if (ZONES.every((z) => state.zones.includes(z.id))) out.add("allZones");
  if (state.day >= 30) out.add("days30");
  return out;
}

/** 새로 이룬 목표를 기록하고 알림을 띄운다. 최종 조건을 모두 이루면 거점 완성 */
export function updateGoals(state: GameState, mergeWithCurrentEvents: boolean): GameState {
  if (state.gameOver) return state;
  const now = achievedNow(state);
  const fresh = GOALS.filter((g) => now.has(g.id) && !state.goals.includes(g.id));
  let goals = [...state.goals, ...fresh.map((g) => g.id)];
  const events: GameEvent[] = fresh.map((g) => ({ id: `goal-${g.id}`, title: `목표 달성: ${g.name}`, text: g.desc, tone: "good" }));
  let cityDay = state.cityDay;
  const finals = GOALS.filter((g) => g.final);
  if (cityDay === null && finals.every((g) => goals.includes(g.id))) {
    cityDay = state.day;
    goals = [...goals, CITY_GOAL.id];
    events.push({ id: "goal-city", title: `${CITY_GOAL.name} 완성!`, text: `${state.day}일 만에 폐쇄된 환승역을 스스로 굴러가는 생존 거점으로 만들었다. 계속 거점을 키워 나갈 수 있다.`, tone: "good" });
  }
  if (!events.length) return state;
  const log: LogEntry[] = events.map((e) => ({ day: state.day, phase: state.phase, kind: "event", text: `[${e.title}] ${e.text}` }));
  // 같은 처리(구간 종료 등)에서 이미 사건 알림이 나왔다면 그 목록에 이어 붙인다
  const merge = mergeWithCurrentEvents;
  return {
    ...state,
    goals,
    cityDay,
    log: [...log.reverse(), ...state.log].slice(0, RULES.maxLogEntries),
    events: merge ? { serial: state.events.serial, list: [...state.events.list, ...events] } : { serial: state.events.serial + 1, list: events },
  };
}
