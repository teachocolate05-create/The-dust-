"use client";

import { useState } from "react";
import type { GameEvent, GameState } from "@/game/core/types";
import { PHASE_NAMES } from "@/game/systems/phase";

/** 시작 화면: 이어하기 / 새 게임 */
export function TitleScreen({
  saved,
  corrupt,
  onContinue,
  onNew,
}: {
  saved: GameState | null;
  corrupt: boolean;
  onContinue: (s: GameState) => void;
  onNew: () => void;
}) {
  const [confirmNew, setConfirmNew] = useState(false);
  return (
    <div className="title-screen">
      <div className="title-inner">
        <div className="title-mark">◆</div>
        <h1 className="title-name">THE DUST</h1>
        <p className="title-sub">폐쇄된 환승역, 혼자 남은 당신. 잔해를 치우고 불을 밝혀 생존 거점을 만드세요.</p>
        <div className="title-buttons">
          {saved && !saved.gameOver && (
            <button className="btn primary big" onClick={() => onContinue(saved)}>
              이어하기
              <span className="btn-sub">
                {saved.day}일차 {PHASE_NAMES[saved.phase]} · 인원 {saved.survivors.length}명
              </span>
            </button>
          )}
          {saved?.gameOver && (
            <p className="muted small-text">
              지난 게임은 {saved.gameOver.day}일차에 끝났습니다. {saved.gameOver.reason}
            </p>
          )}
          {saved && !saved.gameOver && !confirmNew ? (
            <button className="btn big" onClick={() => setConfirmNew(true)}>
              새 게임
            </button>
          ) : saved && !saved.gameOver ? (
            <div className="title-confirm">
              <p className="small-text">저장된 진행 상황이 지워집니다. 새로 시작할까요?</p>
              <div className="btn-row">
                <button className="btn danger" onClick={onNew}>
                  지우고 새로 시작
                </button>
                <button className="btn ghost" onClick={() => setConfirmNew(false)}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button className="btn primary big" onClick={onNew}>
              새 게임 시작
            </button>
          )}
        </div>
        {corrupt && <div className="alert warn">저장 데이터가 손상되어 불러올 수 없었습니다. 새 게임을 시작하세요.</div>}
        <p className="muted small-text">진행 상황은 이 브라우저에 자동 저장됩니다.</p>
      </div>
    </div>
  );
}

/** 구간이 끝날 때 일어난 사건 알림 */
export function EventModal({ events, state, onClose }: { events: GameEvent[]; state: GameState; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        {events.map((ev) => (
          <div key={ev.id} className={`event-card tone-${ev.tone}`}>
            <div className="event-kicker">
              사건 · {state.day}일차 {PHASE_NAMES[state.phase]}
            </div>
            <h2 className="event-title">{ev.title}</h2>
            <p>{ev.text}</p>
          </div>
        ))}
        <div className="btn-row end">
          <button className="btn primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/** 게임 오버 */
export function GameOverModal({ state, onNew, onHide }: { state: GameState; onNew: () => void; onHide: () => void }) {
  const go = state.gameOver!;
  const cleared = state.map.flat().filter((t) => t === "floor").length;
  const facilities = state.rooms.reduce((n, r) => n + r.facilities.length, 0);
  return (
    <div className="modal-backdrop dark">
      <div className="modal gameover" role="alertdialog">
        <div className="event-kicker">게임 오버</div>
        <h2 className="gameover-title">{go.day}일차에 쓰러졌다</h2>
        <p>{go.reason}</p>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-val">{go.day}</span>
            <span className="stat-label">버틴 날</span>
          </div>
          <div className="stat">
            <span className="stat-val">{state.survivors.length - 1}</span>
            <span className="stat-label">남은 생존자</span>
          </div>
          <div className="stat">
            <span className="stat-val">{facilities}</span>
            <span className="stat-label">시설</span>
          </div>
        </div>
        <p className="muted small-text">정리된 바닥 {cleared}칸 · 방 {state.rooms.length}개</p>
        <div className="btn-row end">
          <button className="btn ghost" onClick={onHide}>
            거점 둘러보기
          </button>
          <button className="btn primary" onClick={onNew}>
            새 게임
          </button>
        </div>
      </div>
    </div>
  );
}
