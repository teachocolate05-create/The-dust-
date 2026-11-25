import { describe, expect, it } from "vitest";
import { FACILITY_BY_ID } from "@/game/config/facilities";
import { createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { tryFindMedicine } from "@/game/systems/life";
import { generateSurvivor } from "@/game/systems/survivors";
import type { GameState, Survivor } from "@/game/core/types";

const mk = (id: string, over: Partial<Survivor> = {}): Survivor => ({
  ...generateSurvivor(9, id, [])[0],
  id,
  name: id,
  health: 80,
  fatigue: 20,
  traits: [],
  conditions: [],
  morale: 50,
  ...over,
});

describe("휴식 회복 +1~5", () => {
  it("휴식 행동으로 오르는 건강은 1~5", () => {
    const gains = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const s0 = createTestState(seed);
      const s = { ...s0, survivors: [{ ...s0.survivors[0], health: 50 }] };
      const g = gameReducer(s, { type: "DO_ACTION", actionId: "rest" }).survivors[0].health - 50;
      if (g > 0) gains.add(g);
    }
    expect([...gains].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("의약품", () => {
  it("외부 활동 중 약 5% 확률로 발견, 하루 최대 2개", () => {
    let found = 0;
    for (let seed = 1; seed <= 2000; seed++) if (tryFindMedicine({ ...createTestState(1), seed }).found) found++;
    expect(found).toBeGreaterThan(60);
    expect(found).toBeLessThan(150);
    // 하루 최대 2개
    let s: GameState = { ...createTestState(1), medicineFound: { day: 1, count: 2 } };
    for (let i = 0; i < 200; i++) s = tryFindMedicine(s).state;
    expect(s.medicine).toBe(0);
    // 다음 날에는 다시 찾을 수 있다
    let t: GameState = { ...createTestState(1), day: 2, medicineFound: { day: 1, count: 2 } };
    for (let i = 0; i < 400; i++) t = tryFindMedicine(t).state;
    expect(t.medicine).toBe(2);
  });
  it("외부 행동에서 발견한다 (안쪽 행동에서는 안 나온다)", () => {
    let outside = 0;
    let inside = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = { ...createTestState(1), seed };
      if (gameReducer(s, { type: "DO_ACTION", actionId: "forage" }).medicine > 0) outside++;
      if (gameReducer(s, { type: "DO_ACTION", actionId: "rest" }).medicine > 0) inside++;
    }
    expect(outside).toBeGreaterThan(10);
    expect(inside).toBe(0);
  });
  it("쓰면 건강 +5 (최대 100), 하나 줄어든다", () => {
    let s = { ...createTestState(1), medicine: 2, survivors: [{ ...createTestState(1).survivors[0], health: 97 }] };
    s = gameReducer(s, { type: "USE_MEDICINE", survivorId: "player" });
    expect(s.survivors[0].health).toBe(100);
    expect(s.medicine).toBe(1);
    expect(gameReducer(s, { type: "USE_MEDICINE", survivorId: "player" })).toBe(s); // 이미 건강함
  });
});

describe("이층 침대", () => {
  it("1×2 크기, 침상 2개", () => {
    expect(FACILITY_BY_ID.bunk.w).toBe(1);
    expect(FACILITY_BY_ID.bunk.h).toBe(2);
    expect(FACILITY_BY_ID.bunk.beds).toBe(2);
  });
});

describe("생존자 사망", () => {
  it("건강이 0이 되면 숨지고, 남은 생존자 사기가 1~5 떨어진다", () => {
    const losses = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const base = createTestState(seed);
      // 굶주린 상태에서 건강 1 → 구간이 끝나면 0
      const s: GameState = {
        ...base,
        seed,
        resources: { ...base.resources, food: 0, water: 0 },
        survivors: [...base.survivors, mk("dying", { health: 1, job: "rest" }), mk("friend", { morale: 50, job: "debris" })],
      };
      const s2 = gameReducer(s, { type: "END_PHASE" });
      expect(s2.survivors.some((x) => x.id === "dying")).toBe(false);
      expect(s2.events.list.some((e) => e.id === "death")).toBe(true);
      // 친구 사기: 구간 변화(일함 -1, 굶주림 -8) 뒤 사망으로 1~5 추가 감소
      const friend = s2.survivors.find((x) => x.id === "friend")!;
      losses.add(50 - 1 - 8 - friend.morale);
    }
    expect([...losses].every((l) => l >= 1 && l <= 5)).toBe(true);
    expect(losses.size).toBeGreaterThan(2);
  });
});

describe("저장 변환", () => {
  it("의약품 필드를 붙인다", () => {
    const v12: any = { ...JSON.parse(JSON.stringify(createTestState(1))), version: 12, medicine: undefined, medicineFound: undefined };
    const m = migrateSave(v12);
    expect(validateSave(m)).toBe(true);
    expect(m.medicine).toBe(0);
  });
});
