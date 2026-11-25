// 생존자 데이터와 수치 (기획서 5장). 밸런스는 여기서 조정한다.
import type { ResourceId } from "../core/types";

export type SkillId = "tech" | "medic" | "gather" | "farm" | "manage";

export const SKILLS: { id: SkillId; name: string; desc: string; used: boolean }[] = [
  { id: "tech", name: "기술", desc: "발전기·기계 수리, 제작", used: true },
  { id: "gather", name: "채집", desc: "자원 수집, 식량 확보, 잔해 정리", used: true },
  { id: "medic", name: "의료", desc: "부상·질병 치료 ('치료' 업무)", used: true },
  { id: "farm", name: "농업", desc: "작물 재배 ('농사' 업무)", used: true },
  { id: "manage", name: "관리", desc: "경비 지휘 ('경비' 업무 방어력)", used: true },
];

export type JobId = "rest" | "debris" | "scavenge" | "forage" | "maintain" | "craft" | "heal" | "farm" | "guard";

export interface JobDef {
  id: JobId;
  name: string;
  skill: SkillId | null;
  desc: string;
  /** 거점 밖에서 하는 일 (야간 효율 감소) */
  outside: boolean;
  /** 구간당 무작위 획득량 (능력치 배율 적용 전) */
  yields?: Partial<Record<ResourceId, [number, number]>>;
}

export const JOBS: JobDef[] = [
  { id: "rest", name: "휴식", skill: null, desc: "쉬면서 피로를 푼다.", outside: false },
  { id: "debris", name: "잔해 정리", skill: "gather", desc: "지도에 '정리 지정'한 잔해를 구간마다 치운다 (능력치 4 이상이면 2칸).", outside: false },
  { id: "scavenge", name: "자원 수집", skill: "gather", desc: "폐허에서 자재와 부품을 모아 온다.", outside: true, yields: { materials: [2, 4], parts: [0, 1] } },
  { id: "forage", name: "식량 확보", skill: "gather", desc: "먹을 것과 물을 구해 온다.", outside: true, yields: { food: [1, 3], water: [0, 2] } },
  { id: "maintain", name: "시설 관리", skill: "tech", desc: "가장 많이 닳은 기계를 손봐 내구도를 회복시킨다.", outside: false },
  { id: "farm", name: "농사", skill: "farm", desc: "재배 시설 2곳을 돌봐 더 빨리 자라게 하고, 농업 능력치가 높을수록 수확량이 늘어난다.", outside: false },
  { id: "guard", name: "경비", skill: "manage", desc: "거점 입구를 지킨다. 습격 방어력 +7 (관리 능력치가 높으면 더).", outside: false },
  { id: "heal", name: "치료", skill: "medic", desc: "다치거나 아픈 사람을 돌본다. 의료실의 진료 침대·약품 선반이 있으면 더 잘 고친다.", outside: false },
  { id: "craft", name: "제작", skill: "tech", desc: "작업대에서 지정한 품목(부품·고체 연료·자재 재활용)을 만든다. 전력이 들어오는 작업대가 필요하다.", outside: false },
];

export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j])) as Record<JobId, JobDef>;

export const SURVIVOR_RULES = {
  /** 능력치(1~5)에 따른 작업 효율: 0.6 + 0.2 × 능력치 */
  skillBase: 0.6,
  skillStep: 0.2,
  /** 야간 외부 작업 효율 */
  nightOutsideRate: 0.6,

  /** 작업 1구간당 피로 증가 */
  workFatigue: 10,
  /** 휴식 1구간당 피로 감소 */
  restRecovery: 20,
  /** 플레이어가 행동 1회 할 때 피로 증가 */
  actionFatigue: 4,
  /** 밤잠(정비 시간 → 다음 날): 침상이 있으면 / 없으면 */
  sleepRecoveryBed: 40,
  sleepRecoveryNoBed: 15,
  /** 피로가 이 값 이상이면 작업 효율 절반 */
  tiredAt: 70,
  /** 피로 100이면 탈진: 일하지 못하고 건강이 줄어든다 */
  exhaustedHealthLoss: 5,

  /** 식량·식수를 배급받지 못한 구간마다 건강 감소 (자원별) */
  starvationHealthLoss: 8,
  /** 잘 먹고 쉰 구간의 건강 회복 */
  /** 처음부터 가진 침낭 (침상 1개로 친다) */
  baseBeds: 1,
  /** 능력치 숙련: 같은 업무를 (기본 + 능력치 × 배수) 구간 하면 능력치 +1 (업데이트 5) */
  xpBase: 4,
  xpPerLevel: 3,
  /** 쉬면(생존자 '휴식' 업무, 플레이어 '휴식' 행동) 이 확률로 건강 +1~5 */
  restHealChance: 0.6,
  restHealthGain: 5,
  /** 플레이어 '휴식' 행동: 피로 감소 */
  playerRestFatigue: 10,
  /** 밤잠: 이 확률로 건강 +1~2 (침상 / 바닥) */
  sleepHealChanceBed: 0.5,
  sleepHealChanceFloor: 0.25,
  /** 건강이 이 아래면 위독 */
  criticalHealth: 25,

  /** 시설 관리: 회복량 = 기본 + 능력치 × 배수 */
  maintainBase: 4,
  maintainPerSkill: 2,

  /** 생존자 수색 성공 확률 (낮 / 야간) */
  searchChance: 0.4,
  searchChanceNight: 0.25,
  /** 발견한 생존자는 며칠 안에 구조하지 않으면 떠난다 */
  foundExpireDays: 2,
};

export const NAMES = [
  "김도윤", "이서연", "박지호", "최하은", "정민재", "강수아", "조현우", "윤채원",
  "장태민", "임유진", "한승민", "오지안", "서도현", "신예린", "권재희", "황보람",
  "안시우", "송다인", "류건", "홍나래",
];

export const BACKGROUNDS: { text: string; skill: SkillId }[] = [
  { text: "지하철 정비 기사였다. 이 역의 배선을 기억한다.", skill: "tech" },
  { text: "전기 공사 현장에서 일했다.", skill: "tech" },
  { text: "응급실 간호사였다.", skill: "medic" },
  { text: "약국을 운영했다.", skill: "medic" },
  { text: "배달 일을 하며 도시 구석구석을 알았다.", skill: "gather" },
  { text: "등산 동호회에서 야영을 자주 했다.", skill: "gather" },
  { text: "도시 텃밭을 가꾸던 은퇴자다.", skill: "farm" },
  { text: "농업 기술 센터 연구원이었다.", skill: "farm" },
  { text: "물류 창고 관리자였다.", skill: "manage" },
  { text: "작은 식당을 운영했다.", skill: "manage" },
];
