import type { FacilityTypeId, Point, Rect, RoomTypeId } from "@/game/core/types";

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
  | { kind: "resizeRoom"; roomId: string; rect: Rect };

export type Tab = "base" | "build" | "resources" | "log" | "survivors" | "network";
