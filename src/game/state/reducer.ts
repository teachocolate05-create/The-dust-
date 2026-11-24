import type { FacilityTypeId, GameState, Rect, RoomTypeId } from "../core/types";
import type { ActionId } from "../config/actions";
import * as actions from "../systems/actions";
import * as space from "../systems/space";
import * as time from "../systems/time";
import * as operation from "../systems/operation";
import { createInitialState } from "./initialState";

// 게임 상태를 바꾸는 유일한 통로. UI는 이 액션만 보낸다.
// 각 액션은 systems의 순수 함수에 위임하며, 규칙에 맞지 않으면 상태가 그대로 유지된다.

export type GameAction =
  | { type: "NEW_GAME" }
  | { type: "LOAD"; state: GameState }
  | { type: "CREATE_ROOM"; rect: Rect; roomType: RoomTypeId; name?: string }
  | { type: "RESIZE_ROOM"; roomId: string; rect: Rect }
  | { type: "DELETE_ROOM"; roomId: string }
  | { type: "RENAME_ROOM"; roomId: string; name: string }
  | { type: "CHANGE_ROOM_TYPE"; roomId: string; roomType: RoomTypeId }
  | { type: "PLACE_FACILITY"; roomId: string; facilityType: FacilityTypeId; x: number; y: number; rotated: boolean }
  | { type: "MOVE_FACILITY"; roomId: string; facilityId: string; x: number; y: number; rotated: boolean }
  | { type: "REMOVE_FACILITY"; roomId: string; facilityId: string }
  | { type: "DO_ACTION"; actionId: ActionId; target?: actions.ActionTarget }
  | { type: "END_PHASE" }
  | { type: "START_NEXT_DAY" }
  | { type: "TOGGLE_FACILITY"; roomId: string; facilityId: string }
  | { type: "REPAIR_FACILITY"; roomId: string; facilityId: string };

export function gameReducer(state: GameState, action: GameAction): GameState {
  const next = applyAction(state, action);
  // 창고 철거 등으로 저장 용량이 줄면 넘치는 자원은 버려진다
  return next === state ? state : operation.enforceCapacity(next);
}

function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return createInitialState();
    case "LOAD":
      return action.state;
    case "CREATE_ROOM":
      return space.createRoom(state, action.rect, action.roomType, action.name);
    case "RESIZE_ROOM":
      return space.resizeRoom(state, action.roomId, action.rect);
    case "DELETE_ROOM":
      return space.deleteRoom(state, action.roomId);
    case "RENAME_ROOM":
      return space.renameRoom(state, action.roomId, action.name);
    case "CHANGE_ROOM_TYPE":
      return space.changeRoomType(state, action.roomId, action.roomType);
    case "PLACE_FACILITY":
      return space.placeFacility(state, action.roomId, action.facilityType, action.x, action.y, action.rotated);
    case "MOVE_FACILITY":
      return space.moveFacility(state, action.roomId, action.facilityId, action.x, action.y, action.rotated);
    case "REMOVE_FACILITY":
      return space.removeFacility(state, action.roomId, action.facilityId);
    case "DO_ACTION":
      return actions.doAction(state, action.actionId, action.target);
    case "END_PHASE":
      return time.endPhase(state);
    case "START_NEXT_DAY":
      return time.startNextDay(state);
    case "TOGGLE_FACILITY":
      return operation.toggleFacility(state, action.roomId, action.facilityId);
    case "REPAIR_FACILITY":
      return operation.repairFacility(state, action.roomId, action.facilityId);
  }
}
