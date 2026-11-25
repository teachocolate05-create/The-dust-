import type { TileType } from "../core/types";

// ─────────────────────────────────────────────────────────────
// 시작 맵: 폐쇄된 지하철 환승역 (대합실 + 승강장)
// 출입구 바로 아래 2×2만 정리되어 있고 대합실은 모두 잔해다.
// 급수원·비상 발전실·옛 창고는 새 게임마다 대합실 안 임의의 위치에 놓인다 (state/initialState.ts).
// 처음에는 정리된 2×2와 그 주변 한 칸만 보이고, 길을 뚫을수록 시야가 넓어진다 (systems/vision.ts).
// 한 글자 = 타일 1칸. 모든 줄의 길이가 같아야 한다.
//
//   #  암반·외벽        .  바닥(건설 가능)    d  잔해(정리 필요)
//   P  구조 기둥        =  승강장(통행만)      T  선로
//   E  지상 출입구      W  급수원             S  봉쇄된 셔터 (구역 개방으로 열림)
//
// 30열부터 오른쪽은 확장 구역이다 (config/zones.ts). 처음에는 셔터로 막혀 있다.
// 17행부터 아래는 지하 2층이다 (업데이트 5). 승강장 왼쪽 끝의 점검 통로와 셔터로 내려간다.
// ─────────────────────────────────────────────────────────────
export const STATION_LAYOUT: string[] = [
  "##############EE##############################",
  "#ddddddddddddd..ddddddddddddd#ddddddddddddddd#",
  "#ddddddddddddd..ddddddddddddd#ddddddddddddddd#",
  "#ddddddPdddddddddddddPddddddd#ddddPddddddPddd#",
  "#ddddddddddddddddddddddddddddSdddddd...dddddd#",
  "#ddddddddddddddddddddddddddddSdddddd...dddddd#",
  "#dddddddddddddddddddddddddddd#ddddddddddddddd#",
  "#ddddddPddddddPddddddPddddddd#ddddPddddddPddd#",
  "#dddddddddddddddddddddddddddd#ddddddddddddddd#",
  "#dddddddddddddddddddddddddddd#ddddddddddddddd#",
  "#dddddddddddddddddddddddddddd#ddddddddddddddd#",
  "#dddddddddddddddddddddddddddd########SS#######",
  "#============================#d..d..d..d..d.W#",
  "#============================#..d..d..d..d..d#",
  "#TT.TTTTTTTTTTTTTTTTTTTTTTTTT#TTTTTTTTTTTTTTT#",
  "#TT.TTTTTTTTTTTTTTTTTTTTTTTTT#TTTTTTTTTTTTTTT#",
  "###S##########################################",
  "#d...ddddddddddddddddd#dddddddddddddddddddddd#",
  "#d...ddddddddddddddddd#dddddddddddddddddddddd#",
  "#dddd.....dddddddddddd#ddddddddddddddddddddWd#",
  "#dddd.....dddPddddPddd#ddddPd.....P.....dPddd#",
  "#dddd.....ddddddddddddSdddddd.....d.....ddddd#",
  "#dddd.....ddddddddddddSdddddd.....d.....ddddd#",
  "#ddddddddddddddddddddd#dddddd.....d.....ddddd#",
  "#ddddddddddddPddddPddd#ddddPd.....P.....dPddd#",
  "#ddddddddddddddddddddd#ddddddddddddddddddddWd#",
  "#ddddddddddddddddddddd#dddddddddddddddddddddd#",
  "#ddddddddddddddddddddd#dddddddddddddddddddddd#",
  "##############################################",
];

const CHAR_TO_TILE: Record<string, TileType> = {
  "#": "rock",
  ".": "floor",
  d: "debris",
  P: "pillar",
  "=": "platform",
  T: "track",
  E: "entrance",
  W: "watersource",
  S: "sealed",
};

export function parseLayout(layout: string[]): TileType[][] {
  const width = layout[0].length;
  return layout.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`맵 ${y}번째 줄의 길이(${row.length})가 첫 줄(${width})과 다릅니다.`);
    }
    return [...row].map((ch, x) => {
      const t = CHAR_TO_TILE[ch];
      if (!t) throw new Error(`맵 (${x},${y})에 알 수 없는 문자 '${ch}'`);
      return t;
    });
  });
}

export const TILE_INFO: Record<TileType, { name: string; desc: string }> = {
  rock: { name: "암반·외벽", desc: "단단한 암반입니다. 사용할 수 없습니다." },
  floor: { name: "바닥", desc: "정리된 공간입니다. 방을 만들 수 있습니다." },
  debris: {
    name: "잔해",
    desc: "무너진 구조물이 쌓여 있습니다. 낮 구간에 '잔해 정리' 행동으로 치우면 바닥이 됩니다.",
  },
  pillar: { name: "구조 기둥", desc: "역사를 지탱하는 기둥입니다. 철거할 수 없습니다." },
  platform: { name: "승강장", desc: "통로로 쓸 수 있지만 방을 지을 수는 없습니다." },
  track: { name: "선로", desc: "운행이 멈춘 선로입니다. 사용할 수 없습니다." },
  entrance: { name: "지상 출입구", desc: "지상으로 이어지는 계단입니다. 모든 통로는 여기서 시작됩니다." },
  sealed: {
    name: "봉쇄된 셔터",
    desc: "녹슨 방화 셔터가 내려져 있다. 너머에 다른 구역이 있다. 정비 시간에 '구역 개방'으로 열 수 있다.",
  },
  watersource: {
    name: "급수원",
    desc: "지하수 배관입니다. 4단계 수도망에서 정수실과 연결할 예정입니다.",
  },
};
