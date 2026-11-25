// 업데이트 2: 생존자 생활 시스템
//  - 특성: 작업 효율·피로·병 걸릴 확률·사기 변화에 영향
//  - 부상·질병: 심각도 1~3. 쉬거나 치료받으면 낫고, 방치한 병은 악화된다
//  - 사기: 생활 환경에 따라 오르내리고 작업 효율에 영향. 너무 낮으면 떠날 수 있다
//  - 관계: 같은 일을 하면 가까워지고, 다툼으로 멀어진다. 친구·앙숙은 사기에 영향
//  - 생존자 간 사건: 하루가 지날 때 일정 확률로 일어난다

import { CONDITIONS, DEATH_MORALE, LIFE_RULES as L, MEDICINE, SOCIAL_EVENTS, TRAIT_BY_ID, TRAITS, type TraitDef } from "../config/life";
import { FACILITY_BY_ID } from "../config/facilities";
import { RULES } from "../config/rules";
import { JOB_BY_ID, type JobId } from "../config/survivors";
import { nextRandom, pickWeighted, randomInt } from "../core/random";
import type { Condition, GameEvent, GameState, LogEntry, Survivor, TraitId } from "../core/types";
import { computeAccess } from "./access";
import { simulatePeriod } from "./operation";

// ───────────── 공통 ─────────────

function log(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function traitProduct(sv: Survivor, field: keyof TraitDef): number {
  return sv.traits.reduce((m, t) => {
    const v = TRAIT_BY_ID[t]?.[field];
    return typeof v === "number" ? m * v : m;
  }, 1);
}

function traitSum(sv: Survivor, field: keyof TraitDef): number {
  return sv.traits.reduce((m, t) => {
    const v = TRAIT_BY_ID[t]?.[field];
    return typeof v === "number" ? m + v : m;
  }, 0);
}

function update(state: GameState, id: string, fn: (s: Survivor) => Survivor): GameState {
  return { ...state, survivors: state.survivors.map((s) => (s.id === id ? fn(s) : s)) };
}

// ───────────── 특성 ─────────────

/** 서로 다른 그룹에서 특성 2개를 고른다 */
export function rollTraits(seed: number): [TraitId[], number] {
  let s = seed;
  const out: TraitId[] = [];
  while (out.length < 2) {
    let i: number;
    [i, s] = randomInt(s, 0, TRAITS.length - 1);
    const t = TRAITS[i];
    if (out.some((x) => TRAIT_BY_ID[x].group === t.group)) continue;
    out.push(t.id);
  }
  return [out, s];
}

export function workFatigueExtra(sv: Survivor): number {
  return traitSum(sv, "fatigue");
}

// ───────────── 부상·질병 ─────────────

export function conditionName(c: Condition): string {
  return CONDITIONS[c.kind][Math.max(1, Math.min(3, c.severity)) - 1];
}

export function isInjured(sv: Survivor): boolean {
  return sv.conditions.some((c) => c.kind === "injury");
}
export function isSick(sv: Survivor): boolean {
  return sv.conditions.some((c) => c.kind === "illness");
}

/** 부상·질병을 얻는다. 이미 같은 종류가 있으면 심각도가 오른다 (최대 3) */
export function addCondition(state: GameState, id: string, kind: Condition["kind"], severity = 1): { state: GameState; text: string } {
  let text = "";
  const s = update(state, id, (sv) => {
    const has = sv.conditions.find((c) => c.kind === kind);
    const conditions = has
      ? sv.conditions.map((c) => (c.kind === kind ? { ...c, severity: Math.min(3, c.severity + severity) } : c))
      : [...sv.conditions, { kind, severity: Math.min(3, severity) }];
    const now = conditions.find((c) => c.kind === kind)!;
    text = `${sv.isPlayer ? "내가" : sv.name + "이(가)"} ${conditionName(now)}${kind === "injury" ? "을(를) 입었다" : "에 걸렸다"}.`;
    return { ...sv, conditions };
  });
  return { state: s, text };
}

export function hurtMultiplier(sv: Survivor): number {
  return traitProduct(sv, "hurt");
}

// ───────────── 작업 효율 ─────────────

const TECH_JOBS: JobId[] = ["maintain", "craft", "heal"];

/** 특성·부상·질병·사기를 합친 작업 효율 배수 */
export function lifeWorkMultiplier(sv: Survivor, job: JobId): number {
  let m = traitProduct(sv, "work");
  if (TECH_JOBS.includes(job)) m *= traitProduct(sv, "techWork");
  if (JOB_BY_ID[job]?.outside) m *= traitProduct(sv, "outsideWork");
  if (isInjured(sv)) m *= L.injuredWork;
  if (isSick(sv)) m *= L.sickWork;
  if (!sv.isPlayer) {
    if (sv.morale < L.lowMorale) m *= L.lowMoraleWork;
    else if (sv.morale >= L.highMorale) m *= L.highMoraleWork;
  }
  return m;
}

/** 일할 수 없는 이유 (특성·상태 때문에) */
export function lifeBlockReason(sv: Survivor, job: JobId): string | null {
  if (JOB_BY_ID[job]?.outside && isInjured(sv)) return "다쳐서 밖에 나갈 수 없습니다. 쉬게 하거나 치료하세요";
  return null;
}

// ───────────── 사기 ─────────────

function changeMorale(sv: Survivor, delta: number): Survivor {
  if (sv.isPlayer || delta === 0) return sv;
  const d = delta > 0 ? delta * traitProduct(sv, "moraleGain") : delta * traitProduct(sv, "moraleLoss");
  return { ...sv, morale: clamp(Math.round(sv.morale + d)) };
}

export function moraleLabel(m: number): string {
  if (m >= L.highMorale) return "의욕적";
  if (m >= L.lowMorale) return "보통";
  if (m >= L.leaveMorale) return "의욕 저하";
  return "떠날 생각";
}

// ───────────── 관계 ─────────────

export function relKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getRel(state: GameState, a: string, b: string): number {
  return state.relations[relKey(a, b)] ?? 0;
}

export function addRel(state: GameState, a: string, b: string, delta: number): GameState {
  const sa = state.survivors.find((x) => x.id === a);
  const sb = state.survivors.find((x) => x.id === b);
  if (!sa || !sb) return state;
  // 좋은 쪽 변화는 두 사람 특성의 '친화' 배수, 나쁜 쪽은 그대로
  const d = delta > 0 ? delta * Math.sqrt(traitProduct(sa, "bond") * traitProduct(sb, "bond")) : delta;
  const k = relKey(a, b);
  return { ...state, relations: { ...state.relations, [k]: clamp(Math.round((state.relations[k] ?? 0) + d), -100, 100) } };
}

/** 한 사람의 가장 친한 사람 / 가장 사이 나쁜 사람 */
export function closest(state: GameState, id: string): { friend?: { name: string; score: number }; rival?: { name: string; score: number } } {
  let friend: { name: string; score: number } | undefined;
  let rival: { name: string; score: number } | undefined;
  for (const o of state.survivors) {
    if (o.id === id) continue;
    const r = getRel(state, id, o.id);
    if (r >= L.friendAt && (!friend || r > friend.score)) friend = { name: o.name, score: r };
    if (r <= L.rivalAt && (!rival || r < rival.score)) rival = { name: o.name, score: r };
  }
  return { friend, rival };
}

// ───────────── 치료 ─────────────

function medicalBonus(state: GameState): number {
  const access = computeAccess(state);
  let bed = false;
  let cab = false;
  for (const room of state.rooms) {
    if (room.type !== "medical" || !access.roomAccess[room.id]) continue;
    for (const f of room.facilities) {
      if (f.durability <= 0) continue;
      if (f.type === "med_bed") bed = true;
      if (f.type === "med_cabinet") cab = true;
    }
  }
  return (bed ? L.healBedBonus : 0) + (cab ? L.healCabinetBonus : 0);
}

export function healChance(state: GameState, healer: Survivor): number {
  const base = L.healBase + L.healPerSkill * healer.skills.medic + medicalBonus(state);
  return Math.min(0.95, base * traitProduct(healer, "techWork") * (healer.fatigue >= 70 ? 0.5 : 1));
}

/** 가장 심한 환자 (자기 자신 포함) */
function worstPatient(state: GameState): { sv: Survivor; c: Condition } | null {
  let best: { sv: Survivor; c: Condition } | null = null;
  for (const sv of state.survivors)
    for (const c of sv.conditions) if (!best || c.severity > best.c.severity) best = { sv, c };
  return best;
}

export function doHeal(state: GameState, healer: Survivor): { state: GameState; text: string } {
  // 지정한 환자가 있고 아직 아프면 그 사람부터, 아니면 가장 심한 환자
  const target = healer.healTarget ? state.survivors.find((x) => x.id === healer.healTarget && x.conditions.length) : undefined;
  const p = target ? { sv: target, c: target.conditions.reduce((a, b) => (b.severity > a.severity ? b : a)) } : worstPatient(state);
  if (!p) return { state, text: "돌볼 환자가 없었다" };
  const [roll, seed] = nextRandom(state.seed);
  let s = { ...state, seed };
  if (roll >= healChance(state, healer)) return { state: s, text: `${p.sv.isPlayer ? "나" : p.sv.name}의 ${conditionName(p.c)}을(를) 돌봤지만 아직 차도가 없다` };
  const name = conditionName(p.c);
  s = update(s, p.sv.id, (sv) => ({
    ...sv,
    conditions: sv.conditions.map((c) => (c === p.c ? { ...c, severity: c.severity - 1 } : c)).filter((c) => c.severity > 0),
  }));
  s = addRel(s, healer.id, p.sv.id, 5);
  return { state: s, text: `${p.sv.isPlayer ? "나" : p.sv.name}의 ${name}을(를) 치료했다 (심각도 -1)` };
}

// ───────────── 구간 처리 ─────────────

/** 구간 종료 시: 사기, 질병 피해, 새 질병, 같은 업무 관계 */
export function processLifePeriod(state: GameState, starving: boolean): GameState {
  let s = state;
  let seed = s.seed;
  const access = computeAccess(s);
  const common = s.rooms.some((r) => access.roomAccess[r.id] && r.facilities.some((f) => FACILITY_BY_ID[f.type].restBonus > 0));
  // 조리대 가동 중이면 따뜻한 식사로 모두 사기 +1
  const kitchen = simulatePeriod(state).reports.some((r) => r.status === "running" && FACILITY_BY_ID[r.type].kitchen);
  const notes: string[] = [];

  for (const sv0 of state.survivors) {
    let sv = s.survivors.find((x) => x.id === sv0.id);
    if (!sv) continue;
    const resting = !sv.isPlayer && (sv.job === "rest" || sv.fatigue >= 100);
    // 사기
    let dm = resting ? L.restMorale + (common ? L.commonMorale : 0) : L.workMorale;
    if (starving) dm += L.starveMorale;
    else if (kitchen) dm += 1;
    if (sv.fatigue >= 100) dm += L.exhaustedMorale;
    if (sv.conditions.length) dm += L.conditionMorale;
    const { friend, rival } = closest(s, sv.id);
    if (friend) dm += L.friendMorale;
    if (rival) dm += L.rivalMorale;
    sv = changeMorale(sv, dm);
    // 질병: 구간마다 건강 감소
    const ill = sv.conditions.find((c) => c.kind === "illness");
    if (ill) sv = { ...sv, health: clamp(sv.health - Math.round(L.sickHealthLoss * ill.severity * hurtMultiplier(sv))) };
    s = update(s, sv.id, () => sv!);
    // 새 질병
    if (!ill) {
      let roll: number;
      [roll, seed] = nextRandom(seed);
      const weak = sv.health < 40 || sv.fatigue >= 90 ? 3 : 1;
      if (roll < L.sickChance * weak * traitProduct(sv, "sickChance")) {
        const r = addCondition({ ...s, seed }, sv.id, "illness", 1);
        s = r.state;
        notes.push(r.text);
      }
    }
  }
  s = { ...s, seed };
  for (const n of notes) s = log(s, n, "warn");

  // 같은 업무를 한 사람끼리 가까워진다
  const workers = s.survivors.filter((x) => !x.isPlayer && x.job !== "rest");
  for (let i = 0; i < workers.length; i++)
    for (let j = i + 1; j < workers.length; j++) if (workers[i].job === workers[j].job) s = addRel(s, workers[i].id, workers[j].id, L.sameJobBond);
  return s;
}

// ───────────── 하루 처리 ─────────────

function pickTwo(seed: number, list: Survivor[], weight: (s: Survivor) => number): [[Survivor, Survivor] | null, number] {
  if (list.length < 2) return [null, seed];
  let s = seed;
  let a: { w: Survivor; weight: number };
  [a, s] = pickWeighted(s, list.map((w) => ({ w, weight: weight(w) })));
  const rest = list.filter((x) => x.id !== a.w.id);
  let b: { w: Survivor; weight: number };
  [b, s] = pickWeighted(s, rest.map((w) => ({ w, weight: weight(w) })));
  return [[a.w, b.w], s];
}

/** 하루가 지날 때 (밤잠 뒤): 회복·악화, 침상 없는 밤, 떠남, 생존자 간 사건. 일어난 사건을 돌려준다 */
export function processLifeDay(state: GameState, bedsFor: number): { state: GameState; events: GameEvent[] } {
  let s = state;
  let seed = s.seed;
  const events: GameEvent[] = [];

  // 1) 회복·악화
  for (const sv0 of state.survivors) {
    let sv = s.survivors.find((x) => x.id === sv0.id)!;
    const resting = sv.isPlayer ? sv.fatigue < 50 : sv.job === "rest";
    const conditions: Condition[] = [];
    for (const c of sv.conditions) {
      let roll: number;
      [roll, seed] = nextRandom(seed);
      if (roll < (resting ? L.recoverRest : L.recoverWork)) {
        if (c.severity > 1) conditions.push({ ...c, severity: c.severity - 1 });
        else s = log(s, `${sv.isPlayer ? "내" : sv.name + "의"} ${conditionName(c)}이(가) 나았다.`);
      } else if (c.kind === "illness" && c.severity < 3) {
        [roll, seed] = nextRandom(seed);
        if (roll < L.worsenChance) {
          conditions.push({ ...c, severity: c.severity + 1 });
          s = log(s, `${sv.isPlayer ? "내" : sv.name + "의"} 병이 ${conditionName({ ...c, severity: c.severity + 1 })}(으)로 악화됐다.`, "warn");
        } else conditions.push(c);
      } else conditions.push(c);
    }
    sv = { ...sv, conditions };
    s = update(s, sv.id, () => sv);
  }

  // 2) 침상 없이 잔 사람 (뒤쪽 순서부터)
  s.survivors.forEach((sv, i) => {
    if (i >= bedsFor) s = update(s, sv.id, (x) => changeMorale(x, L.noBedMorale));
  });

  // 3) 사기가 바닥이면 떠난다
  const leaving: Survivor[] = [];
  for (const sv of s.survivors) {
    if (sv.isPlayer || sv.morale >= L.leaveMorale) continue;
    let roll: number;
    [roll, seed] = nextRandom(seed);
    if (roll < L.leaveChance) leaving.push(sv);
  }
  for (const sv of leaving) {
    s = { ...s, survivors: s.survivors.filter((x) => x.id !== sv.id) };
    const text = `${sv.name}은(는) 더는 버틸 이유를 찾지 못하고 밤사이 거점을 떠났다.`;
    s = log(s, text, "event");
    events.push({ id: "leave", title: "떠난 생존자", text, tone: "bad" });
  }

  // 4) 생존자 간 사건
  const people = s.survivors.filter((x) => !x.isPlayer);
  let roll: number;
  [roll, seed] = nextRandom(seed);
  if (people.length >= 1 && roll < L.socialEventChance) {
    const options = SOCIAL_EVENTS.filter((e) => {
      if (e.id === "quarrel" || e.id === "bonding") return people.length >= 2;
      if (e.id === "storyNight") return people.length >= 2;
      if (e.id === "contagion") return s.survivors.some((x) => isSick(x)) && s.survivors.some((x) => !isSick(x));
      if (e.id === "helping") return s.survivors.some((x) => x.conditions.length) && people.length >= 2;
      return false;
    });
    if (options.length) {
      let ev: (typeof SOCIAL_EVENTS)[number];
      [ev, seed] = pickWeighted(seed, options);
      s = { ...s, seed };
      let text = "";
      if (ev.id === "quarrel") {
        let pair: [Survivor, Survivor] | null;
        [pair, seed] = pickTwo(seed, people, (x) => traitProduct(x, "quarrel"));
        const [a, b] = pair!;
        s = addRel(s, a.id, b.id, -25);
        s = update(s, a.id, (x) => changeMorale(x, -6));
        s = update(s, b.id, (x) => changeMorale(x, -6));
        text = `${a.name}와(과) ${b.name}이(가) 배급 문제로 크게 다퉜다. 둘 사이가 나빠졌다.`;
      } else if (ev.id === "bonding") {
        let pair: [Survivor, Survivor] | null;
        [pair, seed] = pickTwo(seed, people, (x) => traitProduct(x, "bond"));
        const [a, b] = pair!;
        s = addRel(s, a.id, b.id, 20);
        s = update(s, a.id, (x) => changeMorale(x, 5));
        s = update(s, b.id, (x) => changeMorale(x, 5));
        text = `${a.name}와(과) ${b.name}이(가) 밤늦게까지 예전 이야기를 나눴다. 둘은 가까워졌다.`;
      } else if (ev.id === "storyNight") {
        const access = computeAccess(s);
        const common = s.rooms.some((r) => r.type === "common" && access.roomAccess[r.id]);
        const gain = common ? 8 : 4;
        s = { ...s, survivors: s.survivors.map((x) => changeMorale(x, gain)) };
        for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) s = addRel(s, people[i].id, people[j].id, 4);
        text = `모두 모여 앉아 이야기를 나눴다. 사기 +${gain}${common ? " (공동 생활실 덕분에 더 즐거웠다)" : ""}.`;
      } else if (ev.id === "contagion") {
        const sick = s.survivors.filter((x) => isSick(x));
        const healthy = s.survivors.filter((x) => !isSick(x));
        let i: number;
        [i, seed] = randomInt(seed, 0, healthy.length - 1);
        const r = addCondition({ ...s, seed }, healthy[i].id, "illness", 1);
        s = r.state;
        text = `${sick[0].isPlayer ? "내" : sick[0].name + "의"} 병이 옮았다. ${r.text}`;
      } else if (ev.id === "helping") {
        const patients = s.survivors.filter((x) => x.conditions.length);
        const p = patients[0];
        const helpers = people.filter((x) => x.id !== p.id);
        if (helpers.length) {
          let i: number;
          [i, seed] = randomInt(seed, 0, helpers.length - 1);
          const h = helpers[i];
          s = update(s, p.id, (x) => ({ ...x, conditions: x.conditions.map((c, j) => (j === 0 ? { ...c, severity: c.severity - 1 } : c)).filter((c) => c.severity > 0) }));
          s = addRel(s, h.id, p.id, 15);
          text = `${h.name}이(가) 밤새 ${p.isPlayer ? "나" : p.name}을(를) 돌봐 주었다. 상태가 나아졌고 둘은 가까워졌다.`;
        } else {
          s = update(s, p.id, (x) => changeMorale(x, 3));
          text = `${p.name}이(가) 혼자서도 꿋꿋이 버텼다.`;
        }
      }
      if (text) {
        s = log({ ...s, seed }, `[생존자 사건: ${ev.title}] ${text}`, "event");
        events.push({ id: ev.id, title: ev.title, text, tone: ev.tone });
      }
    }
  }
  return { state: { ...s, seed }, events };
}

// ───────────── 의약품 ─────────────

/** 외부 활동 중 의약품 발견 (5%, 하루 최대 2개) */
export function tryFindMedicine(state: GameState): { state: GameState; found: boolean } {
  const today = state.medicineFound.day === state.day ? state.medicineFound.count : 0;
  if (today >= MEDICINE.dailyMax) return { state, found: false };
  const [roll, seed] = nextRandom(state.seed);
  if (roll >= MEDICINE.findChance) return { state: { ...state, seed }, found: false };
  return {
    state: { ...state, seed, medicine: state.medicine + 1, medicineFound: { day: state.day, count: today + 1 } },
    found: true,
  };
}

export function canUseMedicine(state: GameState, survivorId: string): string | null {
  if (state.medicine <= 0) return "의약품이 없습니다.";
  const sv = state.survivors.find((x) => x.id === survivorId);
  if (!sv) return "생존자를 찾을 수 없습니다.";
  if (sv.health >= 100) return "이미 건강합니다.";
  return null;
}

export function useMedicine(state: GameState, survivorId: string): GameState {
  if (canUseMedicine(state, survivorId)) return state;
  const sv = state.survivors.find((x) => x.id === survivorId)!;
  const s = {
    ...state,
    medicine: state.medicine - 1,
    survivors: state.survivors.map((x) => (x.id === survivorId ? { ...x, health: Math.min(100, x.health + MEDICINE.heal) } : x)),
  };
  return log(s, `의약품을 써서 ${sv.isPlayer ? "내" : sv.name + "의"} 건강을 ${MEDICINE.heal} 회복했다. (남은 의약품 ${s.medicine})`, "build");
}

// ───────────── 사망 ─────────────

/** 건강이 0이 된 생존자는 세상을 떠난다. 남은 사람들의 사기가 1~5 떨어진다 (플레이어는 게임 오버로 따로 처리) */
export function processDeaths(state: GameState, mergeWithCurrentEvents: boolean): GameState {
  const dead = state.survivors.filter((x) => !x.isPlayer && x.health <= 0);
  if (!dead.length) return state;
  let s: GameState = { ...state, survivors: state.survivors.filter((x) => x.isPlayer || x.health > 0) };
  let seed = s.seed;
  const events: GameEvent[] = [];
  for (const d of dead) {
    s = {
      ...s,
      survivors: s.survivors.map((x) => {
        if (x.isPlayer) return x;
        let loss: number;
        [loss, seed] = randomInt(seed, DEATH_MORALE[0], DEATH_MORALE[1]);
        return { ...x, morale: Math.max(0, x.morale - loss) };
      }),
    };
    const text = `${d.name}이(가) 끝내 숨을 거두었다. 남은 사람들의 사기가 떨어졌다.`;
    s = log({ ...s, seed }, text, "warn");
    events.push({ id: "death", title: "생존자 사망", text, tone: "bad" });
  }
  s = { ...s, seed };
  return {
    ...s,
    events: mergeWithCurrentEvents ? { serial: s.events.serial, list: [...s.events.list, ...events] } : { serial: s.events.serial + 1, list: events },
  };
}
