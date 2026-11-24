// 수치 조정용 설정 파일. 밸런스를 바꾸고 싶다면 여기 숫자만 수정하면 된다.

export const RULES = {
  /** 구간당 최대 행동 횟수 (2단계에서 사용) */
  actionsPerPhase: 3,

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
