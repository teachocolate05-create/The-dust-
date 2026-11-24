"use client";

import { useEffect, useState } from "react";
import { FACILITY_BY_ID, facilitiesForRoom } from "@/game/config/facilities";
import { TILE_INFO } from "@/game/config/map";
import { RESOURCE_BY_ID, RESOURCES } from "@/game/config/resources";
import { ROOM_TYPE_BY_ID, ROOM_TYPES } from "@/game/config/rooms";
import { RULES } from "@/game/config/rules";
import { area } from "@/game/core/geometry";
import { isEmptyBundle } from "@/game/core/resources";
import type { GameState, ResourceBundle, ResourceId, Room, RoomTypeId } from "@/game/core/types";
import type { AccessInfo } from "@/game/systems/access";
import { PHASE_NAMES } from "@/game/systems/phase";
import * as space from "@/game/systems/space";
import type { GameAction } from "@/game/state/reducer";
import type { Mode, Selection } from "./uiTypes";

export function CostTag({ bundle, have, label }: { bundle: ResourceBundle; have?: GameState["resources"]; label?: string }) {
  if (isEmptyBundle(bundle)) return <span className="cost muted">{label ? `${label} 없음` : "무료"}</span>;
  return (
    <span className="cost">
      {label && <span className="cost-label">{label}</span>}
      {(Object.keys(bundle) as ResourceId[]).map((k) => {
        const short = have && have[k] < (bundle[k] ?? 0);
        return (
          <span key={k} className={`cost-item res-${k} ${short ? "short" : ""}`}>
            {RESOURCE_BY_ID[k].name} {bundle[k]}
          </span>
        );
      })}
    </span>
  );
}

interface PanelProps {
  state: GameState;
  access: AccessInfo;
  selection: Selection;
  setSelection: (s: Selection) => void;
  setMode: (m: Mode) => void;
  run: (a: GameAction, msg: string) => void;
  goBuild: () => void;
}

// ─────────────────── 거점 (선택 정보) ───────────────────

export function BasePanel(props: PanelProps) {
  const { state, selection } = props;
  if (selection?.kind === "room") {
    const room = space.getRoom(state, selection.roomId);
    if (room) return <RoomInfo {...props} room={room} />;
  }
  if (selection?.kind === "facility") {
    const room = space.getRoom(state, selection.roomId);
    const fac = room?.facilities.find((f) => f.id === selection.facilityId);
    if (room && fac) return <FacilityInfo {...props} room={room} facilityId={fac.id} />;
  }
  if (selection?.kind === "tile") {
    const t = state.map[selection.y][selection.x];
    const info = TILE_INFO[t];
    const corridor = props.access.corridor.has(`${selection.x},${selection.y}`);
    return (
      <div className="panel-body">
        <h3 className="panel-title">{info.name}</h3>
        <p className="muted">좌표 ({selection.x}, {selection.y})</p>
        <p>{info.desc}</p>
        {(t === "floor" || t === "platform") && (
          <p className={corridor ? "ok-text" : "warn-text"}>
            {corridor ? "출입구와 이어진 통로입니다." : "출입구와 끊긴 공간입니다."}
          </p>
        )}
        {t === "floor" && (
          <button className="btn" onClick={props.goBuild}>
            여기에 방 만들기 →
          </button>
        )}
        <button className="btn ghost" onClick={() => props.setSelection(null)}>
          선택 해제
        </button>
      </div>
    );
  }
  return <Overview {...props} />;
}

function Overview({ state, access, setSelection, goBuild }: PanelProps) {
  const facilityCount = state.rooms.reduce((n, r) => n + r.facilities.length, 0);
  const isolated = state.rooms.filter((r) => !access.roomAccess[r.id]);
  return (
    <div className="panel-body">
      <h3 className="panel-title">거점 현황</h3>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-val">{state.rooms.length}</span>
          <span className="stat-label">방</span>
        </div>
        <div className="stat">
          <span className="stat-val">{facilityCount}</span>
          <span className="stat-label">시설</span>
        </div>
        <div className="stat">
          <span className="stat-val">1</span>
          <span className="stat-label">인원</span>
        </div>
      </div>
      {isolated.length > 0 && (
        <div className="alert warn">
          통로와 끊긴 방 {isolated.length}개: {isolated.map((r) => r.name).join(", ")}
        </div>
      )}
      <p className="muted small-text">지도를 눌러 방·시설·타일을 선택하세요. 방은 통로(출입구와 이어진 바닥)와 맞닿아야 출입할 수 있습니다.</p>
      <h4 className="section-title">방 목록</h4>
      <ul className="list">
        {state.rooms.map((r) => (
          <li key={r.id}>
            <button className="list-item" onClick={() => setSelection({ kind: "room", roomId: r.id })}>
              <span className="swatch" style={{ background: ROOM_TYPE_BY_ID[r.type].color }} />
              <span className="grow">{r.name}</span>
              <span className="muted">
                {ROOM_TYPE_BY_ID[r.type].name} · {r.rect.w}×{r.rect.h}
              </span>
              {!access.roomAccess[r.id] && <span className="badge badge-warn">고립</span>}
            </button>
          </li>
        ))}
      </ul>
      <button className="btn primary" onClick={goBuild}>
        건설 메뉴 열기
      </button>
    </div>
  );
}

function RoomInfo({ state, access, room, setSelection, setMode, run, goBuild }: PanelProps & { room: Room }) {
  const def = ROOM_TYPE_BY_ID[room.type];
  const [name, setName] = useState(room.name);
  const [newType, setNewType] = useState<RoomTypeId>(room.type);
  useEffect(() => {
    setName(room.name);
    setNewType(room.type);
  }, [room.id, room.name, room.type]);

  const rename = space.canRenameRoom(state, room.id, name);
  const change = space.canChangeRoomType(state, room.id, newType);
  const del = space.canDeleteRoom(state, room.id);
  const beds = room.facilities.reduce((n, f) => n + FACILITY_BY_ID[f.type].beds, 0);
  const ok = access.roomAccess[room.id];

  return (
    <div className="panel-body">
      <div className="panel-title-row">
        <span className="swatch big" style={{ background: def.color }} />
        <div>
          <h3 className="panel-title">{room.name}</h3>
          <p className="muted">
            {def.name} · {room.rect.w}×{room.rect.h} ({area(room.rect)}칸)
          </p>
        </div>
      </div>
      <p className="small-text">{def.desc}</p>
      <div className={`alert ${ok ? "ok" : "warn"}`}>
        {ok ? "출입 가능 — 통로와 연결되어 있습니다." : "고립됨 — 통로와 맞닿아 있지 않아 출입할 수 없습니다."}
      </div>
      {room.type === "residence" && <p className="small-text">침상 {beds}개 (수용 인원 계산은 5단계에서 적용)</p>}

      <h4 className="section-title">시설 ({room.facilities.length})</h4>
      {room.facilities.length === 0 ? (
        <p className="muted small-text">설치된 시설이 없습니다.</p>
      ) : (
        <ul className="list">
          {room.facilities.map((f) => (
            <li key={f.id}>
              <button
                className="list-item"
                onClick={() => setSelection({ kind: "facility", roomId: room.id, facilityId: f.id })}
              >
                <span className="grow">{FACILITY_BY_ID[f.type].name}</span>
                <span className="muted">내구도 {f.durability}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={goBuild}>
          시설 설치
        </button>
        <button className="btn" onClick={() => setMode({ kind: "resizeRoom", roomId: room.id, rect: { ...room.rect } })}>
          크기 변경
        </button>
      </div>

      <h4 className="section-title">이름 변경</h4>
      <div className="inline-form">
        <input
          className="input"
          value={name}
          maxLength={RULES.room.maxNameLength}
          onChange={(e) => setName(e.target.value)}
          aria-label="방 이름"
        />
        <button className="btn" disabled={!rename.ok} onClick={() => run({ type: "RENAME_ROOM", roomId: room.id, name }, "이름을 바꿨습니다.")}>
          변경
        </button>
      </div>

      <h4 className="section-title">용도 변경</h4>
      <div className="inline-form">
        <select className="input" value={newType} onChange={(e) => setNewType(e.target.value as RoomTypeId)} aria-label="방 용도">
          {ROOM_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={!change.ok}
          onClick={() => run({ type: "CHANGE_ROOM_TYPE", roomId: room.id, roomType: newType }, "용도를 바꿨습니다.")}
        >
          변경
        </button>
      </div>
      {newType !== room.type &&
        (change.ok ? <CostTag bundle={change.cost} have={state.resources} label="비용" /> : <p className="warn-text small-text">{change.reason}</p>)}

      <h4 className="section-title">철거</h4>
      {del.ok ? (
        <>
          <CostTag bundle={del.refund} label="회수" />
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm(`'${room.name}'을(를) 철거할까요?`)) {
                run({ type: "DELETE_ROOM", roomId: room.id }, "방을 철거했습니다.");
                setSelection(null);
              }
            }}
          >
            방 철거
          </button>
        </>
      ) : (
        <p className="muted small-text">{del.reason}</p>
      )}
      <button className="btn ghost" onClick={() => setSelection(null)}>
        선택 해제
      </button>
    </div>
  );
}

function FacilityInfo({ state, room, facilityId, setSelection, setMode, run }: PanelProps & { room: Room; facilityId: string }) {
  const fac = room.facilities.find((f) => f.id === facilityId)!;
  const def = FACILITY_BY_ID[fac.type];
  const r = space.facilityRect(fac);
  const remove = space.canRemoveFacility(state, room.id, fac.id);
  const pct = Math.round((fac.durability / def.maxDurability) * 100);

  const effects: { label: string; value: string; stage: number }[] = [];
  if (def.power > 0) effects.push({ label: "전력 생산", value: `+${def.power}`, stage: 4 });
  if (def.power < 0) effects.push({ label: "전력 소비", value: `${-def.power}`, stage: 4 });
  for (const k of Object.keys(def.produces) as ResourceId[])
    effects.push({ label: `${RESOURCE_BY_ID[k].name} 생산`, value: `+${def.produces[k]}/구간`, stage: 3 });
  for (const k of Object.keys(def.consumes) as ResourceId[])
    effects.push({ label: `${RESOURCE_BY_ID[k].name} 소비`, value: `${def.consumes[k]}/구간`, stage: 3 });
  if (def.beds) effects.push({ label: "침상", value: `${def.beds}`, stage: 5 });
  if (def.storage) effects.push({ label: "저장 용량", value: `+${def.storage}`, stage: 3 });

  return (
    <div className="panel-body">
      <h3 className="panel-title">{def.name}</h3>
      <p className="muted">
        {room.name} · 크기 {r.w}×{r.h}
        {def.fixed && " · 고정 설비"}
      </p>
      <p className="small-text">{def.desc}</p>
      <div className="meter">
        <div className="meter-label">
          <span>내구도</span>
          <span>
            {fac.durability}/{def.maxDurability}
          </span>
        </div>
        <div className="meter-track">
          <div className={`meter-fill ${pct > 60 ? "good" : pct > 30 ? "mid" : "bad"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small-text">내구도 감소·수리는 3단계에서 구현됩니다.</p>
      </div>
      {effects.length > 0 && (
        <>
          <h4 className="section-title">설비 성능</h4>
          <ul className="effect-list">
            {effects.map((e) => (
              <li key={e.label}>
                <span>{e.label}</span>
                <span className="grow" />
                <b>{e.value}</b>
                <span className="badge badge-todo">{e.stage}단계 적용</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!def.fixed ? (
        <>
          <div className="btn-row">
            <button className="btn" onClick={() => setMode({ kind: "moveFacility", roomId: room.id, facilityId: fac.id, pos: null, rotated: fac.rotated })}>
              위치 이동
            </button>
            <button
              className="btn"
              disabled={!space.canMoveFacility(state, room.id, fac.id, fac.x, fac.y, !fac.rotated).ok}
              title={space.canMoveFacility(state, room.id, fac.id, fac.x, fac.y, !fac.rotated).ok ? "" : "회전하면 공간이 부족합니다"}
              onClick={() =>
                run({ type: "MOVE_FACILITY", roomId: room.id, facilityId: fac.id, x: fac.x, y: fac.y, rotated: !fac.rotated }, "시설을 회전했습니다.")
              }
            >
              제자리 회전
            </button>
          </div>
          {remove.ok && (
            <div className="btn-row">
              <CostTag bundle={remove.refund} label="회수" />
              <button
                className="btn danger"
                onClick={() => {
                  run({ type: "REMOVE_FACILITY", roomId: room.id, facilityId: fac.id }, `${def.name}을(를) 철거했습니다.`);
                  setSelection({ kind: "room", roomId: room.id });
                }}
              >
                철거
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted small-text">역사에 원래 있던 설비라 옮기거나 철거할 수 없습니다.</p>
      )}
      <button className="btn ghost" onClick={() => setSelection({ kind: "room", roomId: room.id })}>
        ← {room.name}
      </button>
    </div>
  );
}

// ─────────────────── 건설 ───────────────────

export function BuildPanel({ state, selection, setSelection, setMode }: PanelProps) {
  const roomId = selection?.kind === "room" || selection?.kind === "facility" ? selection.roomId : null;
  const room = roomId ? space.getRoom(state, roomId) : undefined;
  return (
    <div className="panel-body">
      <h3 className="panel-title">방 만들기</h3>
      <p className="muted small-text">
        비용: 기본 자재 {RULES.room.baseMaterials} + 1칸당 {RULES.room.materialsPerTile} · 정리된 바닥에만 가능 · 최대 {RULES.room.maxArea}칸
      </p>
      <ul className="card-list">
        {ROOM_TYPES.map((t) => (
          <li key={t.id}>
            <button className="card" onClick={() => setMode({ kind: "createRoom", roomType: t.id, anchor: null, rect: null, dragging: false })}>
              <span className="swatch big" style={{ background: t.color }} />
              <span className="card-main">
                <span className="card-title">{t.name}</span>
                <span className="card-desc">{t.desc}</span>
              </span>
              <span className="card-side">
                최소 {t.minShort}×{t.minLong}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="panel-title">시설 설치</h3>
      {!room ? (
        <>
          <p className="muted small-text">시설을 설치할 방을 선택하세요.</p>
          <ul className="list">
            {state.rooms.map((r) => (
              <li key={r.id}>
                <button className="list-item" onClick={() => setSelection({ kind: "room", roomId: r.id })}>
                  <span className="swatch" style={{ background: ROOM_TYPE_BY_ID[r.type].color }} />
                  <span className="grow">{r.name}</span>
                  <span className="muted">{ROOM_TYPE_BY_ID[r.type].name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="small-text">
            대상: <b>{room.name}</b> ({ROOM_TYPE_BY_ID[room.type].name}){" "}
            <button className="link" onClick={() => setSelection(null)}>
              다른 방 선택
            </button>
          </p>
          <ul className="card-list">
            {facilitiesForRoom(room.type)
              .filter((f) => f.buildable)
              .map((f) => (
                <li key={f.id}>
                  <button
                    className="card"
                    onClick={() => setMode({ kind: "placeFacility", roomId: room.id, facilityType: f.id, pos: null, rotated: false })}
                  >
                    <span className="glyph-box" style={{ borderColor: ROOM_TYPE_BY_ID[room.type].color }}>
                      {f.glyph}
                    </span>
                    <span className="card-main">
                      <span className="card-title">
                        {f.name} <span className="muted">{f.w}×{f.h}</span>
                      </span>
                      <span className="card-desc">{f.desc}</span>
                      <CostTag bundle={f.cost} have={state.resources} />
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─────────────────── 자원 ───────────────────

export function ResourcePanel({ state }: { state: GameState }) {
  return (
    <div className="panel-body">
      <h3 className="panel-title">창고 재고</h3>
      <table className="table">
        <thead>
          <tr>
            <th>자원</th>
            <th className="num">보유</th>
            <th className="num">구간 생산</th>
            <th className="num">구간 소비</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((r) => (
            <tr key={r.id}>
              <td>
                <span className={`res-dot res-${r.id}`} /> {r.name}
              </td>
              <td className="num">{r.kind === "stock" ? state.resources[r.id] : "—"}</td>
              <td className="num muted">—</td>
              <td className="num muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small-text">
        현재는 보유량과 건설 비용 차감만 작동합니다. 생산·소비·예상 잔여량 계산은 2~3단계에서, 전력 계산은 4단계에서 구현됩니다.
      </p>
    </div>
  );
}

// ─────────────────── 기록 ───────────────────

export function LogPanel({ state }: { state: GameState }) {
  return (
    <div className="panel-body">
      <h3 className="panel-title">운영 기록</h3>
      <ul className="log-list">
        {state.log.map((e, i) => (
          <li key={i} className={`log-${e.kind}`}>
            <span className="log-time">
              {e.day}일 {PHASE_NAMES[e.phase]}
            </span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
