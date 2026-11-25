import type { RoomTypeId } from "../core/types";

export interface RoomTypeDef {
  id: RoomTypeId;
  name: string;
  /** 최소 크기 (가로·세로 방향은 자유. 짧은 변 >= minShort, 긴 변 >= minLong) */
  minShort: number;
  minLong: number;
  desc: string;
  /** 지도 표시 색 */
  color: string;
}

// MVP 방 5종
export const ROOM_TYPES: RoomTypeDef[] = [
  { id: "residence", name: "거주실", minShort: 2, minLong: 2, color: "#7a8f6a", desc: "생존자가 잠을 자고 쉬는 공간입니다." },
  { id: "storage", name: "창고", minShort: 2, minLong: 2, color: "#9a8256", desc: "식량·자재·부품을 보관합니다." },
  { id: "power", name: "발전실", minShort: 3, minLong: 3, color: "#b9853a", desc: "발전기를 설치해 전력을 생산합니다." },
  { id: "water", name: "정수실", minShort: 2, minLong: 3, color: "#4f8a9a", desc: "급수원에서 끌어온 물을 정수합니다." },
  { id: "workshop", name: "작업실", minShort: 2, minLong: 3, color: "#8a6a8f", desc: "물품 제작과 수리 작업을 합니다." },
  { id: "guard", name: "경비실", minShort: 2, minLong: 2, color: "#8a5a4a", desc: "약탈단의 습격을 막습니다. 바리케이드·감시 초소와 '경비' 업무로 방어력을 올립니다." },
  { id: "farm", name: "농업실", minShort: 2, minLong: 3, color: "#6f9a4a", desc: "작물과 버섯을 길러 식량을 스스로 만듭니다." },
  { id: "medical", name: "의료실", minShort: 2, minLong: 3, color: "#c0c8d0", desc: "다치거나 아픈 사람을 치료합니다. '치료' 업무와 함께 씁니다." },
  { id: "common", name: "공동 생활실", minShort: 3, minLong: 3, color: "#b0705a", desc: "함께 밥을 먹고 쉬는 공간. 쉬는 생존자가 더 빨리 회복합니다." },
];

export const ROOM_TYPE_BY_ID = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r])) as Record<RoomTypeId, RoomTypeDef>;
