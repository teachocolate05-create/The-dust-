"use client";

import { FACILITY_BY_ID } from "@/game/config/facilities";
import { RULES } from "@/game/config/rules";
import type { GameState, NetKind } from "@/game/core/types";
import { NET_NAMES } from "@/game/systems/network";
import { STATUS_LABEL, type PeriodSim } from "@/game/systems/operation";
import { canModifyBase, PHASE_NAMES } from "@/game/systems/phase";
import { CostTag } from "./Panels";
import type { Mode, Selection } from "./uiTypes";

interface Props {
  state: GameState;
  sim: PeriodSim;
  setMode: (m: Mode) => void;
  setSelection: (s: Selection) => void;
}

// 기반 시설 탭 (기획서 7장): 전력선·수도관 설치/철거, 망별 공급 현황, 연결 안 된 시설
export default function NetworkPanel({ state, sim, setMode, setSelection }: Props) {
  const canBuild = canModifyBase(state);
  const draw = (net: NetKind, remove: boolean) => setMode({ kind: "drawLine", net, remove, anchor: null, path: null, dragging: false });

  const machines = sim.reports.filter((r) => FACILITY_BY_ID[r.type].operates);
  const problems = machines.filter((r) => ["noPowerLine", "noWaterLine", "noPower", "noRawWater"].includes(r.status));
  const genUnlinked = machines.filter((r) => r.status === "running" && FACILITY_BY_ID[r.type].power > 0 && !r.powerNet);

  return (
    <div className="panel-body">
      <h3 className="panel-title">기반 시설</h3>
      <p className="muted small-text">
        시설은 설치만으로 작동하지 않습니다. 발전기에서 <b>전력선</b>을, 급수원에서 <b>수도관</b>을 끌어와 시설에 닿게 이어야 합니다. 선이 시설이 차지한 칸이나
        바로 옆 칸을 지나면 연결됩니다.
      </p>

      {!canBuild && (
        <div className="alert lock">
          🔒 전력선·수도관 설치와 철거는 <b>정비 시간</b>에만 가능합니다. 지금은 {PHASE_NAMES[state.phase]}입니다. 연결 상태는 언제든 확인할 수 있습니다.
        </div>
      )}

      <div className="net-tools">
        {(["power", "water"] as NetKind[]).map((net) => (
          <div key={net} className={`net-tool net-${net}`}>
            <div className="net-tool-head">
              <span className="net-swatch" />
              <b>{NET_NAMES[net].line}</b>
              <CostTag bundle={RULES.network.lineCost[net]} label="칸당" />
            </div>
            <div className="btn-row">
              <button className="btn primary small" disabled={!canBuild} onClick={() => draw(net, false)}>
                설치
              </button>
              <button className="btn small" disabled={!canBuild} onClick={() => draw(net, true)}>
                철거
              </button>
            </div>
          </div>
        ))}
      </div>

      {(problems.length > 0 || genUnlinked.length > 0) && (
        <>
          <h4 className="section-title">연결 문제</h4>
          <ul className="list">
            {[...genUnlinked, ...problems].map((r) => (
              <li key={r.facilityId}>
                <button className="list-item" onClick={() => setSelection({ kind: "facility", roomId: r.roomId, facilityId: r.facilityId })}>
                  <span className="grow">
                    {FACILITY_BY_ID[r.type].name} <span className="muted">· {state.rooms.find((x) => x.id === r.roomId)?.name}</span>
                  </span>
                  <span className={`status-pill st-${r.status === "running" ? "noPowerLine" : r.status}`}>
                    {r.status === "running" ? "전력선 미연결" : STATUS_LABEL[r.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="section-title">전력망</h4>
      {sim.powerNets.length === 0 ? (
        <p className="muted small-text">깔린 전력선이 없습니다.</p>
      ) : (
        <ul className="net-list">
          {sim.powerNets.map((n) => (
            <li key={n.id}>
              <div className="net-row">
                <b>전력망 {n.id}</b>
                <span className="muted small-text">{n.tiles}칸</span>
                <span className="grow" />
                {n.supply === 0 ? (
                  <span className="status-pill st-noPowerLine">발전기 없음</span>
                ) : n.demand > n.supply ? (
                  <span className="status-pill st-noPower">공급 부족</span>
                ) : (
                  <span className="status-pill st-running">정상</span>
                )}
              </div>
              <div className="power-bar">
                <div className="power-fill" style={{ width: n.supply ? `${Math.min(100, (n.used / n.supply) * 100)}%` : "0%" }} />
              </div>
              <span className="small-text muted">
                발전 {n.supply} · 필요 {n.demand} · 공급 {n.used}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="section-title">수도망</h4>
      {sim.waterNets.length === 0 ? (
        <p className="muted small-text">깔린 수도관이 없습니다. 급수원은 왼쪽 아래(발전실 옆) 파란 칸입니다.</p>
      ) : (
        <ul className="net-list">
          {sim.waterNets.map((n) => (
            <li key={n.id}>
              <div className="net-row">
                <b>수도망 {n.id}</b>
                <span className="muted small-text">{n.tiles}칸</span>
                <span className="grow" />
                {n.sources === 0 ? (
                  <span className="status-pill st-noWaterLine">급수원 없음</span>
                ) : (
                  <span className="status-pill st-running">급수원 {n.sources}곳</span>
                )}
              </div>
              <span className="small-text muted">
                원수 공급 {n.rawCapacity} · 사용 {n.rawUsed} (급수원 1곳당 {RULES.network.sourceOutput}/구간)
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="section-title">연결이 필요한 시설</h4>
      <ul className="effect-list">
        <li>
          <span>정수 필터</span>
          <span className="grow" />
          <span className="badge badge-todo">전력선 + 수도관(급수원)</span>
        </li>
        <li>
          <span>작업대</span>
          <span className="grow" />
          <span className="badge badge-todo">전력선</span>
        </li>
        <li>
          <span>재배상·자동 재배기·조리대·정제기·가공기</span>
          <span className="grow" />
          <span className="badge badge-todo">전력선</span>
        </li>
        <li>
          <span>발전기</span>
          <span className="grow" />
          <span className="badge badge-todo">전력선으로 소비 시설과 연결</span>
        </li>
      </ul>
    </div>
  );
}
