// 수치 조정용 설정 파일. 밸런스를 바꾸고 싶다면 여기 숫자만 수정하면 된다.

export const RULES = {
  /** 구간당 최대 행동 횟수 */
  actionsPerPhase: 3,

  /** 한 사람이 한 구간(오전·오후·야간)마다 소비하는 양 */
  upkeepPerPerson: { food: 1, water: 1 },
  /** 남은 양이 이 구간 수 이하로 버티면 경고 */
  lowStockPeriods: 3,

  facility: {
    /** 내구도 비율에 따른 효율: [이 비율 이상, 효율] 위에서부터 검사 */
    efficiencySteps: [
      [0.5, 1],
      [0.25, 0.75],
      [0.01, 0.5],
    ] as [number, number][],
    /** 내구도가 이 비율 미만이면 구간마다 고장 위험 */
    riskBelow: 0.25,
    /** 고장 위험 구간에서 실제로 고장 날 확률 */
    breakdownChance: 0.2,
    /** 정비 시간 수리: 부품 1개당 회복하는 내구도 */
    repairPerPart: 20,
  },

  network: {
    /** 칸당 설치 비용 */
    lineCost: {
      power: { materials: 1 },
      water: { materials: 2 },
    },
    /** 급수원 1곳이 구간마다 공급하는 원수 */
    sourceOutput: 8,
  },

  room: {
    /** 방 1개를 만들 때 기본 자재 */
    baseMaterials: 4,
    /** 방 면적 1칸당 자재 */
    materialsPerTile: 1,
    /** 방 최대 면적 (칸) */
    maxArea: 48,
    /** 방 용도 변경 비용 (자재) */
    changeTypeMaterials: 2,
    /** 방 이름 최대 글자 수 */
    maxNameLength: 14,
  },

  /** 철거·축소 시 돌려받는 비율 */
  refundRate: 0.5,

  /** 기록 최대 보관 개수 */
  maxLogEntries: 120,
};
