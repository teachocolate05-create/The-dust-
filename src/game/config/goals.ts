// 업데이트 5: 장기 생존 목표. 마지막 목표 '독립 생존 거점'을 이루면 거점이 완성된다 (계속 플레이 가능).

export interface GoalDef {
  id: string;
  name: string;
  desc: string;
  /** 최종 목표의 조건 중 하나인지 */
  final?: boolean;
}

export const GOALS: GoalDef[] = [
  { id: "firstLight", name: "첫 불빛", desc: "발전기 전력으로 시설 하나를 가동한다." },
  { id: "companion", name: "동료", desc: "생존자 1명을 거점에 받아들인다." },
  { id: "zone", name: "영역 확장", desc: "봉쇄된 구역 하나를 개방한다." },
  { id: "harvest", name: "첫 수확", desc: "재배 시설에서 작물을 수확한다." },
  { id: "surface", name: "지상으로", desc: "원정대가 돌아온다." },
  { id: "defended", name: "굳건한 방어", desc: "약탈단의 습격을 막아 낸다." },
  { id: "community", name: "공동체", desc: "거점 인원 5명.", },
  { id: "deep", name: "깊은 곳으로", desc: "지하 2층을 개방한다." },
  { id: "population", name: "작은 도시", desc: "거점 인원 8명.", final: true },
  { id: "selfFood", name: "자급자족", desc: "한 구간의 식량 생산이 소비 이상이다.", final: true },
  { id: "power", name: "안정된 전력", desc: "전력망 발전량 합계 30 이상.", final: true },
  { id: "allZones", name: "역 전체 복구", desc: "모든 구역을 개방한다.", final: true },
  { id: "days20", name: "20일 생존", desc: "20일차를 맞는다.", final: true },
];

export const CITY_GOAL = {
  id: "city",
  name: "독립 생존 거점",
  desc: "'작은 도시'·'자급자족'·'안정된 전력'·'역 전체 복구'·'20일 생존'을 모두 이룬다. 폐쇄된 환승역이 하나의 독립된 생존 거점이 된다.",
};
