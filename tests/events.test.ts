import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction } from "@/game/systems/actions";
import { rollEvents } from "@/game/systems/events";
import type { GameState } from "@/game/core/types";

const day2 = (seed: number): GameState => ({ ...createInitialState(seed), day: 2 });

describe("사건", () => {
  it("첫날에는 사건이 없다", () => {
    for (let seed = 1; seed < 30; seed++) expect(rollEvents(createInitialState(seed)).events.list.length).toBe(0);
  });
  it("2일차부터 약 30% 확률로 사건이 일어나고 기록에 남는다", () => {
    let count = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = rollEvents(day2(seed));
      if (s.events.list.length) {
        count++;
        expect(s.log[0].kind).toBe("event");
      }
    }
    expect(count).toBeGreaterThan(60);
    expect(count).toBeLessThan(120);
  });
  it("여러 종류의 사건이 실제로 거점에 영향을 준다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 600; seed++) {
      const before = day2(seed);
      const s = rollEvents(before);
      const ev = s.events.list[0];
      if (!ev) continue;
      seen.add(ev.id);
      if (ev.id === "spoilage") expect(s.resources.food).toBeLessThan(before.resources.food);
      if (ev.id === "waterContamination") expect(s.resources.water).toBeLessThan(before.resources.water);
      if (ev.id === "threat") expect(s.threat).not.toBeNull();
      if (ev.id === "survivorFound") expect(s.pending.length).toBe(1);
      if (ev.id === "badAir") expect(s.survivors[0].fatigue).toBeGreaterThan(before.survivors[0].fatigue);
      if (ev.id === "injury") expect(s.survivors[0].health).toBeLessThan(100);
    }
    // 시작 상태에서 가능한 사건만 8종 이상 (발전기 고장은 발전기가 고립되어 있어 불가)
    expect(seen.size).toBeGreaterThanOrEqual(7);
    expect(seen.has("genFailure")).toBe(false);
  });
});

describe("위협과 위험 제거", () => {
  it("위협이 있으면 위험 제거 가능, 성공하면 사라진다", () => {
    const base: GameState = { ...createInitialState(1), threat: { name: "들개 무리", sinceDay: 1 } };
    expect(canDoAction(createInitialState(1), "clearThreat").ok).toBe(false);
    expect(canDoAction(base, "clearThreat").ok).toBe(true);
    let cleared = 0;
    let hurt = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = gameReducer({ ...base, seed }, { type: "DO_ACTION", actionId: "clearThreat" });
      if (!s.threat) cleared++;
      else if (s.survivors[0].health < 100) hurt++;
    }
    expect(cleared).toBeGreaterThan(35);
    expect(hurt).toBeGreaterThan(20);
  });
});

describe("장소 조사", () => {
  it("탐색으로 장소를 찾으면 한 번 조사해 물자를 얻는다", () => {
    let s: GameState | null = null;
    for (let seed = 1; seed < 100 && !s; seed++) {
      const t = gameReducer(createInitialState(seed), { type: "DO_ACTION", actionId: "explore" });
      if (t.places.length) s = t;
    }
    expect(s).not.toBeNull();
    const st = { ...s!, resources: { ...s!.resources, food: 0, water: 0, materials: 0, parts: 0, fuel: 0 } };
    const s2 = gameReducer(st, { type: "DO_ACTION", actionId: "survey" });
    expect(s2.places[0].surveyed).toBe(true);
    const total = Object.values(s2.resources).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(canDoAction(s2, "survey").ok).toBe(false);
  });
});

describe("게임 오버", () => {
  it("플레이어 건강이 0이 되면 게임 오버, 이후 행동 불가, 새 게임은 가능", () => {
    let s = createInitialState(1);
    s = { ...s, resources: { ...s.resources, food: 0, water: 0 }, survivors: [{ ...s.survivors[0], health: 10 }] };
    s = gameReducer(s, { type: "END_PHASE" });
    expect(s.gameOver).not.toBeNull();
    expect(gameReducer(s, { type: "DO_ACTION", actionId: "forage" })).toBe(s);
    expect(gameReducer(s, { type: "END_PHASE" })).toBe(s);
    expect(gameReducer(s, { type: "NEW_GAME" }).gameOver).toBeNull();
  });
});
