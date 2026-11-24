// 확장 구역 (업데이트 1: 거점 확장). 처음에는 봉쇄된 셔터(S)로 막혀 있다.
// 정비 시간에 셔터 앞까지 길을 뚫고 자원을 써서 '구역 개방'을 하면 셔터가 열린다.
import type { Point, Rect, ResourceBundle } from "../core/types";

export interface ZoneDef {
  id: string;
  name: string;
  desc: string;
  /** 구역 범위 (열기 전에는 안개로 가려진다) */
  rect: Rect;
  /** 열리는 셔터 칸 */
  gates: Point[];
  cost: ResourceBundle;
  /** 먼저 열어야 하는 구역 */
  requires?: string;
  /** 구역 안에서 볼 수 있는 것 (화면 안내용) */
  hint: string;
}

export const ZONES: ZoneDef[] = [
  {
    id: "east",
    name: "동쪽 대합실",
    desc: "환승 통로 너머의 넓은 대합실. 무너진 천장 잔해로 가득하다.",
    rect: { x: 30, y: 1, w: 15, h: 10 },
    gates: [
      { x: 29, y: 4 },
      { x: 29, y: 5 },
    ],
    cost: { materials: 15, parts: 3 },
    hint: "잔해 너머에 버려진 자재 창고가 있다는 소문이 있다.",
  },
  {
    id: "southeast",
    name: "동쪽 정비 구역",
    desc: "2호선 선로 옆 정비 통로. 두 번째 급수원이 있다.",
    rect: { x: 30, y: 12, w: 15, h: 4 },
    gates: [
      { x: 37, y: 11 },
      { x: 38, y: 11 },
    ],
    cost: { materials: 25, parts: 8 },
    requires: "east",
    hint: "선로 옆 바닥은 방을 짓기 좋고, 끝에 급수원이 있다.",
  },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, ZoneDef>;
