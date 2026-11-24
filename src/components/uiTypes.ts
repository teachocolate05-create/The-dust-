import type { FacilityTypeId, NetKind, Point, Rect, RoomTypeId } from "@/game/core/types";

// 화면 전용 상태 (게임 저장 데이터에는 포함되지 않는다)

export type Selection =
  | { kind: "room"; roomId: string }
  | { kind: "facility"; roomId: string; facilityId: string }
  | { kind: "tile"; x: number; y: number }
  | null;

export type Mode =
  | { kind: "view" }
  | { kind: "createRoom"; roomType: RoomTypeId; anchor: Point | null; rect: Rect | null; dragging: boolean }
  | { kind: "placeFacility"; roomId: string; facilityType: FacilityTypeId; pos: Point | null; rotated: boolean }
  | { kind: "moveFacility"; roomId: string; facilityId: string; pos: Point | null; rotated: boolean }
  | { kind: "resizeRoom"; roomId: string; rect: Rect }
  | { kind: "clearDebris"; pos: Point | null }
  | { kind: "markDebris"; remove: boolean; anchor: Point | null; rect: Rect | null; dragging: boolean }
  | { kind: "drawLine"; net: NetKind; remove: boolean; anchor: Point | null; path: Point[] | null; dragging: boolean };

/** 지도에 그릴 선 상태: ok = 정상, dead = 공급원 없음 */
export type LineView = Record<NetKind, Map<string, "ok" | "dead">>;

export type Tab = "base" | "actions" | "build" | "resources" | "log" | "survivors" | "network";

/** 확인 창 요청 (브라우저 기본 confirm 대신 게임 안 대화상자 사용) */
export type AskFn = (text: string, onYes: () => void, yesLabel?: string) => void;
