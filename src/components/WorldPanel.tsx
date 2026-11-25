"use client";

import { useState } from "react";
import { FACTION_BY_ID, FACTIONS, REGION_BY_ID, REGIONS, WORLD_RULES, type RegionId } from "@/game/config/world";
import { RESOURCE_BY_ID } from "@/game/config/resources";
import type { GameState, ResourceId } from "@/game/core/types";
import { canModifyBase } from "@/game/systems/phase";
import * as world from "@/game/systems/world";
import type { GameAction } from "@/game/state/reducer";
import { CostTag } from "./Panels";

interface Props {
  state: GameState;
  run: (a: GameAction, msg?: string) => void;
}

const DANGER = ["", "낮음", "보통", "높음"];

// 업데이트 4: 지상(외부 세계) 탭
export default function WorldPanel({ state, run }: Props) {
  const [selected, setSelected] = useState<RegionId>("plaza");
  const [team, setTeam] = useState<string[]>([]);
  const [clinicTarget, setClinicTarget] = useState<string>("");
  const maint = canModifyBase(state);
  const region = REGION_BY_ID[selected];
  const info = state.world.regions[selected];
  const discovered = (id: RegionId) => state.world.regions[id]?.discovered;
  const frontier = REGIONS.filter((r) => !discovered(r.id) && REGIONS.some((k) => discovered(k.id) && k.links.includes(r.id)));
  const away = state.world.expeditions;
  const send = world.canSendExpedition(state, selected, team);
  const def = world.defensePower(state);

  return (
    <div className="panel-body">
      <h3 className="panel-title">지상</h3>
      <p className="muted small-text">
        '지상 탐사' 행동으로 주변 지역을 찾고, 정비 시간에 생존자를 원정 보내 물자를 가져옵니다. 원정 중인 사람은 거점에 없으므로 식량을 먹지 않고 일도 하지 않습니다.
      </p>

      {/* 지상 지도 */}
      <svg className="world-map" viewBox="0 0 100 100" role="img" aria-label="지상 지도">
        {REGIONS.filter((r) => discovered(r.id)).flatMap((r) =>
          r.links
            .filter((l) => discovered(l) || frontier.some((f) => f.id === l))
            .map((l) => (
              <line
                key={`${r.id}-${l}`}
                x1={r.pos.x}
                y1={r.pos.y}
                x2={REGION_BY_ID[l].pos.x}
                y2={REGION_BY_ID[l].pos.y}
                stroke={discovered(l) ? "#6b5a3c" : "#3a332a"}
                strokeWidth={0.8}
                strokeDasharray={discovered(l) ? undefined : "2 2"}
              />
            )),
        )}
        {REGIONS.map((r) => {
          const known = discovered(r.id);
          const edge = frontier.some((f) => f.id === r.id);
          if (!known && !edge) return null;
          const exp = away.some((e) => e.regionId === r.id);
          const fac = r.faction && state.world.factions[r.faction]?.contacted ? r.faction : null;
          return (
            <g key={r.id} className="world-node" onClick={() => known && setSelected(r.id)} style={{ cursor: known ? "pointer" : "default" }}>
              <circle cx={r.pos.x} cy={r.pos.y} r={selected === r.id ? 5.2 : 4.2} fill={known ? (fac === "raiders" ? "#7a2c22" : fac ? "#3c5a33" : "#4a4236") : "#1c1915"} stroke={selected === r.id ? "#f2c14e" : known ? "#a39882" : "#4a4236"} strokeWidth={selected === r.id ? 1.2 : 0.6} />
              <text x={r.pos.x} y={r.pos.y + 1.4} textAnchor="middle" fontSize={3.6} fill={known ? "#efe6d2" : "#6b655c"} fontWeight={700}>
                {known ? r.distance : "?"}
              </text>
              <text x={r.pos.x} y={r.pos.y + 9} textAnchor="middle" fontSize={3.3} fill={known ? "#d8ccb0" : "#5a5247"}>
                {known ? r.name : "미확인"}
              </text>
              {exp && <circle cx={r.pos.x + 4} cy={r.pos.y - 4} r={1.6} fill="#f2c14e" />}
            </g>
          );
        })}
        <text x={50} y={44} textAnchor="middle" fontSize={3} fill="#c9a227">▼ 거점 입구</text>
      </svg>
      <p className="muted small-text">원 안 숫자 = 다녀오는 데 걸리는 날 · 노란 점 = 원정대가 가 있는 곳 · 붉은 원 = 적대 집단</p>

      {/* 선택한 지역 */}
      {info?.discovered && (
        <div className="zone-card open-solid">
          <div className="zone-head">
            <b>{region.name}</b>
            <span className="grow" />
            <span className="status-pill st-off">위험 {DANGER[region.danger]}</span>
          </div>
          <p className="small-text">{region.desc}</p>
          <p className="small-text muted">
            왕복 {region.distance}일 · 물자{" "}
            {Object.entries(region.loot)
              .map(([k, [a, b]]) => `${RESOURCE_BY_ID[k as ResourceId].name} ${a}~${b}`)
              .join(", ")}{" "}
            · 남은 양 {Math.round(world.regionStock(state, selected) * 100)}%
            {region.faction && ` · ${FACTION_BY_ID[region.faction].name}의 근거지`}
          </p>
          {away.some((e) => e.regionId === selected) ? (
            <p className="small-text">원정대가 가 있습니다.</p>
          ) : (
            <>
              <h4 className="section-title">원정대 꾸리기 (최대 {WORLD_RULES.maxTeam}명)</h4>
              <ul className="check-list">
                {state.survivors
                  .filter((s) => !s.isPlayer)
                  .map((s) => {
                    const p = world.teamProblem(s);
                    const on = team.includes(s.id);
                    return (
                      <li key={s.id}>
                        <label className={p ? "muted" : ""}>
                          <input
                            type="checkbox"
                            disabled={!!p}
                            checked={on && !p}
                            onChange={() => setTeam(on ? team.filter((x) => x !== s.id) : [...team, s.id])}
                          />
                          {s.name} <span className="muted small-text">채집 {s.skills.gather} · 피로 {s.fatigue}</span>
                          {p && <span className="small-text"> — {p}</span>}
                        </label>
                      </li>
                    );
                  })}
              </ul>
              {state.survivors.length <= 1 && <p className="muted small-text">원정 보낼 생존자가 없습니다. 먼저 생존자를 영입하세요.</p>}
              {team.length > 0 && (
                <p className="small-text">
                  대원별 부상 확률 약 {Math.round(world.expeditionRisk(state, selected, team) * 100)}% · <CostTag bundle={world.expeditionCost(selected, team.length)} have={state.resources} label="준비물" />
                </p>
              )}
              <button
                className="btn primary"
                disabled={!send.ok}
                onClick={() => {
                  run({ type: "SEND_EXPEDITION", regionId: selected, memberIds: team }, `${region.name}(으)로 원정대를 보냈습니다.`);
                  setTeam([]);
                }}
              >
                원정 출발
              </button>
              {!send.ok && team.length > 0 && <p className="warn-text small-text">{send.reason}</p>}
              {!maint && <p className="muted small-text">원정대는 정비 시간에 꾸려 다음 날 아침 출발합니다.</p>}
            </>
          )}
        </div>
      )}

      {away.length > 0 && (
        <>
          <h4 className="section-title">원정 중</h4>
          <ul className="list">
            {away.map((e) => (
              <li key={e.id} className="list-item static">
                <span className="grow">
                  {REGION_BY_ID[e.regionId as RegionId].name} <span className="muted">· {e.members.map((m) => m.name).join(", ")}</span>
                </span>
                <span className="status-pill st-noFuel">{e.daysLeft}일 뒤 귀환</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 다른 집단 */}
      <h4 className="section-title">다른 생존자 집단</h4>
      {FACTIONS.filter((f) => state.world.factions[f.id].contacted).length === 0 && (
        <p className="muted small-text">아직 만난 집단이 없습니다. 원정을 보내 다른 지역을 돌아보세요.</p>
      )}
      {FACTIONS.filter((f) => state.world.factions[f.id].contacted).map((f) => {
        const fs = state.world.factions[f.id];
        const giftChk = world.canGift(state, f.id);
        return (
          <div key={f.id} className={`zone-card open-solid faction-${f.id}`}>
            <div className="zone-head">
              <b>{f.name}</b>
              <span className="grow" />
              <span className={`status-pill ${fs.relation >= 0 ? "st-running" : "st-broken"}`}>
                {world.factionAttitude(fs.relation)} {fs.relation}
              </span>
            </div>
            <p className="small-text muted">{f.desc}</p>
            <div className="rel-bar">
              <div className="rel-fill" style={{ left: fs.relation >= 0 ? "50%" : `${50 + fs.relation / 2}%`, width: `${Math.abs(fs.relation) / 2}%`, background: fs.relation >= 0 ? "var(--ok)" : "var(--bad)" }} />
            </div>
            <div className="trade-list">
              {f.offers.map((o, i) => {
                const c = world.canTrade(state, f.id, i);
                return (
                  <button key={i} className="btn small trade-btn" disabled={!c.ok} title={c.ok ? "" : c.reason} onClick={() => run({ type: "TRADE", factionId: f.id, index: i }, "거래했습니다.")}>
                    <CostTag bundle={o.give} have={state.resources} /> → <CostTag bundle={world.offerGet(state, f.id, o)} />
                  </button>
                );
              })}
            </div>
            {(() => {
              const c = world.canTrade(state, f.id, 0);
              return !c.ok ? <p className="muted small-text">교역: {c.reason}</p> : <p className="muted small-text">교역은 하루 한 번, 관계 +2. 관계 50 이상이면 받는 양 +1.</p>;
            })()}
            <div className="btn-row">
              <button className="btn small" disabled={!giftChk.ok} onClick={() => run({ type: "GIFT", factionId: f.id }, `${f.name}에 선물을 보냈습니다.`)}>
                선물 보내기 (관계 +{f.gift.gain})
              </button>
              <CostTag bundle={f.gift.give} have={state.resources} />
            </div>
            {f.clinic && (
              <div className="btn-row">
                <select className="input compact" value={clinicTarget} onChange={(e) => setClinicTarget(e.target.value)} aria-label="진료 받을 사람">
                  <option value="">진료 받을 사람</option>
                  {state.survivors
                    .filter((s) => s.conditions.length)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.isPlayer ? "나" : s.name}
                      </option>
                    ))}
                </select>
                <button
                  className="btn small"
                  disabled={!clinicTarget || !world.canClinic(state, clinicTarget).ok}
                  onClick={() => {
                    run({ type: "CLINIC", survivorId: clinicTarget }, "진료를 받았습니다.");
                    setClinicTarget("");
                  }}
                >
                  진료 의뢰
                </button>
                <CostTag bundle={f.clinic} have={state.resources} />
              </div>
            )}
            {f.hostile && fs.relation < WORLD_RULES.raidRelation && <p className="warn-text small-text">관계가 {WORLD_RULES.raidRelation} 미만이면 밤사이 습격해 올 수 있습니다.</p>}
          </div>
        );
      })}

      {/* 방어 */}
      <h4 className="section-title">방어</h4>
      <p className="small-text">
        방어력 <b>{def.total}</b> (인원 {def.people} + 경비 {def.guards} + 경비실 시설 {def.facilities}) · 오늘 밤 예상 습격 세기 <b>{world.raidStrength(state)}</b>
      </p>
      <p className="muted small-text">
        {world.raidPossible(state)
          ? "약탈단의 습격이 올 수 있습니다. 경비실에 바리케이드·감시 초소를 짓고 '경비' 업무를 맡기세요."
          : state.day < WORLD_RULES.raidStartDay
            ? `${WORLD_RULES.raidStartDay}일차부터 습격이 올 수 있습니다.`
            : "약탈단과의 관계가 나쁘지 않아 당분간 습격은 없습니다."}
      </p>
    </div>
  );
}
