"use client";

import { useEffect, useState } from "react";
import { FACILITY_BY_ID, facilitiesForRoom } from "@/game/config/facilities";
import { TILE_INFO } from "@/game/config/map";
import { RESOURCE_BY_ID, RESOURCES } from "@/game/config/resources";
import { ROOM_TYPE_BY_ID, ROOM_TYPES } from "@/game/config/rooms";
import { RULES } from "@/game/config/rules";
import { area } from "@/game/core/geometry";
import { bundleText, isEmptyBundle } from "@/game/core/resources";
import * as operation from "@/game/systems/operation";
import { ZONES, ZONE_BY_ID } from "@/game/config/zones";
import { canOpenZone, gateZoneAt, isZoneOpen, lockedZoneAt } from "@/game/systems/zones";
import type { GameState, ResourceBundle, ResourceId, Room, RoomTypeId } from "@/game/core/types";
import type { AccessInfo } from "@/game/systems/access";
import { canModifyBase, PHASE_NAMES } from "@/game/systems/phase";
import { canDoAction } from "@/game/systems/actions";
import { population, type PhaseForecast } from "@/game/systems/time";
import * as space from "@/game/systems/space";
import type { GameAction } from "@/game/state/reducer";
import type { AskFn, Mode, Selection } from "./uiTypes";

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
  run: (a: GameAction, msg?: string) => void;
  goBuild: () => void;
  ask: AskFn;
  sim: operation.PeriodSim;
  cap: Record<ResourceId, number>;
}

/** 정비 시간이 아닐 때 건설 관련 안내 */
function BuildLockNote({ state }: { state: GameState }) {
  if (canModifyBase(state)) return null;
  return (
    <div className="alert lock">
      🔒 건설·배치·철거는 <b>정비 시간</b>에만 가능합니다. 지금은 {PHASE_NAMES[state.phase]} — 야간이 끝나면 정비 시간이 시작됩니다.
    </div>
  );
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
    const zone = lockedZoneAt(state, selection) ?? gateZoneAt(state, selection);
    if (zone) return <ZoneCard state={state} zoneId={zone.id} run={props.run} />;
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
        {t === "floor" && canModifyBase(state) && (
          <button className="btn" onClick={props.goBuild}>
            여기에 방 만들기 →
          </button>
        )}
        {t === "floor" && !canModifyBase(state) && <p className="muted small-text">방은 정비 시간에 만들 수 있습니다.</p>}
        {t === "debris" &&
          (() => {
            const chk = canDoAction(state, "clearDebris", { kind: "debris", pos: { x: selection.x, y: selection.y } });
            return (
              <>
                {chk.ok ? <p className="small-text">{chk.preview}</p> : <p className="warn-text small-text">{chk.reason}</p>}
                <button className="btn primary" disabled={!chk.ok} onClick={() => props.setMode({ kind: "clearDebris", pos: { x: selection.x, y: selection.y } })}>
                  잔해 정리 (행동 1)
                </button>
              </>
            );
          })()}
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
          <span className="stat-val">{population(state)}</span>
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

function RoomInfo({ state, access, room, setSelection, setMode, run, goBuild, ask }: PanelProps & { room: Room }) {
  const canBuild = canModifyBase(state);
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

      <BuildLockNote state={state} />
      <div className="btn-row">
        <button className="btn primary" disabled={!canBuild} onClick={goBuild}>
          시설 설치
        </button>
        <button className="btn" disabled={!canBuild} onClick={() => setMode({ kind: "resizeRoom", roomId: room.id, rect: { ...room.rect } })}>
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
            onClick={() =>
              ask(`'${room.name}'을(를) 철거할까요? 건설 자재 일부만 돌려받습니다.`, () => {
                run({ type: "DELETE_ROOM", roomId: room.id }, "방을 철거했습니다.");
                setSelection(null);
              }, "철거")
            }
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

function FacilityInfo({ state, room, facilityId, setSelection, setMode, run, sim, cap, ask }: PanelProps & { room: Room; facilityId: string }) {
  const fac = room.facilities.find((f) => f.id === facilityId)!;
  const def = FACILITY_BY_ID[fac.type];
  const r = space.facilityRect(fac);
  const remove = space.canRemoveFacility(state, room.id, fac.id);
  const pct = Math.round((fac.durability / def.maxDurability) * 100);
  const canBuild = canModifyBase(state);
  const repairTarget = { kind: "facility" as const, roomId: room.id, facilityId: fac.id };
  const repair = canDoAction(state, "repair", repairTarget);
  const maintRepair = operation.canRepairFacility(state, room.id, fac.id);
  const rep = sim.byId[fac.id];
  const eff = operation.efficiency(fac);

  // 철거하면 줄어드는 저장 용량 때문에 버려질 자원
  const lostOnRemove: ResourceBundle = {};
  for (const [k, v] of Object.entries(def.storage) as [ResourceId, number][]) {
    const over = state.resources[k] - (cap[k] - v);
    if (over > 0) lostOnRemove[k] = over;
  }

  const effects: { label: string; value: string; note?: string }[] = [];
  if (def.power > 0) effects.push({ label: "전력 생산", value: `최대 ${def.power}`, note: rep?.status === "running" ? `현재 ${rep.powerOut}` : undefined });
  if (def.power < 0) effects.push({ label: "전력 필요", value: `${-def.power}` });
  for (const k of Object.keys(def.produces) as ResourceId[])
    effects.push({ label: `${RESOURCE_BY_ID[k].name} 생산`, value: `최대 +${def.produces[k]}/구간`, note: rep?.status === "running" ? `현재 +${rep.produced[k] ?? 0}` : undefined });
  for (const k of Object.keys(def.consumes) as ResourceId[]) effects.push({ label: `${RESOURCE_BY_ID[k].name} 소비`, value: `${def.consumes[k]}/구간` });
  for (const k of Object.keys(def.storage) as ResourceId[]) effects.push({ label: `${RESOURCE_BY_ID[k].name} 저장`, value: `+${def.storage[k]}` });
  if (def.decay) effects.push({ label: "가동 시 마모", value: `내구도 -${def.decay}/구간` });
  if (def.beds) effects.push({ label: "침상", value: `${def.beds}` });
  if (def.crop) effects.push({ label: "수확", value: `${def.crop.cycle}구간마다 식량 ${def.crop.yield}`, note: `성장 ${fac.growth ?? 0}/${def.crop.cycle}` });
  if (def.kitchen) effects.push({ label: "조리", value: "식량 소비 25% 절약, 사기 +1/구간" });

  return (
    <div className="panel-body">
      <div className="panel-title-row spread">
        <h3 className="panel-title">{def.name}</h3>
        {rep && <span className={`status-pill st-${rep.status}`}>{operation.STATUS_LABEL[rep.status]}</span>}
      </div>
      <p className="muted">
        {room.name} · 크기 {r.w}×{r.h}
        {def.fixed && " · 고정 설비"}
      </p>
      <p className="small-text">{def.desc}</p>
      <div className="meter">
        <div className="meter-label">
          <span>내구도 · 효율 {Math.round(eff * 100)}%</span>
          <span>
            {fac.durability}/{def.maxDurability}
          </span>
        </div>
        <div className="meter-track">
          <div className={`meter-fill ${pct > 60 ? "good" : pct >= 25 ? "mid" : "bad"}`} style={{ width: `${pct}%` }} />
        </div>
        {def.operates && (
          <p className="muted small-text">
            내구도 50% 이상 효율 100% · 25% 이상 75% · 그 아래 50%이며 고장 위험이 있습니다. 0이 되면 고장.
          </p>
        )}
      </div>

      {(def.power !== 0 || def.produces.water) && rep && (
        <ul className="effect-list">
          {def.power !== 0 && (
            <li>
              <span>전력망</span>
              <span className="grow" />
              {rep.powerNet ? (
                <span className="status-pill st-running">전력망 {rep.powerNet}에 연결</span>
              ) : (
                <span className="status-pill st-noPowerLine">전력선 미연결</span>
              )}
            </li>
          )}
          {def.produces.water && (
            <li>
              <span>수도망</span>
              <span className="grow" />
              {rep.waterNet && sim.waterNets.find((n) => n.id === rep.waterNet)?.sources ? (
                <span className="status-pill st-running">수도망 {rep.waterNet} (급수원 연결)</span>
              ) : rep.waterNet ? (
                <span className="status-pill st-noWaterLine">수도망 {rep.waterNet} · 급수원 없음</span>
              ) : (
                <span className="status-pill st-noWaterLine">수도관 미연결</span>
              )}
            </li>
          )}
        </ul>
      )}

      {def.operates && (
        <div className="btn-row">
          <button
            className={`btn ${fac.enabled ? "" : "primary"}`}
            onClick={() => run({ type: "TOGGLE_FACILITY", roomId: room.id, facilityId: fac.id }, fac.enabled ? `${def.name}을(를) 정지했습니다.` : `${def.name}을(를) 가동합니다.`)}
          >
            {fac.enabled ? "정지" : "가동"}
          </button>
          <span className="muted small-text">언제든 켜고 끌 수 있습니다. 정지 중에는 자원을 쓰지 않고 닳지 않습니다.</span>
        </div>
      )}

      {fac.durability < def.maxDurability && state.phase !== "maintenance" && (
        <div className="repair-box">
          <div className="btn-row">
            <button className="btn primary" disabled={!repair.ok} onClick={() => run({ type: "DO_ACTION", actionId: "repair", target: repairTarget })}>
              직접 수리 (행동 1)
            </button>
            {repair.ok && <span className="small-text">{repair.preview} · 부품 1</span>}
          </div>
          {!repair.ok && <p className="warn-text small-text">{repair.reason}</p>}
        </div>
      )}
      {fac.durability < def.maxDurability && state.phase === "maintenance" && (
        <div className="repair-box">
          <div className="btn-row">
            <button className="btn primary" disabled={!maintRepair.ok} onClick={() => run({ type: "REPAIR_FACILITY", roomId: room.id, facilityId: fac.id }, `${def.name} 수리 완료`)}>
              정비 수리 (최대까지)
            </button>
            {maintRepair.ok && <CostTag bundle={maintRepair.cost} have={state.resources} label="비용" />}
          </div>
          {!maintRepair.ok && <p className="warn-text small-text">{maintRepair.reason}</p>}
          <p className="muted small-text">정비 수리는 행동을 쓰지 않는 대신 부품이 더 듭니다(내구도 20당 부품 1).</p>
        </div>
      )}

      {effects.length > 0 && (
        <>
          <h4 className="section-title">설비 성능</h4>
          <ul className="effect-list">
            {effects.map((e) => (
              <li key={e.label}>
                <span>{e.label}</span>
                <span className="grow" />
                <b>{e.value}</b>
                {e.note && <span className="badge badge-todo">{e.note}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!def.fixed ? (
        <>
          <BuildLockNote state={state} />
          <div className="btn-row">
            <button className="btn" disabled={!canBuild} onClick={() => setMode({ kind: "moveFacility", roomId: room.id, facilityId: fac.id, pos: null, rotated: fac.rotated })}>
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
                  const go = () => {
                    run({ type: "REMOVE_FACILITY", roomId: room.id, facilityId: fac.id }, `${def.name}을(를) 철거했습니다.`);
                    setSelection({ kind: "room", roomId: room.id });
                  };
                  if (Object.keys(lostOnRemove).length)
                    ask(`철거하면 저장 공간이 줄어 ${bundleText(lostOnRemove)}을(를) 버리게 됩니다. 철거할까요?`, go, "철거");
                  else go();
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

// ─────────────────── 구역 ───────────────────

function ZoneCard({ state, zoneId, run }: { state: GameState; zoneId: string; run: (a: GameAction, msg?: string) => void }) {
  const z = ZONE_BY_ID[zoneId];
  const open = isZoneOpen(state, z.id);
  const chk = canOpenZone(state, z.id);
  return (
    <div className={`zone-card ${open ? "open" : ""}`}>
      <div className="zone-head">
        <b>{z.name}</b>
        <span className="grow" />
        <span className={`status-pill ${open ? "st-running" : "st-off"}`}>{open ? "개방됨" : "봉쇄"}</span>
      </div>
      <p className="small-text">{z.desc}</p>
      {!open && (
        <>
          <p className="muted small-text">{z.hint}</p>
          <div className="btn-row">
            <CostTag bundle={z.cost} have={state.resources} label="비용" />
            <button className="btn primary small" disabled={!chk.ok} onClick={() => run({ type: "OPEN_ZONE", zoneId: z.id }, `'${z.name}'을(를) 개방했습니다.`)}>
              셔터 열기
            </button>
          </div>
          {!chk.ok && <p className="warn-text small-text">{chk.reason}</p>}
        </>
      )}
    </div>
  );
}

// ─────────────────── 건설 ───────────────────

export function BuildPanel({ state, selection, setSelection, setMode, run }: PanelProps) {
  const roomId = selection?.kind === "room" || selection?.kind === "facility" ? selection.roomId : null;
  const room = roomId ? space.getRoom(state, roomId) : undefined;
  const canBuild = canModifyBase(state);
  const hasBench = operation.hasWorking(state, "builder_bench");
  return (
    <div className="panel-body">
      <BuildLockNote state={state} />
      <h3 className="panel-title">방 만들기</h3>
      <p className="muted small-text">
        비용: 기본 자재 {RULES.room.baseMaterials} + 1칸당 {RULES.room.materialsPerTile} · 정리된 바닥에만 가능 · 최대 {RULES.room.maxArea}칸
      </p>
      <ul className="card-list">
        {ROOM_TYPES.map((t) => (
          <li key={t.id}>
            <button className="card" disabled={!canBuild} onClick={() => setMode({ kind: "createRoom", roomType: t.id, anchor: null, rect: null, dragging: false })}>
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

      <h3 className="panel-title">구역 개방</h3>
      <p className="muted small-text">봉쇄된 셔터 앞까지 잔해를 치운 뒤, 자원을 써서 셔터를 엽니다. 새 구역에는 공간과 남은 시설이 있습니다.</p>
      {ZONES.map((z) => (
        <ZoneCard key={z.id} state={state} zoneId={z.id} run={run} />
      ))}

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
                    disabled={!canBuild || (f.advanced && !hasBench)}
                    title={f.advanced && !hasBench ? "가동 중인 건설 작업대가 필요합니다" : ""}
                    onClick={() => setMode({ kind: "placeFacility", roomId: room.id, facilityType: f.id, pos: null, rotated: false })}
                  >
                    <span className="glyph-box" style={{ borderColor: ROOM_TYPE_BY_ID[room.type].color }}>
                      {f.glyph}
                    </span>
                    <span className="card-main">
                      <span className="card-title">
                        {f.name} <span className="muted">{f.w}×{f.h}</span>
                        {f.advanced && <span className={`tag ${hasBench ? "tag-ok" : ""}`}>고급{hasBench ? "" : " · 건설 작업대 필요"}</span>}
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

export function ResourcePanel({ state, forecast, cap }: { state: GameState; forecast: PhaseForecast; cap: Record<ResourceId, number> }) {
  const day = state.phase !== "maintenance";
  const { supply, demand, used } = forecast.sim.power;
  const machines = forecast.sim.reports.filter((r) => FACILITY_BY_ID[r.type].operates);
  return (
    <div className="panel-body">
      <h3 className="panel-title">자원 현황</h3>
      <p className="muted small-text">
        {day ? `이번 ${PHASE_NAMES[state.phase]} 구간이 끝날 때 예상되는 변화입니다.` : "정비 시간에는 소비가 없습니다. 아래는 내일 오전 기준 예상입니다."}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>자원</th>
              <th className="num">보유/최대</th>
              <th className="num">생산</th>
              <th className="num">소비</th>
              <th className="num">예상</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.filter((r) => r.kind === "stock").map((r) => {
              const prod = forecast.sim.production[r.id] ?? 0;
              const use = (forecast.sim.facilityUse[r.id] ?? 0) + (RULES.upkeepPerPerson[r.id as "food" | "water"] ?? 0) * population(state);
              const after = Math.max(0, Math.min(state.resources[r.id] + prod - use, Math.max(cap[r.id], state.resources[r.id])));
              const full = state.resources[r.id] >= cap[r.id];
              return (
                <tr key={r.id} className={forecast.shortage[r.id] ? "row-bad" : ""}>
                  <td>
                    <span className={`res-dot res-${r.id}`} /> {r.name}
                  </td>
                  <td className={`num ${full ? "warn-text" : ""}`}>
                    {state.resources[r.id]}/{cap[r.id]}
                  </td>
                  <td className={`num ${prod ? "pos" : "muted"}`}>{prod ? `+${prod}` : "—"}</td>
                  <td className={`num ${use ? "neg" : "muted"}`}>{use ? `-${use}` : "—"}</td>
                  <td className="num">{after}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4 className="section-title">전력</h4>
      <div className="power-bar" aria-label={`전력 사용 ${used} / 발전 ${supply}`}>
        <div className="power-fill" style={{ width: supply ? `${Math.min(100, (used / supply) * 100)}%` : "0%" }} />
      </div>
      <p className="small-text">
        발전 <b>{supply}</b> · 필요 <b>{demand}</b> · 공급 <b>{used}</b>
        {demand > used && <span className="warn-text"> — 전력 부족, 일부 시설이 멈춥니다.</span>}
        {supply > 0 && demand === 0 && <span className="muted"> — 전력을 쓰는 시설이 없습니다.</span>}
      </p>
      {forecast.sim.powerNets.length > 1 && (
        <p className="small-text">
          {forecast.sim.powerNets.map((n) => `전력망 ${n.id}: ${n.used}/${n.supply}`).join(" · ")}
        </p>
      )}
      <p className="muted small-text">전력은 전력선으로 이어진 시설끼리만 나눠 씁니다. 자세한 연결은 '기반시설' 탭에서 확인하세요.</p>

      <h4 className="section-title">가동 시설</h4>
      {machines.length === 0 ? (
        <p className="muted small-text">가동하는 기계가 없습니다.</p>
      ) : (
        <ul className="list">
          {machines.map((m) => {
            const def = FACILITY_BY_ID[m.type];
            const room = state.rooms.find((r) => r.id === m.roomId)!;
            const parts: string[] = [];
            if (m.powerOut) parts.push(`전력 +${m.powerOut}`);
            if (m.powerIn) parts.push(`전력 -${m.powerIn}`);
            if (Object.keys(m.produced).length) parts.push(`+${bundleText(m.produced)}`);
            if (Object.keys(m.consumed).length) parts.push(`-${bundleText(m.consumed)}`);
            return (
              <li key={m.facilityId} className="list-item static">
                <span className="grow">
                  {def.name} <span className="muted">· {room.name}</span>
                  {parts.length > 0 && <span className="muted small-text"> · {parts.join(", ")}</span>}
                </span>
                <span className={`status-pill st-${m.status}`}>{operation.STATUS_LABEL[m.status]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small-text">저장 공간을 넘는 자원은 버려집니다. 창고·탱크·사물함 같은 시설로 최대 저장량을 늘리세요.</p>
    </div>
  );
}

// ─────────────────── 기록 ───────────────────

export function LogPanel({ state }: { state: GameState }) {
  const [filter, setFilter] = useState<"all" | "event" | "warn">("all");
  const entries = state.log.filter((e) => filter === "all" || e.kind === filter);
  return (
    <div className="panel-body">
      <div className="panel-title-row spread">
        <h3 className="panel-title">운영 기록</h3>
        <div className="seg">
          {(
            [
              ["all", "전체"],
              ["event", "사건"],
              ["warn", "경고"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={`seg-btn ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {entries.length === 0 && <p className="muted small-text">해당하는 기록이 없습니다.</p>}
      <ul className="log-list">
        {entries.map((e, i) => (
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
