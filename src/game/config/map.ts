import type { TileType } from "../core/types";

// ─────────────────────────────────────────────────────────────
// 시작 맵: 폐쇄된 지하철 환승역 (대합실 + 승강장)
// 한 글자 = 타일 1칸. 모든 줄의 길이가 같아야 한다.
//
//   #  암반·외벽        .  바닥(건설 가능)    d  잔해(정리 필요)
//   P  구조 기둥        =  승강장(통행만)      T  선로
//   E  지상 출입구      W  급수원
// ─────────────────────────────────────────────────────────────
export const STATION_LAYOUT: string[] = [
  "##############EE##############",
  "#dddd...................ddddd#",
  "#dddd...................ddddd#",
  "#......P......P......P.......#",
  "#............................#",
  "#............................#",
  "#ddd.........................#",
  "#ddd...P......P......P.......#",
  "#ddd.....................dddd#",
  "#W.......................dddd#",
  "#........................dddd#",
  "#............................#",
  "#============================#",
  "#============================#",
  "#TTTTTTTTTTTTTTTTTTTTTTTTTTTT#",
  "#TTTTTTTTTTTTTTTTTTTTTTTTTTTT#",
  "##############################",
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
    desc: "무너진 구조물이 쌓여 있습니다. 정리 전에는 사용할 수 없습니다. (잔해 정리: 2단계 행동 시스템에서 구현 예정)",
  },
  pillar: { name: "구조 기둥", desc: "역사를 지탱하는 기둥입니다. 철거할 수 없습니다." },
  platform: { name: "승강장", desc: "통로로 쓸 수 있지만 방을 지을 수는 없습니다." },
  track: { name: "선로", desc: "운행이 멈춘 선로입니다. 사용할 수 없습니다." },
  entrance: { name: "지상 출입구", desc: "지상으로 이어지는 계단입니다. 모든 통로는 여기서 시작됩니다." },
  watersource: {
    name: "급수원",
    desc: "지하수 배관입니다. 4단계 수도망에서 정수실과 연결할 예정입니다.",
  },
};
