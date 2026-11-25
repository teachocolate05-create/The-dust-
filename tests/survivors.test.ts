import { describe, expect, it } from "vitest";
import { createInitialState, createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction } from "@/game/systems/actions";
import { bedCount, canAccept, generateSurvivor, planWork, population } from "@/game/systems/survivors";
import { forecastPhaseEnd } from "@/game/systems/time";
import type { GameState, Survivor } from "@/game/core/types";
import { opened, rich, toMaintenance } from "./helpers";

const worker = (over: Partial<Survivor> = {}): Survivor => ({
  ...generateSurvivor(5, "w1", [])[0],
  health: 80,
  fatigue: 20,
  traits: [],
  conditions: [],
  morale: 60,
  ...over,
});
const withWorker = (s: GameState, over: Partial<Survivor> = {}): GameState => ({ ...s, survivors: [...s.survivors, worker(over)] });

describe("시작", () => {
  it("플레이어 혼자, 침낭 1 (+ 테스트 배치의 간이 침상 1)", () => {
    const s = createTestState(1);
    expect(population(s)).toBe(1);
    expect(s.survivors[0].isPlayer).toBe(true);
    expect(bedCount(s)).toBe(2);
    expect(bedCount(createInitialState(1))).toBe(1); // 실제 시작: 침낭만
  });
});

describe("수색 → 구조 → 수용", () => {
  it("수색에 성공하면 발견, 구조하면 입구 도착, 정비 시간에 침상이 있어야 수용", () => {
    // 성공할 때까지 시드를 바꿔 수색
    let s: GameState | null = null;
    for (let seed = 1; seed < 50 && !s; seed++) {
      const t = gameReducer(createTestState(seed), { type: "DO_ACTION", actionId: "searchSurvivor" });
      if (t.pending.length) s = t;
    }
    expect(s).not.toBeNull();
    let st = s!;
    expect(st.pending[0].stage).toBe("found");
    expect(canDoAction(st, "searchSurvivor").ok).toBe(false); // 이미 발견한 사람이 있음
    st = gameReducer(st, { type: "DO_ACTION", actionId: "rescue" });
    expect(st.pending[0].stage).toBe("arrived");
    // 낮에는 수용 불가
    expect(canAccept(st, 0).ok).toBe(false);
    st = toMaintenance(st);
    // 침상(침낭 포함) 수가 인원보다 적거나 같으면 수용 불가
    const noBeds = { ...st, rooms: st.rooms.filter((r) => r.type !== "residence") };
    expect(canAccept(noBeds, 0).ok).toBe(false);
    // 침낭 1 + 간이 침상 1 = 2 > 인원 1
    st = rich(st);
    expect(canAccept(st, 0).ok).toBe(true);
    st = gameReducer(st, { type: "ACCEPT_SURVIVOR", index: 0 });
    expect(population(st)).toBe(2);
    expect(st.pending.length).toBe(0);
  });
  it("수용하지 않으면 다음 날 떠난다", () => {
    const sv = worker();
    let s: GameState = { ...toMaintenance(createTestState(1)), pending: [{ survivor: sv, stage: "arrived", leavesAfterDay: 1 }] };
    s = gameReducer(s, { type: "START_NEXT_DAY" });
    expect(s.pending.length).toBe(0);
  });
});

describe("인원과 소비", () => {
  it("인원 수만큼 식량·식수를 소비", () => {
    const s = withWorker(createTestState(1));
    const f = forecastPhaseEnd(s);
    expect(f.consumption.food).toBe(2);
    expect(f.consumption.water).toBe(2);
  });
  it("배급을 못 받으면 모두 건강이 준다", () => {
    let s = withWorker(createTestState(1));
    s = { ...s, resources: { ...s.resources, food: 0 } };
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.survivors[1].health).toBeLessThan(80);
    expect(s2.survivors[0].health).toBeLessThan(100);
  });
});

describe("업무", () => {
  it("업무 배정, 플레이어는 배정 불가", () => {
    let s = withWorker(createTestState(1));
    s = gameReducer(s, { type: "SET_JOB", survivorId: "w1", job: "scavenge" });
    expect(s.survivors[1].job).toBe("scavenge");
    const same = gameReducer(s, { type: "SET_JOB", survivorId: "player", job: "scavenge" });
    expect(same.survivors[0].job).toBe("rest");
  });
  it("자원 수집: 구간 종료 시 자원 획득, 피로 증가", () => {
    let s = withWorker(createTestState(3), { job: "scavenge", skills: { tech: 1, medic: 1, gather: 5, farm: 1, manage: 1 } });
    s = { ...s, resources: { ...s.resources, materials: 10 } };
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.materials).toBeGreaterThan(10);
    expect(s2.survivors[1].fatigue).toBe(30);
  });
  it("휴식: 피로 감소", () => {
    const s = withWorker(createTestState(3), { job: "rest", fatigue: 50 });
    expect(gameReducer(s, { type: "END_PHASE" }).survivors[1].fatigue).toBe(30);
  });
  it("잔해 정리: 지정한 잔해 중 통로와 맞닿은 칸을 치운다", () => {
    let s = withWorker(createTestState(3), { job: "debris", skills: { tech: 1, medic: 1, gather: 2, farm: 1, manage: 1 } });
    expect(planWork(s)[0].blocked).toBeTruthy(); // 지정 없음
    s = gameReducer(s, { type: "MARK_DEBRIS", points: [{ x: 13, y: 1 }, { x: 12, y: 1 }, { x: 1, y: 1 }], on: true });
    expect(s.debrisMarks.length).toBe(3);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    // 능력치 2 → 1칸. (13,1)만 통로와 닿아 있음
    expect(s2.map[1][13]).toBe("floor");
    expect(s2.map[1][12]).toBe("debris");
    const s3 = gameReducer(s2, { type: "END_PHASE" });
    expect(s3.map[1][12]).toBe("floor"); // 이제 통로와 닿음
    expect(s3.map[1][1]).toBe("debris"); // 멀리 있는 칸은 아직
  });
  it("시설 관리: 가장 닳은 기계 내구도 회복", () => {
    const s = withWorker(opened(3), { job: "maintain", skills: { tech: 3, medic: 1, gather: 1, farm: 1, manage: 1 } });
    const gen0 = s.rooms.find((r) => r.type === "power")!.facilities[0].durability;
    const s2 = gameReducer(s, { type: "END_PHASE" });
    // 회복 4 + 2×3 = 10, 가동 마모 3
    expect(s2.rooms.find((r) => r.type === "power")!.facilities[0].durability).toBe(gen0 + 10 - 3);
  });
  it("탈진하면 일하지 않고 건강이 준다", () => {
    const s = withWorker(createTestState(3), { job: "scavenge", fatigue: 100 });
    const s2 = gameReducer({ ...s, resources: { ...s.resources, materials: 10 } }, { type: "END_PHASE" });
    expect(s2.resources.materials).toBe(10);
    expect(s2.survivors[1].health).toBeLessThan(80);
  });
});

describe("플레이어 피로", () => {
  it("행동마다 피로가 쌓이고, 100이면 행동할 수 없다", () => {
    const s = createTestState(1);
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "forage" });
    expect(s2.survivors[0].fatigue).toBe(s.survivors[0].fatigue + 4);
    const tired: GameState = { ...s, survivors: [{ ...s.survivors[0], fatigue: 100 }] };
    expect(canDoAction(tired, "forage").ok).toBe(false);
  });
  it("밤잠: 침상이 있으면 피로 -40", () => {
    const s: GameState = { ...toMaintenance(createTestState(1)), survivors: [{ ...createTestState(1).survivors[0], fatigue: 60 }] };
    expect(gameReducer(s, { type: "START_NEXT_DAY" }).survivors[0].fatigue).toBe(20);
  });
});

