"use client";

// 개발 현황: 어떤 기능이 실제로 작동하고 무엇이 예정인지 게임 안에서 바로 확인할 수 있게 한다.

const STAGES: { n: number; title: string; status: "done" | "next" | "todo"; items: string[] }[] = [
  {
    n: 1,
    title: "기본 화면 및 거점",
    status: "done",
    items: [
      "지하철 환승역 평면도 (암반·잔해·기둥·승강장·선로·출입구·급수원)",
      "방 생성 (드래그/두 번 탭) · 크기 변경 · 이름/용도 변경 · 철거",
      "방 내부 시설 설치 · 이동 · 회전 · 철거 (5종 방, 12종 시설)",
      "건설 비용 차감 · 철거 시 50% 회수",
      "통로 연결(출입 가능/고립) 판정 및 출입문 표시",
      "시설·방·타일 선택 및 정보 표시",
      "자동 저장 · 새로고침 후 이어하기 · 저장 데이터 검증",
    ],
  },
  {
    n: 2,
    title: "시간 및 행동",
    status: "done",
    items: [
      "오전 → 오후 → 야간 → 정비 시간 → 다음 날 오전",
      "구간당 행동 3회 (이월 없음), 행동 횟수 표시",
      "행동: 주변 탐색 · 자원 수집 · 식량 확보 · 잔해 정리 · 직접 수리",
      "야간 외부 활동 효율 감소",
      "구간 종료 전 예상 자원 변화·경고 확인",
      "구간마다 인원의 식량·식수 소비",
      "건설은 정비 시간에만, 행동은 낮 구간에만 (서로 분리)",
      "예정 행동(장소 조사·위험 제거·생존자 수색/구조·직접 제작)은 비활성 표시",
    ],
  },
  { n: 3, title: "자원 및 시설 운영", status: "next", items: ["시설별 생산·소비", "내구도·고장·수리", "저장 용량", "부족 경고"] },
  { n: 4, title: "기반 시설", status: "todo", items: ["전력선·수도관 연결", "발전량·소비량 계산", "연결 상태 시각화"] },
  { n: 5, title: "생존자", status: "todo", items: ["생존자 영입", "업무 배정", "피로도·건강"] },
  { n: 6, title: "사건 및 저장", status: "todo", items: ["무작위 사건", "사건 기록", "7일 생존 테스트"] },
];

const LABEL = { done: "작동", next: "다음 단계", todo: "예정" };

export default function StatusModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="개발 현황" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>개발 현황</h2>
          <button className="btn ghost small" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="muted small-text">
          현재 버전은 <b>2단계</b>입니다. 낮(오전·오후·야간)에는 행동으로 물자를 모으고 잔해를 치우며, 야간이 끝나면
          정비 시간에 거점을 설계합니다.
        </p>
        <ul className="stage-list">
          {STAGES.map((s) => (
            <li key={s.n} className={`stage stage-${s.status}`}>
              <div className="stage-head">
                <span className="stage-n">{s.n}단계</span>
                <span className="stage-title">{s.title}</span>
                <span className={`badge badge-${s.status}`}>{LABEL[s.status]}</span>
              </div>
              <ul>
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="muted small-text">지도의 방·시설 그림은 임시 그래픽입니다. 실제 시설 이미지는 이후 교체됩니다.</p>
      </div>
    </div>
  );
}
