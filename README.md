# SIGNALS

한국형 투자 시그널 에이전트 마켓플레이스.

- 요구사항: [SIGNALS 요구사항지시서 v1_0.md](./SIGNALS%20요구사항지시서%20v1_0.md)
- 구조 설계: [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md)
- 아키텍처 결정 기록: [docs/adr/](./docs/adr/)

## 저장소 구성

| 경로 | 내용 | 언어 | Phase |
|---|---|---|---|
| `apps/core-api` | 모듈러 모놀리스 (identity~audit 10개 모듈) | NestJS | P1~ |
| `apps/signal-service` | 시그널 발행·해시체인·검증 (분리 배포) | NestJS | P1 |
| `apps/notification-service` | 알림 팬아웃·채널 (분리 배포) | NestJS | P2 |
| `apps/web` | 구독자 웹 | Next.js | P2 |
| `apps/provider-console` | 공급자 콘솔 | Next.js | P2 |
| `apps/admin-console` | 관리자 콘솔 | Next.js | P3 |
| `batch/` | 시장데이터 수집·성과·랭킹 배치 | Python | P1 |
| `packages/domain` | 열거형, 상태머신 | TS | — |
| `packages/contracts` | API 에러 코드, 도메인 이벤트 | TS | — |
| `packages/database` | 스키마 마이그레이션 | SQL | — |

## 개발 환경

```bash
pnpm install
pnpm build          # TS 전체 빌드 (의존 순서 자동)

cd batch
python -m venv .venv && .venv/Scripts/activate
pip install -e ".[dev]"
```

## 규칙 (요약)

- 모듈 간 접근은 공개 서비스 레이어로만. 타 모듈 테이블 직접 SQL 금지 (SYS-003)
- `signal-service`는 subscription 관련 코드를 import하지 않는다 (REG-001)
- 시그널 테이블에 구독자 FK를 추가하는 마이그레이션은 거부된다 (REG-001)
- 성과 수치를 표시하는 모든 API 응답에는 `disclaimer` 필드 필수 (SYS-026)
