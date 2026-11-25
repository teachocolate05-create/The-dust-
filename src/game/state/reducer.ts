import type { FacilityTypeId, GameState, NetKind, Point, Rect, RoomTypeId } from "../core/types";
import type { ActionId } from "../config/actions";
import * as actions from "../systems/actions";
import * as space from "../systems/space";
import * as time from "../systems/time";
import * as operation from "../systems/operation";
import * as network from "../systems/network";
import { checkGameOver } from "../systems/events";
import { updateGoals } from "../systems/goals";
import { openZone } from "../systems/zones";
import * as world from "../systems/world";
import type { FactionId, RegionId } from "../config/world";
import * as survivors from "../systems/survivors";
import type { JobId } from "../config/survivors";
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
  | { type: "REPAIR_FACILITY"; roomId: string; facilityId: string }
  | { type: "BUILD_LINES"; net: NetKind; path: Point[] }
  | { type: "REMOVE_LINES"; net: NetKind; path: Point[] }
  | { type: "SET_JOB"; survivorId: string; job: JobId }
  | { type: "ACCEPT_SURVIVOR"; index: number }
  | { type: "DISMISS_SURVIVOR"; index: number }
  | { type: "MARK_DEBRIS"; points: Point[]; on: boolean }
  | { type: "OPEN_ZONE"; zoneId: string }
  | { type: "SET_CRAFT_TARGET"; target: GameState["craftTarget"] }
  | { type: "SET_HEAL_TARGET"; survivorId: string; targetId: string | null }
  | { type: "SEND_EXPEDITION"; regionId: RegionId; memberIds: string[] }
  | { type: "TRADE"; factionId: FactionId; index: number }
  | { type: "GIFT"; factionId: FactionId }
  | { type: "CLINIC"; survivorId: string }
  | { type: "FEAST" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  // 게임 오버 후에는 새 게임·불러오기만 가능
  if (state.gameOver && action.type !== "NEW_GAME" && action.type !== "LOAD") return state;
  const next = applyAction(state, action);
  if (next === state) return state;
  // 저장 시설을 철거·용도 변경해 용량이 줄면 넘치는 자원은 버려진다.
  // (길이 막혀 창고에 못 가는 경우에는 버리지 않고, 새로 얻는 양만 막힌다)
  const shrink = action.type === "REMOVE_FACILITY" || action.type === "DELETE_ROOM" || action.type === "CHANGE_ROOM_TYPE";
  const checked = checkGameOver(shrink ? operation.enforceCapacity(next) : next);
  if (action.type === "NEW_GAME" || action.type === "LOAD") return checked;
  // 업데이트 5: 장기 목표 판정
  return updateGoals(checked, checked.events.serial !== state.events.serial);
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
    case "BUILD_LINES":
      return network.buildLines(state, action.net, action.path);
    case "REMOVE_LINES":
      return network.removeLines(state, action.net, action.path);
    case "SET_JOB":
      return survivors.setJob(state, action.survivorId, action.job);
    case "ACCEPT_SURVIVOR":
      return survivors.acceptSurvivor(state, action.index);
    case "DISMISS_SURVIVOR":
      return survivors.dismissSurvivor(state, action.index);
    case "MARK_DEBRIS":
      return survivors.setDebrisMarks(state, action.points, action.on);
    case "OPEN_ZONE":
      return openZone(state, action.zoneId);
    case "SET_HEAL_TARGET":
      return {
        ...state,
        survivors: state.survivors.map((x) => (x.id === action.survivorId ? { ...x, healTarget: action.targetId ?? undefined } : x)),
      };
    case "SEND_EXPEDITION":
      return world.sendExpedition(state, action.regionId, action.memberIds);
    case "TRADE":
      return world.trade(state, action.factionId, action.index);
    case "GIFT":
      return world.gift(state, action.factionId);
    case "CLINIC":
      return world.clinic(state, action.survivorId);
    case "FEAST":
      return world.feast(state);
    case "SET_CRAFT_TARGET":
      return state.craftTarget === action.target ? state : { ...state, craftTarget: action.target };
  }
}
