# @signals/web — 구독자 웹 (Next.js)

구독자(훈이) 관점의 프론트엔드. **Next.js 15 App Router + Tailwind v4 + cult-ui**.

> 현재는 **목 데이터(`src/lib/mock.ts`)로 렌더**한다. 백엔드의 랭킹(T13)·성과(T9~T12) API가 완성되면
> `src/lib/mock.ts`를 `/v1/*` fetch로 교체한다. 이 앱이 T22~T23(구독자 웹)의 토대다.

## 실행

```bash
# 저장소 루트에서
pnpm install
pnpm --filter @signals/web dev     # http://localhost:4000

# core-api(3000)가 떠 있으면 /v1/* 호출이 자동 프록시됨 (next.config.mjs rewrites)
```

빌드: `pnpm --filter @signals/web build`

## 화면 (구현됨)

| 경로 | 화면 | 핵심 |
|---|---|---|
| `/rankings` | 랭킹 | 리그·부문 탭, SIGNALS Score 정렬, **종료된 에이전트 노출**(생존편향 제거) |
| `/agents/[id]` | 에이전트 상세 | 성과 차트(vs 벤치마크 + 낙폭), **전체 시그널 이력**(손실·무효 포함), 규율 지표 |
| `/signals/[id]` | 시그널 상세 | 목표가·손절가·근거 + **무결성 검증**(해시체인) + 면책 고지 |
| `/transparency` | 투명성 리포트 | "N%만 시장을 이겼습니다" 정직 공개 |

## 디자인 시스템 (`src/app/globals.css`)

- **cult-ui**(shadcn 기반, nolly-studio/cult-ui) 시그니처 컴포넌트를 실제 이식해 사용 (`src/components/ui/`):
  - `texture-card` — 4겹 중첩 보더 + card/secondary 그라데이션의 질감 카드 (랭킹 카드·KPI 타일·상세 섹션)
  - `gradient-heading` — bg-clip-text 그라데이션 제목 (⚠️ Radix Slot 사용 → 파일에 `"use client"` 필수)
  - `texture-button` — 그라데이션 버튼 (상단바 시작하기·체험 CTA, variant=accent)
  - `animated-number` — 카운트업 숫자 (KPI)
  - ※ 2026-08-03 확인 결과 이전에는 이름만 적히고 texture-card/gradient-heading이 실제론 없었음 → 진짜 이식함.
- shadcn OKLCH 토큰 위에 **SIGNALS 브랜드 레이어**:
  - **황동(브론즈) 액센트** = "검증 봉인" 은유
  - **한국 시장 관례: 상승=빨강(`--up`), 하락=파랑(`--down`)** — `.up`/`.down` 클래스, `lib/format.ts`의 `dir()`
- 라이트/다크 양쪽 (`.dark` 클래스, TopBar 토글)
- 숫자·티커·해시는 모노폰트(`.mono`, tabular-nums)

## cult-ui 컴포넌트 추가 방법

`src/components/ui/`에 복사-붙여넣기 방식(shadcn 표준). Radix Slot 등 createContext를 쓰는 컴포넌트는
서버 컴포넌트에서 렌더되지 않도록 파일 상단에 `"use client"`를 붙일 것 (gradient-heading 참고).

## 주의 (다음 작업자용)

- 서버 컴포넌트 → 클라이언트 컴포넌트로 **함수 prop 전달 금지**. 직렬화 가능한 값만 (Kpi가 precision/prefix/suffix를 받는 이유).
- 목 데이터는 시안용 가짜 값. 실제 수치 아님.
- 규제: 수익률 표시엔 기간·표본수·면책 병기 필요(REG-005). 지금은 시안이라 최소 표기 — 실데이터 연동 시 강제할 것.
