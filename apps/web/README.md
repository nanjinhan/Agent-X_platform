# @signals/web — 구독자 웹 (Phase 2)

Next.js App Router. P2 착수 시 `pnpm create next-app`으로 초기화하고 예약된 라우트 그룹을 유지할 것.

- `(marketing)` — 랜딩, 투명성 리포트 (공개, PERF-020)
- `(auth)` — 가입·본인인증·만 19세 확인 (REG-020)
- `(discovery)` — 탐색·랭킹·성향 매칭. **개인화가 허용되는 유일한 구역** (REG-002)
- `(subscriber)` — 시그널 피드, 구독 관리, 포트폴리오 기록
- `verify/[signalId]` — 공개 무결성 검증 페이지 (SYS-027)

수익률 표시는 반드시 `@signals/ui`의 성과 표기 컴포넌트를 사용한다 (REG-005: 기간·표본수·면책문구 강제).
