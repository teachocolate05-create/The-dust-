// 업데이트 2: 생존자 생활 — 성격·특성, 부상·질병, 사기, 관계, 생존자 간 사건.
// 수치는 모두 여기서 조정한다.

import type { TraitId } from "../core/types";
export type { TraitId };

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  /** 같은 그룹의 특성은 함께 가질 수 없다 */
  group: string;
  /** 작업 효율 배수 */
  work?: number;
  /** 기술 업무(시설 관리·제작·치료) 효율 배수 */
  techWork?: number;
  /** 외부 업무 효율 배수 */
  outsideWork?: number;
  /** 작업 1구간당 추가 피로 */
  fatigue?: number;
  /** 부상·질병 피해 배수 */
  hurt?: number;
  /** 질병에 걸릴 확률 배수 */
  sickChance?: number;
  /** 사기 감소 배수 / 사기 증가 배수 */
  moraleLoss?: number;
  moraleGain?: number;
  /** 관계 변화 배수 */
  bond?: number;
  /** 다툼에 끼일 가중치 */
  quarrel?: number;
}

export const TRAITS: TraitDef[] = [
  { id: "hardworking", name: "부지런함", group: "work", desc: "작업 효율 +15%, 대신 일하면 피로 +3", work: 1.15, fatigue: 3 },
  { id: "lazy", name: "게으름", group: "work", desc: "작업 효율 -15%, 일해도 피로가 덜 쌓임 (-3)", work: 0.85, fatigue: -3 },
  { id: "sturdy", name: "튼튼함", group: "body", desc: "부상·질병 피해 절반, 병에 잘 안 걸림", hurt: 0.5, sickChance: 0.5 },
  { id: "frail", name: "허약함", group: "body", desc: "병에 걸릴 확률 2배, 피해 1.5배", hurt: 1.5, sickChance: 2 },
  { id: "optimist", name: "낙천적", group: "mood", desc: "사기가 잘 오르고 덜 떨어짐", moraleGain: 1.5, moraleLoss: 0.6 },
  { id: "pessimist", name: "비관적", group: "mood", desc: "사기가 잘 떨어지고 덜 오름", moraleGain: 0.6, moraleLoss: 1.5 },
  { id: "social", name: "사교적", group: "social", desc: "다른 사람과 금방 친해짐 (관계 변화 2배, 좋은 쪽)", bond: 2, quarrel: 0.5 },
  { id: "grumpy", name: "까다로움", group: "social", desc: "다툼이 잦음", bond: 0.5, quarrel: 3 },
  { id: "handy", name: "손재주", group: "skill", desc: "시설 관리·제작·치료 효율 +25%", techWork: 1.25 },
  { id: "scout", name: "길눈 밝음", group: "skill", desc: "외부 업무 효율 +20%, 위협에 덜 다침", outsideWork: 1.2, hurt: 0.7 },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;

/** 부상·질병 이름 (심각도 1~3) */
export const CONDITIONS = {
  injury: ["찰과상", "발목 염좌", "깊은 상처"],
  illness: ["감기", "장염", "폐렴"],
};

/** 의약품: 외부 활동 중 가끔 발견, 쓰면 건강 회복 */
export const MEDICINE = {
  /** 외부 행동·원정 귀환 때 발견 확률 */
  findChance: 0.05,
  /** 하루에 찾을 수 있는 최대 개수 */
  dailyMax: 2,
  /** 한 번 쓰면 회복하는 건강 */
  heal: 5,
};

/** 생존자가 죽었을 때 남은 생존자 사기 감소 [최소, 최대] */
export const DEATH_MORALE: [number, number] = [1, 5];

export const LIFE_RULES = {
  // ── 부상·질병 ──
  /** 부상: 외부 업무·행동 불가(생존자), 작업 효율 배수 */
  injuredWork: 0.5,
  /** 질병: 작업 효율 배수, 구간마다 건강 감소 (심각도 × 값) */
  sickWork: 0.5,
  sickHealthLoss: 1,
  /** 플레이어 부상 시 외부 행동 획득량 배수 */
  playerInjuredYield: 0.7,
  /** 구간마다 병에 걸릴 기본 확률 (건강 40 미만 또는 피로 90 이상이면 3배) */
  sickChance: 0.02,
  /** 하루가 지날 때 쉬면 심각도가 줄어들 확률 / 일하면 */
  recoverRest: 0.6,
  recoverWork: 0.25,
  /** 치료받지 못한 질병이 악화될 확률 (하루) */
  worsenChance: 0.2,

  // ── 치료 ──
  /** 치료 업무: 구간마다 가장 심한 환자의 심각도를 1 줄일 확률 = 기본 + 의료 능력치 × 배수 (+ 진료 침대·약품 선반) */
  healBase: 0.15,
  healPerSkill: 0.1,
  healBedBonus: 0.15,
  healCabinetBonus: 0.1,

  // ── 사기 (0~100) ──
  startMorale: 60,
  /** 구간마다: 휴식 +, 작업 -, 배급 부족 -, 탈진 -, 병·부상 - */
  restMorale: 2,
  workMorale: -1,
  starveMorale: -8,
  exhaustedMorale: -4,
  conditionMorale: -2,
  /** 공동 생활실(식탁)이 있으면 쉬는 사람 추가 */
  commonMorale: 2,
  /** 침상 없이 잔 밤 */
  noBedMorale: -6,
  /** 사기에 따른 작업 효율 */
  lowMorale: 30,
  lowMoraleWork: 0.75,
  highMorale: 70,
  highMoraleWork: 1.1,
  /** 사기가 이 아래면 하루마다 떠날 수 있다 */
  leaveMorale: 15,
  leaveChance: 0.25,

  // ── 관계 (-100~100) ──
  /** 같은 업무를 한 구간마다 */
  sameJobBond: 3,
  friendAt: 40,
  rivalAt: -40,
  /** 친구·앙숙이 있으면 구간마다 사기 변화 */
  friendMorale: 1,
  rivalMorale: -2,

  // ── 생존자 간 사건 (하루가 지날 때) ──
  socialEventChance: 0.35,
};

export type SocialEventId = "quarrel" | "bonding" | "storyNight" | "contagion" | "helping";

export const SOCIAL_EVENTS: { id: SocialEventId; title: string; weight: number; tone: "good" | "bad" }[] = [
  { id: "quarrel", title: "다툼", weight: 10, tone: "bad" },
  { id: "bonding", title: "가까워진 두 사람", weight: 10, tone: "good" },
  { id: "storyNight", title: "이야기 모임", weight: 6, tone: "good" },
  { id: "contagion", title: "병이 옮았다", weight: 6, tone: "bad" },
  { id: "helping", title: "서로 돕기", weight: 6, tone: "good" },
];
