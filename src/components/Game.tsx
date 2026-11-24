"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { pointInRect, rectFromPoints } from "@/game/core/geometry";
import type { Check, Point } from "@/game/core/types";
import { computeAccess } from "@/game/systems/access";
import * as space from "@/game/systems/space";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer, type GameAction } from "@/game/state/reducer";
import { clearSave, loadGame, saveGame } from "@/game/state/save";
import BaseMap from "./BaseMap";
import ModeBar from "./ModeBar";
import { BasePanel, BuildPanel, LogPanel, ResourcePanel } from "./Panels";
import StatusModal from "./StatusModal";
import TopBar from "./TopBar";
import type { Mode, Selection, Tab } from "./uiTypes";

const TABS: { id: Tab; label: string; planned?: string }[] = [
  { id: "base", label: "거점" },
  { id: "build", label: "건설" },
  { id: "resources", label: "자원" },
  { id: "log", label: "기록" },
  { id: "network", label: "기반시설", planned: "4단계" },
  { id: "survivors", label: "생존자", planned: "5단계" },
];

export default function Game() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [ready, setReady] = useState(false);
  const [mode, setModeRaw] = useState<Mode>({ kind: "view" });
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("base");
  const [tilePx, setTilePx] = useState(28);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "warn" } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [saveOk, setSaveOk] = useState(true);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, kind: "ok" | "warn" = "ok") => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ── 불러오기 (브라우저에서만) ──
  useEffect(() => {
    const res = loadGame();
    if (res.status === "ok") dispatch({ type: "LOAD", state: res.state });
    if (res.status === "corrupt") showToast("저장 데이터가 손상되어 새 게임으로 시작합니다.", "warn");
    setReady(true);
  }, [showToast]);

  // ── 자동 저장 ──
  useEffect(() => {
    if (ready) setSaveOk(saveGame(state));
  }, [state, ready]);

  // ── 지도 기본 배율: 화면 폭에 맞추되 너무 작아지지 않게 ──
  const fitZoom = useCallback(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const cols = state.map[0].length;
    setTilePx(Math.max(22, Math.min(44, Math.floor((el.clientWidth - 16) / cols))));
  }, [state.map]);
  useEffect(() => {
    if (ready) fitZoom();
  }, [ready, fitZoom]);

  const access = useMemo(() => computeAccess(state), [state]);

  const setMode = useCallback((m: Mode) => {
    setModeRaw(m);
    if (m.kind === "resizeRoom" || m.kind === "placeFacility" || m.kind === "moveFacility")
      setSelection({ kind: "room", roomId: m.roomId });
  }, []);

  const run = useCallback(
    (a: GameAction, msg: string) => {
      dispatch(a);
      showToast(msg);
    },
    [showToast],
  );

  // ── 현재 모드의 규칙 검사 (미리보기 색과 확인 버튼에 사용) ──
  const check: Check | null = useMemo(() => {
    switch (mode.kind) {
      case "createRoom":
        return mode.rect ? space.canCreateRoom(state, mode.rect, mode.roomType) : null;
      case "placeFacility":
        return mode.pos ? space.canPlaceFacility(state, mode.roomId, mode.facilityType, mode.pos.x, mode.pos.y, mode.rotated) : null;
      case "moveFacility":
        return mode.pos ? space.canMoveFacility(state, mode.roomId, mode.facilityId, mode.pos.x, mode.pos.y, mode.rotated) : null;
      case "resizeRoom":
        return space.canResizeRoom(state, mode.roomId, mode.rect);
      default:
        return null;
    }
  }, [mode, state]);

  // 모드가 가리키는 방·시설이 사라지면 모드 해제
  useEffect(() => {
    if (mode.kind !== "view" && mode.kind !== "createRoom" && !space.getRoom(state, mode.roomId)) setModeRaw({ kind: "view" });
  }, [state, mode]);

  // ── 지도 입력 ──
  const onTileClick = (p: Point) => {
    if (mode.kind === "view") {
      for (const room of state.rooms) {
        const fac = room.facilities.find((f) => pointInRect(p, space.facilityRect(f)));
        if (fac) {
          setSelection({ kind: "facility", roomId: room.id, facilityId: fac.id });
          setTab("base");
          return;
        }
      }
      const room = state.rooms.find((r) => pointInRect(p, r.rect));
      setSelection(room ? { kind: "room", roomId: room.id } : { kind: "tile", x: p.x, y: p.y });
      setTab("base");
      return;
    }
    if (mode.kind === "placeFacility" || mode.kind === "moveFacility") {
      const same = mode.pos && mode.pos.x === p.x && mode.pos.y === p.y;
      if (same && check?.ok) {
        if (mode.kind === "placeFacility") {
          run(
            { type: "PLACE_FACILITY", roomId: mode.roomId, facilityType: mode.facilityType, x: p.x, y: p.y, rotated: mode.rotated },
            "시설을 설치했습니다.",
          );
          setModeRaw({ ...mode, pos: null });
        } else {
          run({ type: "MOVE_FACILITY", roomId: mode.roomId, facilityId: mode.facilityId, x: p.x, y: p.y, rotated: mode.rotated }, "시설을 옮겼습니다.");
          setModeRaw({ kind: "view" });
        }
        return;
      }
      setModeRaw({ ...mode, pos: p });
    }
  };
  const onTileHover = (p: Point) => {
    if ((mode.kind === "placeFacility" || mode.kind === "moveFacility") && (!mode.pos || mode.pos.x !== p.x || mode.pos.y !== p.y))
      setModeRaw({ ...mode, pos: p });
  };
  const onDragStart = (p: Point) => {
    if (mode.kind !== "createRoom") return;
    // 두 번 탭 방식: 1칸만 지정된 상태에서 다른 칸을 누르면 그 칸까지 영역 확장
    if (mode.anchor && mode.rect && mode.rect.w === 1 && mode.rect.h === 1 && (mode.anchor.x !== p.x || mode.anchor.y !== p.y)) {
      setModeRaw({ ...mode, rect: rectFromPoints(mode.anchor, p), dragging: true });
      return;
    }
    setModeRaw({ ...mode, anchor: p, rect: rectFromPoints(p, p), dragging: true });
  };
  const onDragMove = (p: Point) => {
    if (mode.kind !== "createRoom" || !mode.anchor) return;
    const r = rectFromPoints(mode.anchor, p);
    if (!mode.rect || r.w !== mode.rect.w || r.h !== mode.rect.h || r.x !== mode.rect.x || r.y !== mode.rect.y)
      setModeRaw({ ...mode, rect: r });
  };
  const onDragEnd = () => {
    if (mode.kind === "createRoom" && mode.dragging) setModeRaw({ ...mode, dragging: false });
  };

  // Esc로 작업 취소
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (statusOpen) setStatusOpen(false);
        else if (mode.kind !== "view") setModeRaw({ kind: "view" });
        else setSelection(null);
      }
      if ((e.key === "r" || e.key === "R") && (mode.kind === "placeFacility" || mode.kind === "moveFacility") && !(e.target instanceof HTMLInputElement))
        setModeRaw({ ...mode, rotated: !mode.rotated });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, statusOpen]);

  const newGame = () => {
    if (!window.confirm("현재 진행 상황을 지우고 새 게임을 시작할까요?")) return;
    clearSave();
    dispatch({ type: "NEW_GAME" });
    setModeRaw({ kind: "view" });
    setSelection(null);
    setTab("base");
    showToast("새 게임을 시작했습니다.");
  };

  const panelProps = {
    state,
    access,
    selection,
    setSelection,
    setMode,
    run,
    goBuild: () => setTab("build"),
  };

  if (!ready) {
    return (
      <div className="loading">
        <span className="brand-name">THE DUST</span>
        <span className="muted">거점을 불러오는 중…</span>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar state={state} onOpenStatus={() => setStatusOpen(true)} onNewGame={newGame} />
      <main className="main">
        <section className="map-area">
          <div className="map-toolbar">
            <span className="phase-note">
              <b>정비 시간</b> · 행동 횟수를 쓰지 않고 거점을 설계합니다
            </span>
            <div className="zoom">
              <button className="btn small" onClick={() => setTilePx((z) => Math.max(14, z - 4))} aria-label="축소">
                −
              </button>
              <button className="btn small" onClick={fitZoom}>
                맞춤
              </button>
              <button className="btn small" onClick={() => setTilePx((z) => Math.min(64, z + 4))} aria-label="확대">
                +
              </button>
            </div>
          </div>
          <div className="map-scroll" ref={mapWrapRef}>
            <BaseMap
              state={state}
              access={access}
              mode={mode}
              selection={selection}
              tilePx={tilePx}
              previewOk={!!check?.ok}
              onTileClick={onTileClick}
              onTileHover={onTileHover}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          </div>
          <ModeBar state={state} mode={mode} check={check} setMode={setMode} setSelection={setSelection} run={run} />
          <div className="legend">
            <span><i className="lg lg-floor" />바닥</span>
            <span><i className="lg lg-debris" />잔해</span>
            <span><i className="lg lg-platform" />승강장</span>
            <span><i className="lg lg-door" />출입문</span>
            <span><i className="lg lg-iso" />고립된 방</span>
            <span className="muted">· 그래픽은 임시 이미지</span>
          </div>
        </section>

        <aside className="side">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                disabled={!!t.planned}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
                title={t.planned ? `${t.planned}에서 구현 예정` : ""}
              >
                {t.label}
                {t.planned && <span className="tab-badge">{t.planned}</span>}
              </button>
            ))}
          </nav>
          <div className="panel">
            {tab === "base" && <BasePanel {...panelProps} />}
            {tab === "build" && <BuildPanel {...panelProps} />}
            {tab === "resources" && <ResourcePanel state={state} />}
            {tab === "log" && <LogPanel state={state} />}
          </div>
          {!saveOk && <div className="alert warn">이 브라우저에서는 자동 저장을 할 수 없습니다. (저장소 접근 차단)</div>}
        </aside>
      </main>
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
      {statusOpen && <StatusModal onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
