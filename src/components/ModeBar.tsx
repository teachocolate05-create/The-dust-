"use client";

import { useState } from "react";
import { FACILITY_BY_ID } from "@/game/config/facilities";
import { ROOM_TYPE_BY_ID, ROOM_TYPES } from "@/game/config/rooms";
import { area } from "@/game/core/geometry";
import { isEmptyBundle } from "@/game/core/resources";
import type { Check, GameState, Rect, RoomTypeId } from "@/game/core/types";
import * as space from "@/game/systems/space";
import { canDoAction } from "@/game/systems/actions";
import type { GameAction } from "@/game/state/reducer";
import { CostTag } from "./Panels";
import type { Mode, Selection } from "./uiTypes";

interface Props {
  state: GameState;
  mode: Mode;
  check: Check | null;
  setMode: (m: Mode) => void;
  setSelection: (s: Selection) => void;
  run: (a: GameAction, msg?: string) => void;
}

// 지도 아래에 붙는 작업 안내 바. 현재 모드에서 할 일과 확인/취소 버튼을 보여준다.
export default function ModeBar({ state, mode, check, setMode, setSelection, run }: Props) {
  const [roomName, setRoomName] = useState("");
  if (mode.kind === "view") return null;
  const cancel = () => setMode({ kind: "view" });

  const result = check && (check.ok ? (
    <div className="mode-cost">
      {(!isEmptyBundle(check.cost) || isEmptyBundle(check.refund)) && (
        <CostTag bundle={check.cost} have={state.resources} label="비용" />
      )}
      {!isEmptyBundle(check.refund) && <CostTag bundle={check.refund} label="회수" />}
    </div>
  ) : (
    <div className="mode-error">{check.reason}</div>
  ));

  if (mode.kind === "createRoom") {
    const def = ROOM_TYPE_BY_ID[mode.roomType];
    return (
      <div className="mode-bar">
        <div className="mode-head">
          <span className="mode-title">방 만들기</span>
          <select
            className="input compact"
            value={mode.roomType}
            onChange={(e) => setMode({ ...mode, roomType: e.target.value as RoomTypeId })}
            aria-label="방 용도"
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (최소 {t.minShort}×{t.minLong})
              </option>
            ))}
          </select>
        </div>
        {!mode.rect ? (
          <p className="mode-hint">지도에서 드래그해 영역을 지정하세요. 모바일에서는 시작 칸과 끝 칸을 차례로 눌러도 됩니다.</p>
        ) : (
          <>
            <p className="mode-hint">
              {def.name} {mode.rect.w}×{mode.rect.h} ({area(mode.rect)}칸)
              {mode.rect.w === 1 && mode.rect.h === 1 && " — 끝 칸을 누르거나 드래그하세요."}
            </p>
            {result}
            {check?.ok && (
              <input
                className="input"
                placeholder={`방 이름 (비우면 자동: ${def.name} N)`}
                value={roomName}
                maxLength={14}
                onChange={(e) => setRoomName(e.target.value)}
              />
            )}
          </>
        )}
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!check?.ok || mode.dragging}
            onClick={() => {
              if (!mode.rect) return;
              run({ type: "CREATE_ROOM", rect: mode.rect, roomType: mode.roomType, name: roomName }, `${def.name}을(를) 만들었습니다.`);
              setRoomName("");
              setMode({ kind: "view" });
              const created = state.nextId; // 새 방 id는 nextId 기반
              setSelection({ kind: "room", roomId: `room${created}` });
            }}
          >
            건설
          </button>
          <button className="btn ghost" onClick={cancel}>
            취소
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === "placeFacility" || mode.kind === "moveFacility") {
    const room = space.getRoom(state, mode.roomId);
    const type =
      mode.kind === "placeFacility" ? mode.facilityType : room?.facilities.find((f) => f.id === mode.facilityId)?.type;
    if (!room || !type) return null;
    const def = FACILITY_BY_ID[type];
    const confirm = () => {
      if (!mode.pos) return;
      if (mode.kind === "placeFacility")
        run({ type: "PLACE_FACILITY", roomId: room.id, facilityType: type, x: mode.pos.x, y: mode.pos.y, rotated: mode.rotated }, `${def.name}을(를) 설치했습니다.`);
      else {
        run({ type: "MOVE_FACILITY", roomId: room.id, facilityId: mode.facilityId, x: mode.pos.x, y: mode.pos.y, rotated: mode.rotated }, `${def.name}을(를) 옮겼습니다.`);
        setMode({ kind: "view" });
      }
    };
    return (
      <div className="mode-bar">
        <div className="mode-head">
          <span className="mode-title">{mode.kind === "placeFacility" ? "시설 설치" : "시설 이동"}</span>
          <span>
            {def.name} → {room.name}
          </span>
        </div>
        <p className="mode-hint">
          {room.name} 안을 눌러 위치를 정하세요. 같은 칸을 한 번 더 누르면 {mode.kind === "placeFacility" ? "설치" : "이동"}됩니다.
          {mode.kind === "placeFacility" && " 연속으로 설치할 수 있습니다."}
        </p>
        {mode.pos && result}
        <div className="btn-row">
          <button className="btn" onClick={() => setMode({ ...mode, rotated: !mode.rotated })}>
            회전 ⟳
          </button>
          <button className="btn primary" disabled={!check?.ok} onClick={confirm}>
            {mode.kind === "placeFacility" ? "설치" : "이동"}
          </button>
          <button className="btn ghost" onClick={cancel}>
            {mode.kind === "placeFacility" ? "완료" : "취소"}
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === "clearDebris") {
    const chk = mode.pos ? canDoAction(state, "clearDebris", { kind: "debris", pos: mode.pos }) : null;
    return (
      <div className="mode-bar">
        <div className="mode-head">
          <span className="mode-title">잔해 정리</span>
          <span className="muted">행동 1회 · 남은 행동 {state.actionsLeft}</span>
        </div>
        <p className="mode-hint">치울 잔해를 누르세요(누른 칸부터 오른쪽·아래 2×2). 같은 칸을 한 번 더 누르면 바로 정리합니다.</p>
        {chk && (chk.ok ? <div className="mode-cost small-text">{chk.preview}</div> : <div className="mode-error">{chk.reason}</div>)}
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!chk?.ok}
            onClick={() => {
              if (!mode.pos) return;
              run({ type: "DO_ACTION", actionId: "clearDebris", target: { kind: "debris", pos: mode.pos } });
              setMode({ kind: "clearDebris", pos: null });
            }}
          >
            정리
          </button>
          <button className="btn ghost" onClick={cancel}>
            완료
          </button>
        </div>
      </div>
    );
  }

  // resizeRoom
  const room = space.getRoom(state, mode.roomId);
  if (!room) return null;
  const r = mode.rect;
  const adjust = (edge: "top" | "bottom" | "left" | "right", delta: number) => {
    let n: Rect = { ...r };
    if (edge === "top") n = { ...r, y: r.y - delta, h: r.h + delta };
    if (edge === "bottom") n = { ...r, h: r.h + delta };
    if (edge === "left") n = { ...r, x: r.x - delta, w: r.w + delta };
    if (edge === "right") n = { ...r, w: r.w + delta };
    if (n.w < 1 || n.h < 1) return;
    setMode({ ...mode, rect: n });
  };
  const edges: { id: "top" | "bottom" | "left" | "right"; label: string }[] = [
    { id: "top", label: "위쪽" },
    { id: "bottom", label: "아래쪽" },
    { id: "left", label: "왼쪽" },
    { id: "right", label: "오른쪽" },
  ];
  return (
    <div className="mode-bar">
      <div className="mode-head">
        <span className="mode-title">크기 변경</span>
        <span>
          {room.name}: {room.rect.w}×{room.rect.h} → <b>{r.w}×{r.h}</b>
        </span>
      </div>
      <div className="edge-grid">
        {edges.map((e) => (
          <div key={e.id} className="edge-ctl">
            <span>{e.label}</span>
            <button className="btn small" onClick={() => adjust(e.id, -1)} aria-label={`${e.label} 축소`}>
              −
            </button>
            <button className="btn small" onClick={() => adjust(e.id, 1)} aria-label={`${e.label} 확장`}>
              +
            </button>
          </div>
        ))}
      </div>
      {result}
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!check?.ok}
          onClick={() => {
            run({ type: "RESIZE_ROOM", roomId: room.id, rect: r }, "방 크기를 바꿨습니다.");
            setMode({ kind: "view" });
          }}
        >
          적용
        </button>
        <button className="btn ghost" onClick={() => setMode({ ...mode, rect: { ...room.rect } })}>
          되돌리기
        </button>
        <button className="btn ghost" onClick={cancel}>
          취소
        </button>
      </div>
    </div>
  );
}
