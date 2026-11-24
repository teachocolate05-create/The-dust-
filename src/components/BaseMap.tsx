"use client";

import { useRef } from "react";
import { FACILITY_BY_ID } from "@/game/config/facilities";
import { ROOM_TYPE_BY_ID } from "@/game/config/rooms";
import type { GameState, Point, Rect, TileType } from "@/game/core/types";
import type { AccessInfo } from "@/game/systems/access";
import { facilityRect } from "@/game/systems/space";
import { debrisArea } from "@/game/systems/actions";
import { ZONES } from "@/game/config/zones";
import type { LineView, Mode, Selection } from "./uiTypes";
import type { FacilityStatus } from "@/game/systems/operation";

const S = 32; // SVG 내부 좌표계에서 타일 1칸 크기

interface Props {
  state: GameState;
  access: AccessInfo;
  mode: Mode;
  selection: Selection;
  /** 화면상 타일 1칸의 픽셀 크기 (확대/축소) */
  tilePx: number;
  /** 미리보기가 규칙에 맞는지 (초록/빨강 표시용) */
  previewOk: boolean;
  /** 시설별 가동 상태 */
  statuses: Record<string, FacilityStatus>;
  /** 전력선·수도관 표시 */
  lineView: LineView;
  /** 기반 시설 보기 (방을 흐리게, 선을 굵게) */
  showNetworks: boolean;
  onTileClick: (p: Point) => void;
  onTileHover: (p: Point) => void;
  onDragStart: (p: Point) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: () => void;
}

const TILE_FILL: Record<TileType, string> = {
  rock: "#16130f",
  floor: "#3a352d",
  debris: "#3a3128",
  pillar: "#55504a",
  platform: "#4a4538",
  track: "#24211c",
  entrance: "#4d4a3c",
  watersource: "#2f4a52",
  sealed: "#3d3a33",
};

export default function BaseMap(p: Props) {
  const { state, access, mode, selection } = p;
  const svgRef = useRef<SVGSVGElement>(null);
  const H = state.map.length;
  const W = state.map[0].length;

  const toTile = (clientX: number, clientY: number): Point | null => {
    const el = svgRef.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const x = Math.floor(((clientX - b.left) / b.width) * W);
    const y = Math.floor(((clientY - b.top) / b.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return { x, y };
  };

  const dragMode = mode.kind === "createRoom" || mode.kind === "drawLine" || mode.kind === "markDebris";

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragMode) return;
    const t = toTile(e.clientX, e.clientY);
    if (!t) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onDragStart(t);
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const t = toTile(e.clientX, e.clientY);
    if (!t) return;
    if (dragMode) {
      if ((mode.kind === "createRoom" || mode.kind === "drawLine" || mode.kind === "markDebris") && mode.dragging) p.onDragMove(t);
    } else if (e.pointerType === "mouse") {
      p.onTileHover(t);
    }
  };
  const handlePointerUp = () => {
    if (dragMode) p.onDragEnd();
  };
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragMode) return;
    const t = toTile(e.clientX, e.clientY);
    if (t) p.onTileClick(t);
  };

  // ── 타일 ──
  const tiles: React.ReactNode[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = state.map[y][x];
      const px = x * S;
      const py = y * S;
      tiles.push(<rect key={`t${x},${y}`} x={px} y={py} width={S} height={S} fill={TILE_FILL[t]} />);
      if (t === "floor" || t === "platform" || t === "entrance")
        tiles.push(<rect key={`g${x},${y}`} x={px} y={py} width={S} height={S} fill="url(#floorGrid)" />);
      if (t === "debris") tiles.push(<rect key={`d${x},${y}`} x={px} y={py} width={S} height={S} fill="url(#debris)" />);
      if (t === "rock") tiles.push(<rect key={`r${x},${y}`} x={px} y={py} width={S} height={S} fill="url(#rock)" />);
      if (t === "track") tiles.push(<rect key={`k${x},${y}`} x={px} y={py} width={S} height={S} fill="url(#track)" />);
      if (t === "pillar")
        tiles.push(
          <g key={`p${x},${y}`}>
            <rect x={px + 5} y={py + 5} width={S - 10} height={S - 10} fill="#6b655c" stroke="#2a2622" strokeWidth={2} />
            <line x1={px + 5} y1={py + 5} x2={px + S - 5} y2={py + S - 5} stroke="#4c463f" strokeWidth={1.5} />
          </g>,
        );
      if (t === "entrance")
        tiles.push(
          <g key={`e${x},${y}`}>
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={px + 3} y={py + 4 + i * 7} width={S - 6} height={4} fill="#8a8466" />
            ))}
          </g>,
        );
      if (t === "sealed")
        tiles.push(
          <g key={`s${x},${y}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={px + 2} y={py + 2 + i * 6} width={S - 4} height={4} fill={i % 2 ? "#6b655c" : "#857e70"} />
            ))}
            <rect x={px + 1} y={py + 1} width={S - 2} height={S - 2} fill="none" stroke="#c9a227" strokeWidth={2} strokeDasharray="4 3" />
          </g>,
        );
      if (t === "watersource")
        tiles.push(
          <g key={`w${x},${y}`}>
            <circle cx={px + S / 2} cy={py + S / 2} r={10} fill="#3f7f8f" stroke="#9fd4df" strokeWidth={2} />
            <path d={`M${px + 16} ${py + 9} q6 8 0 13 q-6 -5 0 -13`} fill="#cdeff5" />
          </g>,
        );
    }
  }
  // 승강장 끝 노란 안전선
  const platformEdge: React.ReactNode[] = [];
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      if (state.map[y][x] === "platform" && state.map[y + 1][x] === "track")
        platformEdge.push(
          <rect key={`pe${x},${y}`} x={x * S} y={(y + 1) * S - 4} width={S} height={4} fill="url(#hazard)" />,
        );

  // ── 방 ──
  const selectedRoomId =
    selection?.kind === "room" || selection?.kind === "facility" ? selection.roomId : null;

  const rooms = state.rooms.map((room) => {
    const def = ROOM_TYPE_BY_ID[room.type];
    const { x, y, w, h } = room.rect;
    const isResizing = mode.kind === "resizeRoom" && mode.roomId === room.id;
    const ok = access.roomAccess[room.id];
    const door = access.doors[room.id];
    const sel = selectedRoomId === room.id;
    return (
      <g key={room.id} opacity={isResizing ? 0.45 : 1}>
        <rect x={x * S} y={y * S} width={w * S} height={h * S} fill={def.color} fillOpacity={0.22} />
        <rect x={x * S} y={y * S} width={w * S} height={h * S} fill="url(#roomFloor)" />
        {!ok && <rect x={x * S} y={y * S} width={w * S} height={h * S} fill="url(#isolated)" />}
        {/* 벽 */}
        <rect
          x={x * S + 2}
          y={y * S + 2}
          width={w * S - 4}
          height={h * S - 4}
          fill="none"
          stroke="#1b1814"
          strokeWidth={4}
        />
        <rect
          x={x * S + 4}
          y={y * S + 4}
          width={w * S - 8}
          height={h * S - 8}
          fill="none"
          stroke={def.color}
          strokeWidth={1.5}
          strokeOpacity={0.9}
        />
        {/* 출입문 */}
        {door && <Door inside={door.inside} outside={door.outside} />}
        {sel && (
          <rect
            x={x * S}
            y={y * S}
            width={w * S}
            height={h * S}
            fill="none"
            stroke="#f2c14e"
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
        )}
      </g>
    );
  });

  const facilities = state.rooms.flatMap((room) =>
    room.facilities.map((f) => {
      const def = FACILITY_BY_ID[f.type];
      const r = facilityRect(f);
      const moving = mode.kind === "moveFacility" && mode.facilityId === f.id;
      const sel = selection?.kind === "facility" && selection.facilityId === f.id;
      return (
        <FacilityShape
          key={f.id}
          rect={r}
          glyph={def.glyph}
          color={ROOM_TYPE_BY_ID[def.room].color}
          durability={f.durability / def.maxDurability}
          selected={sel}
          faded={moving}
          fixed={def.fixed}
          status={p.statuses[f.id]}
        />
      );
    }),
  );

  const labels = state.rooms.map((room) => {
    const { x, y, w } = room.rect;
    const ok = access.roomAccess[room.id];
    const text = ok ? room.name : `${room.name} · 고립`;
    const maxChars = Math.max(3, Math.floor((w * S - 10) / 9));
    const shown = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
    return (
      <g key={`l${room.id}`} pointerEvents="none">
        <rect x={x * S + 5} y={y * S - 7} width={shown.length * 9 + 8} height={14} rx={3} fill={ok ? "#1b1814" : "#5a1f1a"} />
        <text x={x * S + 9} y={y * S + 3.5} fontSize={10} fill={ok ? "#e8dcc0" : "#ffd2c8"} fontWeight={600}>
          {shown}
        </text>
      </g>
    );
  });

  // ── 기반 시설 선 ──
  const lineLayer: React.ReactNode[] = [];
  const NET_STYLE = {
    power: { ok: "#f2c14e", dead: "#7d6a35", off: -5 },
    water: { ok: "#5fb4d4", dead: "#36606e", off: 5 },
  } as const;
  for (const net of ["water", "power"] as const) {
    const view = p.lineView[net];
    const st = NET_STYLE[net];
    const wid = p.showNetworks ? 5 : 3;
    for (const [k, v] of view) {
      const [x, y] = k.split(",").map(Number);
      const cx = x * S + S / 2 + st.off;
      const cy = y * S + S / 2 + st.off;
      const color = st[v];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        if (view.has(`${x + dx},${y + dy}`))
          lineLayer.push(
            <line key={`${net}${k}-${dx}`} x1={cx} y1={cy} x2={cx + dx * S} y2={cy + dy * S} stroke={color} strokeWidth={wid} strokeLinecap="round" />,
          );
      }
      lineLayer.push(<circle key={`${net}${k}`} cx={cx} cy={cy} r={wid / 2 + 1} fill={color} stroke="#000" strokeWidth={0.8} />);
    }
  }

  // ── 미리보기 ──
  let preview: React.ReactNode = null;
  const pc = p.previewOk ? "#7ed47e" : "#e0604f";
  if (mode.kind === "createRoom" && mode.rect) {
    const r = mode.rect;
    preview = (
      <g pointerEvents="none">
        <rect x={r.x * S} y={r.y * S} width={r.w * S} height={r.h * S} fill={pc} fillOpacity={0.25} stroke={pc} strokeWidth={2.5} strokeDasharray="7 4" />
        <text x={r.x * S + (r.w * S) / 2} y={r.y * S + (r.h * S) / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">
          {r.w}×{r.h}
        </text>
      </g>
    );
  } else if ((mode.kind === "placeFacility" || mode.kind === "moveFacility") && mode.pos) {
    const type =
      mode.kind === "placeFacility"
        ? mode.facilityType
        : state.rooms.find((r) => r.id === mode.roomId)?.facilities.find((f) => f.id === mode.facilityId)?.type;
    if (type) {
      const r = facilityRect({ type, x: mode.pos.x, y: mode.pos.y, rotated: mode.rotated });
      preview = (
        <g pointerEvents="none">
          <rect x={r.x * S + 2} y={r.y * S + 2} width={r.w * S - 4} height={r.h * S - 4} rx={4} fill={pc} fillOpacity={0.35} stroke={pc} strokeWidth={2.5} strokeDasharray="6 3" />
          <text x={r.x * S + (r.w * S) / 2} y={r.y * S + (r.h * S) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">
            {FACILITY_BY_ID[type].glyph}
          </text>
        </g>
      );
    }
  } else if (mode.kind === "markDebris" && mode.rect) {
    const r = mode.rect;
    const c = mode.remove ? "#e0604f" : "#f08a3c";
    preview = (
      <rect pointerEvents="none" x={r.x * S} y={r.y * S} width={r.w * S} height={r.h * S} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={2.5} strokeDasharray="6 4" />
    );
  } else if (mode.kind === "drawLine" && mode.path) {
    const color = mode.remove ? "#e0604f" : p.previewOk ? (mode.net === "power" ? "#f2c14e" : "#5fb4d4") : "#e0604f";
    preview = (
      <g pointerEvents="none">
        {mode.path.map((pt) => (
          <rect key={`lp${pt.x},${pt.y}`} x={pt.x * S + 4} y={pt.y * S + 4} width={S - 8} height={S - 8} rx={4} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} strokeDasharray={mode.remove ? "4 3" : undefined} />
        ))}
      </g>
    );
  } else if (mode.kind === "clearDebris" && mode.pos) {
    const r = debrisArea(state, mode.pos);
    preview = (
      <rect pointerEvents="none" x={r.x * S + 1} y={r.y * S + 1} width={r.w * S - 2} height={r.h * S - 2} fill={pc} fillOpacity={0.3} stroke={pc} strokeWidth={2.5} strokeDasharray="6 3" />
    );
  } else if (mode.kind === "resizeRoom") {
    const r = mode.rect;
    preview = (
      <rect pointerEvents="none" x={r.x * S} y={r.y * S} width={r.w * S} height={r.h * S} fill={pc} fillOpacity={0.18} stroke={pc} strokeWidth={3} strokeDasharray="8 4" />
    );
  }

  // 잔해 정리 모드: 통로와 맞닿아 바로 치울 수 있는 잔해 표시
  const debrisHints: React.ReactNode[] = [];
  if (mode.kind === "clearDebris") {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (
          state.map[y][x] === "debris" &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => access.corridor.has(`${x + dx},${y + dy}`))
        )
          debrisHints.push(<rect key={`dh${x},${y}`} x={x * S + 3} y={y * S + 3} width={S - 6} height={S - 6} fill="none" stroke="#f2c14e" strokeWidth={1.5} strokeDasharray="3 3" />);
  }

  // 생존자 잔해 정리 지정 표시
  const markLayer = state.debrisMarks.map((k) => {
    const [x, y] = k.split(",").map(Number);
    if (state.map[y]?.[x] !== "debris") return null;
    return (
      <g key={`mk${k}`}>
        <rect x={x * S + 2} y={y * S + 2} width={S - 4} height={S - 4} fill="#f08a3c22" stroke="#f08a3c" strokeWidth={1.5} />
        <path d={`M${x * S + 9} ${y * S + 9} L${x * S + S - 9} ${y * S + S - 9} M${x * S + S - 9} ${y * S + 9} L${x * S + 9} ${y * S + S - 9}`} stroke="#f08a3c" strokeWidth={2} />
      </g>
    );
  });

  const tileSel =
    selection?.kind === "tile" ? (
      <rect x={selection.x * S + 1} y={selection.y * S + 1} width={S - 2} height={S - 2} fill="none" stroke="#f2c14e" strokeWidth={2.5} />
    ) : null;

  return (
    <svg
      ref={svgRef}
      className="base-map"
      viewBox={`0 0 ${W * S} ${H * S}`}
      width={W * p.tilePx}
      height={H * p.tilePx}
      style={{ touchAction: dragMode ? "none" : "pan-x pan-y", cursor: mode.kind === "view" ? "pointer" : "crosshair" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      role="img"
      aria-label="거점 평면도"
    >
      <defs>
        <pattern id="floorGrid" width={S} height={S} patternUnits="userSpaceOnUse">
          <rect width={S} height={S} fill="none" stroke="#00000033" strokeWidth={1} />
          <circle cx={7} cy={23} r={0.8} fill="#ffffff10" />
          <circle cx={21} cy={9} r={0.6} fill="#ffffff10" />
        </pattern>
        <pattern id="roomFloor" width={8} height={8} patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="#ffffff08" strokeWidth={1} />
        </pattern>
        <pattern id="debris" width={S} height={S} patternUnits="userSpaceOnUse">
          <polygon points="4,26 10,16 16,24" fill="#5a4c3c" />
          <polygon points="15,12 24,6 28,15 20,18" fill="#4d4033" />
          <polygon points="18,28 26,22 30,30" fill="#62533f" />
          <rect x={6} y={6} width={6} height={3} fill="#6e5d48" transform="rotate(25 9 7)" />
        </pattern>
        <pattern id="rock" width={16} height={16} patternUnits="userSpaceOnUse">
          <path d="M0 16 L16 0" stroke="#ffffff07" strokeWidth={2} />
        </pattern>
        <pattern id="track" width={S} height={S} patternUnits="userSpaceOnUse">
          {[3, 13, 23].map((x) => (
            <rect key={x} x={x} y={0} width={5} height={S} fill="#3b342a" />
          ))}
          <rect x={0} y={9} width={S} height={2.5} fill="#77706a" />
          <rect x={0} y={21} width={S} height={2.5} fill="#77706a" />
        </pattern>
        <pattern id="hazard" width={12} height={4} patternUnits="userSpaceOnUse">
          <rect width={12} height={4} fill="#c9a227" />
          <path d="M0 4 L4 0 H8 L4 4 Z" fill="#1b1814" />
        </pattern>
        <pattern id="isolated" width={10} height={10} patternUnits="userSpaceOnUse">
          <path d="M0 10 L10 0" stroke="#e0604f66" strokeWidth={2} />
        </pattern>
      </defs>
      <g>{tiles}</g>
      <g>{platformEdge}</g>
      <g opacity={p.showNetworks ? 0.45 : 1}>{rooms}</g>
      <g>{facilities}</g>
      <g pointerEvents="none" opacity={p.showNetworks ? 1 : 0.85}>
        {lineLayer}
      </g>
      <g>{labels}</g>
      <g pointerEvents="none">
        {ZONES.filter((z) => !state.zones.includes(z.id)).map((z) => (
          <g key={`fog${z.id}`}>
            <rect x={z.rect.x * S} y={z.rect.y * S} width={z.rect.w * S} height={z.rect.h * S} fill="#0b0906" opacity={0.86} />
            <rect x={z.rect.x * S} y={z.rect.y * S} width={z.rect.w * S} height={z.rect.h * S} fill="url(#rock)" />
            <text x={(z.rect.x + z.rect.w / 2) * S} y={(z.rect.y + z.rect.h / 2) * S - 4} textAnchor="middle" fontSize={15} fontWeight={800} fill="#a39882">
              {z.name}
            </text>
            <text x={(z.rect.x + z.rect.w / 2) * S} y={(z.rect.y + z.rect.h / 2) * S + 14} textAnchor="middle" fontSize={11} fill="#7d7464">
              봉쇄 구역 · 셔터를 열어 개방
            </text>
          </g>
        ))}
      </g>
      <g pointerEvents="none">{markLayer}</g>
      {mode.kind === "clearDebris" && <g pointerEvents="none">{debrisHints}</g>}
      {state.phase === "night" && <rect pointerEvents="none" width={W * S} height={H * S} fill="#0b1636" opacity={0.32} />}
      {state.phase === "afternoon" && <rect pointerEvents="none" width={W * S} height={H * S} fill="#6b3d10" opacity={0.08} />}
      {tileSel}
      {preview}
    </svg>
  );
}

function Door({ inside, outside }: { inside: Point; outside: Point }) {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  // 문이 난 벽면 위치
  const cx = inside.x * S + S / 2 + (dx * S) / 2;
  const cy = inside.y * S + S / 2 + (dy * S) / 2;
  const horizontal = dy !== 0; // 위/아래 벽 → 가로로 긴 문
  const w = horizontal ? 18 : 8;
  const h = horizontal ? 8 : 18;
  return (
    <g pointerEvents="none">
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="#3a352d" />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="none" stroke="#c9a227" strokeWidth={1.5} />
    </g>
  );
}

function FacilityShape(props: {
  rect: Rect;
  glyph: string;
  color: string;
  durability: number;
  selected: boolean;
  faded: boolean;
  fixed: boolean;
  status?: FacilityStatus;
}) {
  const { rect: r, glyph, color, durability, selected, faded, fixed, status } = props;
  const x = r.x * S + 4;
  const y = r.y * S + 4;
  const w = r.w * S - 8;
  const h = r.h * S - 8;
  const barColor = durability > 0.6 ? "#7ed47e" : durability > 0.3 ? "#e3b341" : "#e0604f";
  return (
    <g opacity={faded ? 0.3 : 1} pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#221f1a" stroke={selected ? "#f2c14e" : color} strokeWidth={selected ? 3 : 2} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={2} fill={color} fillOpacity={0.25} />
      {fixed && <circle cx={x + w - 5} cy={y + 5} r={2.5} fill="#c9a227" />}
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={Math.min(11, 6 + w / 8)} fontWeight={700} fill="#efe6d2">
        {glyph}
      </text>
      {status && status !== "passive" && status !== "isolated" && <StatusBadge x={x} y={y} status={status} />}
      {status === "broken" && (
        <path d={`M${x + 6} ${y + 6} L${x + w - 6} ${y + h - 6} M${x + w - 6} ${y + 6} L${x + 6} ${y + h - 6}`} stroke="#e0604f" strokeWidth={2} opacity={0.7} />
      )}
      {durability < 1 && (
        <g>
          <rect x={x + 3} y={y + h - 6} width={w - 6} height={3} fill="#00000088" />
          <rect x={x + 3} y={y + h - 6} width={(w - 6) * durability} height={3} fill={barColor} />
        </g>
      )}
    </g>
  );
}

function StatusBadge({ x, y, status }: { x: number; y: number; status: FacilityStatus }) {
  const cx = x + 1;
  const cy = y + 1;
  if (status === "running")
    return <circle cx={cx + 5} cy={cy + 5} r={3.5} fill="#7ed47e" stroke="#0b1a0b" strokeWidth={1} />;
  const map: Partial<Record<FacilityStatus, { fill: string; text: string }>> = {
    off: { fill: "#6b655c", text: "Ⅱ" },
    broken: { fill: "#e0604f", text: "✕" },
    noFuel: { fill: "#e3a341", text: "연" },
    noPower: { fill: "#e8c547", text: "⚡" },
    noPowerLine: { fill: "#b0a070", text: "선" },
    noWaterLine: { fill: "#5fb4d4", text: "관" },
    noRawWater: { fill: "#5fb4d4", text: "수" },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <g>
      <rect x={cx} y={cy} width={13} height={13} rx={3} fill={m.fill} stroke="#000" strokeWidth={1} />
      <text x={cx + 6.5} y={cy + 10} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#15110b">
        {m.text}
      </text>
    </g>
  );
}
