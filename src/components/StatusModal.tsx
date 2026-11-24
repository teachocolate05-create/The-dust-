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
  {
    n: 3,
    title: "자원 및 시설 운영",
    status: "done",
    items: [
      "자원별 최대 저장량 (창고·탱크·사물함으로 확장, 넘치면 버려짐)",
      "시설 가동/정지, 구간별 생산·소비 (발전기 연료, 정수 필터 식수)",
      "전력 합계 계산 (발전량을 시설들이 나눠 씀)",
      "가동 시 내구도 감소 → 효율 저하 → 고장 위험 → 고장",
      "수리: 낮 '직접 수리' 행동 / 정비 시간 '정비 수리'",
      "직접 제작 (작업대): 부품 · 고체 연료",
      "자원 부족·고장 위험·저장 초과 경고",
      "시작 맵: 대합실 대부분이 잔해",
    ],
  },
  {
    n: 4,
    title: "기반 시설",
    status: "done",
    items: [
      "전력선·수도관 설치/철거 (정비 시간, 칸당 자재)",
      "이어진 선 = 하나의 망, 망별 발전량·소비량 계산",
      "급수원 → 수도관 → 정수 필터, 급수원 공급량 제한",
      "연결 상태 표시: 정상 / 미연결 / 공급 부족 / 고장",
      "시작 상태 축소: 임시 거주 구역만, 발전실·창고는 잔해 너머",
    ],
  },
  {
    n: 5,
    title: "생존자",
    status: "done",
    items: [
      "생존자 수색 → 구조 → 정비 시간에 수용 결정 (침상 필요)",
      "이름·나이·배경·능력치(기술·채집·의료·농업·관리)",
      "업무 배정: 휴식·잔해 정리·자원 수집·식량 확보·시설 관리·제작",
      "능력치·피로·야간에 따른 업무 효율",
      "피로도(작업·행동·밤잠), 건강(배급 부족·탈진), 위독·이탈",
      "잔해 정리 지정 구역 · 잔해 정리 행동은 1칸씩",
    ],
  },
  { n: 6, title: "사건 및 저장", status: "next", items: ["무작위 사건", "사건 기록", "7일 생존 테스트"] },
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
          현재 버전은 <b>5단계</b>입니다. 혼자 시작해 생존자를 찾아 데려오고, 업무를 맡겨 잔해를 치우고 물자를 모읍니다.
          인원이 늘수록 식량·식수와 침상이 더 필요합니다.
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
