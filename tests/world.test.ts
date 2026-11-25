import { describe, expect, it } from "vitest";
import { createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { canDoAction } from "@/game/systems/actions";
import { addCondition } from "@/game/systems/life";
import { generateSurvivor } from "@/game/systems/survivors";
import { canSendExpedition, defensePower, processRaid, raidStrength } from "@/game/systems/world";
import type { GameState, Survivor } from "@/game/core/types";
import { toMaintenance } from "./helpers";

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
const base = (people: Survivor[] = [mk("a"), mk("b")]): GameState => {
  const s = createTestState(1);
  return { ...s, survivors: [...s.survivors, ...people], resources: { ...s.resources, food: 10, water: 10, materials: 30, parts: 10 } };
};
const contact = (s: GameState, id: "traders" | "clinic" | "raiders", relation?: number): GameState => ({
  ...s,
  world: { ...s.world, factions: { ...s.world.factions, [id]: { ...s.world.factions[id], contacted: true, relation: relation ?? s.world.factions[id].relation } } },
});

describe("지상 탐사", () => {
  it("처음에는 역 앞 광장만 알고, 지상 탐사로 이웃 지역을 찾는다", () => {
    expect(createTestState(1).world.regions.plaza.discovered).toBe(true);
    let found = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = gameReducer({ ...base(), seed }, { type: "DO_ACTION", actionId: "surfaceScout" });
      const n = Object.values(s.world.regions).filter((r) => r.discovered).length;
      if (n > 1) {
        found++;
        expect(s.world.regions.market.discovered || s.world.regions.apartments.discovered).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(15);
  });
});

describe("원정", () => {
  it("정비 시간에 보내고, 준비물을 쓰며, 원정 중에는 거점 인원에서 빠진다", () => {
    let s = toMaintenance(base());
    expect(canSendExpedition({ ...s, phase: "morning" }, "plaza", ["a"]).ok).toBe(false);
    expect(canSendExpedition(s, "plaza", ["player"]).ok).toBe(false);
    expect(canSendExpedition(s, "market", ["a"]).ok).toBe(false); // 모르는 지역
    s = gameReducer(s, { type: "SEND_EXPEDITION", regionId: "plaza", memberIds: ["a", "b"] });
    expect(s.survivors.length).toBe(1);
    expect(s.world.expeditions.length).toBe(1);
    expect(s.resources.food).toBe(10 - 2);
    // 광장은 1일 거리 → 다음 날 아침 귀환
    const m0 = s.resources.materials;
    s = gameReducer(s, { type: "START_NEXT_DAY" });
    expect(s.world.expeditions.length).toBe(0);
    expect(s.survivors.length).toBe(3);
    expect(s.resources.materials).toBeGreaterThan(m0);
    expect(s.world.regions.market.discovered).toBe(true);
    expect(s.world.regions.plaza.visits).toBe(1);
    expect(s.events.list.some((e) => e.id === "expedition")).toBe(true);
  });
  it("다친 사람은 원정을 갈 수 없다", () => {
    const s = addCondition(toMaintenance(base()), "a", "injury", 1).state;
    expect(canSendExpedition(s, "plaza", ["a"]).ok).toBe(false);
  });
  it("집단이 있는 지역에 다녀오면 그 집단과 접촉한다", () => {
    let s = toMaintenance(base());
    s = { ...s, world: { ...s.world, regions: { ...s.world.regions, market: { discovered: true, visits: 0 } } } };
    s = gameReducer(s, { type: "SEND_EXPEDITION", regionId: "market", memberIds: ["a"] });
    s = gameReducer(s, { type: "START_NEXT_DAY" });
    expect(s.world.factions.traders.contacted).toBe(true);
  });
});

describe("교역·선물·진료", () => {
  it("상인회와 하루 한 번 거래, 관계 +2", () => {
    let s = contact(toMaintenance(base()), "traders");
    const f0 = s.resources.food;
    s = gameReducer(s, { type: "TRADE", factionId: "traders", index: 0 });
    expect(s.resources.materials).toBe(30 - 8);
    expect(s.resources.food).toBe(Math.min(10, f0 + 5));
    expect(s.world.factions.traders.relation).toBe(12);
    expect(gameReducer(s, { type: "TRADE", factionId: "traders", index: 1 })).toBe(s);
  });
  it("관계가 나쁘면 거래 불가, 선물로 관계 개선", () => {
    let s = contact(toMaintenance(base()), "raiders");
    expect(gameReducer(s, { type: "TRADE", factionId: "raiders", index: 0 })).toBe(s);
    s = gameReducer(s, { type: "GIFT", factionId: "raiders" });
    expect(s.world.factions.raiders.relation).toBe(-40 + 15);
  });
  it("병원 공동체 진료: 식량 4로 부상·질병을 모두 고친다", () => {
    let s = contact(toMaintenance(base()), "clinic");
    s = addCondition(s, "a", "illness", 2).state;
    s = gameReducer(s, { type: "CLINIC", survivorId: "a" });
    expect(s.survivors.find((x) => x.id === "a")!.conditions.length).toBe(0);
    expect(s.resources.food).toBe(6);
  });
});

describe("습격과 방어", () => {
  it("6일차부터 약탈단과 사이가 나쁘면 습격이 온다. 방어력이 높으면 막는다", () => {
    let raids = 0;
    let lost = 0;
    let held = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const weak = { ...base(), day: 7, seed };
      const r = processRaid(weak);
      if (r.events.length) {
        raids++;
        if (r.state.resources.food < 10) lost++;
      }
      const strong = { ...base([mk("a", { job: "guard" }), mk("b", { job: "guard" }), mk("c", { job: "guard" })]), day: 7, seed };
      const r2 = processRaid(strong);
      if (r2.events.length && r2.events[0].tone === "good") held++;
    }
    expect(raids).toBeGreaterThan(15);
    expect(lost).toBeGreaterThan(10);
    expect(held).toBeGreaterThan(10);
    expect(processRaid({ ...base(), day: 3 }).events.length).toBe(0);
  });
  it("방어력 = 인원 + 경비 + 경비실 시설", () => {
    const s = base([mk("a", { job: "guard", skills: { tech: 1, medic: 1, gather: 1, farm: 1, manage: 2 } })]);
    const d = defensePower(s);
    expect(d.people).toBe(2 * 2);
    expect(d.guards).toBe(7);
    expect(raidStrength({ ...s, day: 10 })).toBe(20);
  });
});

describe("사기 회복", () => {
  it("격려하기 행동: 모든 생존자 사기 +8", () => {
    const s = gameReducer(base(), { type: "DO_ACTION", actionId: "encourage" });
    expect(s.survivors[1].morale).toBe(58);
    expect(canDoAction(createTestState(1), "encourage").ok).toBe(false);
  });
  it("특별 배급: 정비 시간 하루 한 번, 인원당 식량·식수 1, 사기 +12", () => {
    let s = toMaintenance(base());
    s = gameReducer(s, { type: "FEAST" });
    expect(s.survivors[1].morale).toBe(62);
    expect(s.resources.food).toBe(8);
    expect(gameReducer(s, { type: "FEAST" })).toBe(s);
  });
});

describe("치료 대상 지정", () => {
  it("지정한 환자를 먼저 돌본다", () => {
    let cured = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let s = { ...base([mk("doc", { job: "heal", skills: { tech: 1, medic: 5, gather: 1, farm: 1, manage: 1 } }), mk("x", { job: "rest" }), mk("y", { job: "rest" })]), seed };
      s = addCondition(s, "x", "illness", 1).state;
      s = addCondition(s, "y", "illness", 3).state;
      s = gameReducer(s, { type: "SET_HEAL_TARGET", survivorId: "doc", targetId: "x" });
      s = gameReducer(s, { type: "END_PHASE" });
      if (!s.survivors.find((v) => v.id === "x")!.conditions.length) cured++;
      expect(s.survivors.find((v) => v.id === "y")!.conditions[0].severity).toBe(3);
    }
    expect(cured).toBeGreaterThan(30);
  });
});

describe("저장 변환 (업데이트 3 → 4)", () => {
  it("외부 세계를 붙인다", () => {
    const v9: any = { ...JSON.parse(JSON.stringify(createTestState(1))), version: 9, world: undefined, feastDay: undefined };
    const m = migrateSave(v9);
    expect(validateSave(m)).toBe(true);
    expect(m.world.regions.plaza.discovered).toBe(true);
  });
});
