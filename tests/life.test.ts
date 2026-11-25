import { describe, expect, it } from "vitest";
import { TRAIT_BY_ID } from "@/game/config/life";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { addCondition, conditionName, getRel, lifeWorkMultiplier, processLifeDay, rollTraits } from "@/game/systems/life";
import { generateSurvivor, planWork } from "@/game/systems/survivors";
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
  morale: 60,
  ...over,
});
const withPeople = (people: Survivor[], s: GameState = createInitialState(1)): GameState => ({
  ...s,
  survivors: [...s.survivors, ...people],
  resources: { ...s.resources, food: 10, water: 10 },
});

describe("특성", () => {
  it("새 생존자는 서로 다른 그룹의 특성 2개를 가진다", () => {
    for (let seed = 1; seed < 50; seed++) {
      const [t] = rollTraits(seed);
      expect(t.length).toBe(2);
      expect(TRAIT_BY_ID[t[0]].group).not.toBe(TRAIT_BY_ID[t[1]].group);
    }
  });
  it("부지런함은 효율 +15%, 게으름은 -15%", () => {
    expect(lifeWorkMultiplier(mk("a", { traits: ["hardworking"] }), "debris")).toBeCloseTo(1.15);
    expect(lifeWorkMultiplier(mk("a", { traits: ["lazy"] }), "debris")).toBeCloseTo(0.85);
    expect(lifeWorkMultiplier(mk("a", { traits: ["scout"] }), "scavenge")).toBeCloseTo(1.2);
    expect(lifeWorkMultiplier(mk("a", { traits: ["handy"] }), "maintain")).toBeCloseTo(1.25);
  });
});

describe("부상·질병", () => {
  it("다치면 외부 업무를 못 하고, 병에 걸리면 효율 절반", () => {
    let s = withPeople([mk("a", { job: "scavenge" })]);
    s = addCondition(s, "a", "injury", 1).state;
    expect(planWork(s)[0].blocked).toBeTruthy();
    const sick = addCondition(withPeople([mk("b")]), "b", "illness", 1).state.survivors[1];
    expect(lifeWorkMultiplier(sick, "debris")).toBeCloseTo(0.5);
    expect(conditionName(sick.conditions[0])).toBe("감기");
  });
  it("같은 종류가 겹치면 심각도가 오른다 (최대 3)", () => {
    let s = withPeople([mk("a")]);
    for (let i = 0; i < 5; i++) s = addCondition(s, "a", "illness", 1).state;
    expect(s.survivors[1].conditions[0].severity).toBe(3);
  });
  it("병은 구간마다 건강을 깎는다", () => {
    let s = withPeople([mk("a", { job: "rest" })]);
    s = addCondition(s, "a", "illness", 2).state;
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.survivors[1].health).toBeLessThan(80 + 3);
  });
  it("쉬면 대체로 낫는다 (하루 지날 때)", () => {
    let healed = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let s = { ...withPeople([mk("a", { job: "rest" })]), seed };
      s = addCondition(s, "a", "injury", 1).state;
      const r = processLifeDay(s, 5).state;
      if (!r.survivors.find((x) => x.id === "a")!.conditions.length) healed++;
    }
    expect(healed).toBeGreaterThan(45);
  });
  it("치료 업무: 의료 능력치가 높을수록 환자를 고친다", () => {
    let cured = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let s = { ...withPeople([mk("patient", { job: "rest" }), mk("doc", { job: "heal", skills: { tech: 1, medic: 5, gather: 1, farm: 1, manage: 1 } })]), seed };
      s = addCondition(s, "patient", "illness", 1).state;
      s = gameReducer(s, { type: "END_PHASE" });
      if (!s.survivors.find((x) => x.id === "patient")!.conditions.length) cured++;
    }
    expect(cured).toBeGreaterThan(50);
  });
});

describe("사기", () => {
  it("쉬면 오르고, 굶으면 떨어진다", () => {
    const s = withPeople([mk("a", { job: "rest" }), mk("b", { job: "debris" })]);
    const fed = gameReducer(s, { type: "END_PHASE" });
    expect(fed.survivors[1].morale).toBeGreaterThan(60);
    const hungry = gameReducer({ ...s, resources: { ...s.resources, food: 0 } }, { type: "END_PHASE" });
    expect(hungry.survivors[2].morale).toBeLessThan(60);
  });
  it("사기가 아주 낮으면 떠날 수 있다", () => {
    let left = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = { ...withPeople([mk("a", { morale: 5 })]), seed };
      if (!processLifeDay(s, 5).state.survivors.some((x) => x.id === "a")) left++;
    }
    expect(left).toBeGreaterThan(5);
    expect(left).toBeLessThan(30);
  });
  it("사기가 낮으면 효율이 떨어지고 높으면 오른다", () => {
    expect(lifeWorkMultiplier(mk("a", { morale: 20 }), "debris")).toBeCloseTo(0.75);
    expect(lifeWorkMultiplier(mk("a", { morale: 80 }), "debris")).toBeCloseTo(1.1);
  });
});

describe("관계와 생존자 간 사건", () => {
  it("같은 업무를 하면 가까워진다", () => {
    const s = withPeople([mk("a", { job: "debris" }), mk("b", { job: "debris" })]);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(getRel(s2, "a", "b")).toBeGreaterThan(0);
  });
  it("하루가 지날 때 생존자 간 사건이 일어나 관계·사기에 영향을 준다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const s = { ...withPeople([mk("a"), mk("b"), mk("c")]), seed };
      const r = processLifeDay(s, 5);
      for (const e of r.events) seen.add(e.id);
      if (r.events.some((e) => e.id === "quarrel")) expect(Object.values(r.state.relations).some((v) => v < 0)).toBe(true);
    }
    expect(seen.has("quarrel")).toBe(true);
    expect(seen.has("bonding")).toBe(true);
    expect(seen.has("storyNight")).toBe(true);
  });
  it("다음 날 시작 시 생존자 사건이 알림 목록에 실린다", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const s = toMaintenance({ ...withPeople([mk("a"), mk("b")]), seed });
      const s2 = gameReducer(s, { type: "START_NEXT_DAY" });
      if (s2.events.list.length) found = true;
    }
    expect(found).toBe(true);
  });
});

describe("저장 변환 (업데이트 1 → 2)", () => {
  it("예전 생존자에게 특성·사기를 붙인다", () => {
    const s = withPeople([mk("a")]);
    const v7: any = JSON.parse(JSON.stringify({ ...s, version: 7, relations: undefined }));
    v7.survivors = v7.survivors.map(({ traits, conditions, morale, ...rest }: any) => rest);
    const m = migrateSave(v7);
    expect(validateSave(m)).toBe(true);
    expect(m.survivors[1].traits.length).toBe(2);
    expect(m.survivors[0].traits.length).toBe(0);
  });
});
