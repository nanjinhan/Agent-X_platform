# SIGNALS

한국형 투자 시그널 에이전트 마켓플레이스.

## 이어서 하려면 (다음 세션에 이것만 복붙)

새 Claude Code 세션에서 아래 한 줄이면 이어서 작업 가능:

```
https://github.com/nanjinhan/Agent-X_platform.git 클론해서 HANDOFF.md 읽고 이어서 작업해줘.
```

## 이 저장소를 처음 받았다면 (인수인계)

**순서대로 이것만 보면 이어서 작업할 수 있다.**

1. **[HANDOFF.md](./HANDOFF.md) ← 여기부터.** "어디까지 했고, 다음에 뭘 해야 하는지"의 단일 출처.
   맨 위에 현재 위치(완료 태스크 → 다음 태스크)가 적혀 있다.
2. **[docs/TASKS.md](./docs/TASKS.md)** — 전체 구현 계획 T1~T30과 각 상태(⬜/🔄/✅).
   HANDOFF가 "지금"이라면 이건 "전체 지도".
3. **[아래 빠른 시작](#빠른-시작-환경-셋업)** 으로 로컬 환경(DB·빌드)을 띄운다.
4. 그다음 HANDOFF의 "다음 작업" 섹션이 시키는 태스크를 시작한다.

> 진행 상태의 진실은 **HANDOFF.md와 docs/TASKS.md**에 있다. 대화 기록이나 기억이 아니라 이 두 파일을 믿을 것.
> 깃허브에 푸시할 때는 반드시 HANDOFF.md를 먼저 갱신한다.

### 배경 문서

- 비전(왜·어디까지): [VISION.md](./VISION.md) — 사회적 미션, 확장 층위(교육·ESG·광주), 경계
- 요구사항 원문(SRS): [SIGNALS 요구사항지시서 v1_0.md](./SIGNALS%20요구사항지시서%20v1_0.md) — 코드 주석의 `REG-xxx`, `SYS-xxx` 등 요구사항 ID의 출처
- 구조 설계: [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md) — 모듈 경계, 테이블 소유권, 규제 강제 포인트
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

## 빠른 시작 (환경 셋업)

요구: Node 20+, pnpm 9, Docker, Python 3.12+

```bash
# 1) TypeScript
pnpm install
pnpm build                        # TS 전체 빌드 (의존 순서 자동)

# 2) 로컬 인프라 (Postgres 5433, Redis 6379)
cp .env.example .env              # 로컬 기본값 그대로 동작
docker compose up -d --wait

# 3) DB 스키마 적용 (마이그레이션 러너 도입 전 psql 직접 실행)
docker exec signals-postgres psql -U signals -d signals -f /migrations/0001_init.sql
docker exec signals-postgres psql -U signals -d signals -f /migrations/0002_partitions.sql

# 4) Python 배치
cd batch
python -m venv .venv && .venv/Scripts/activate   # Windows. mac/linux: source .venv/bin/activate
pip install -e ".[dev]"
pytest                            # 단위 테스트

# (선택) 시장데이터 적재 — T2/T3 결과물
python -m signals_batch.ingestion.kr.backfill --days 45   # 국내 (네이버·KIND)
python -m signals_batch.ingestion.us.backfill --days 45   # 미국·환율·벤치마크 (야후)
```

> Postgres 호스트 포트는 **5433**이다 (5432는 개발 PC의 다른 프로젝트가 점유하는 경우가 있어 회피).
> 데이터 소스는 정식 계약 전까지 무료 소스(네이버·KIND·야후)로 우회 구현되어 있다 — 한계는 HANDOFF.md 참조.

## 규칙 (요약)

- 모듈 간 접근은 공개 서비스 레이어로만. 타 모듈 테이블 직접 SQL 금지 (SYS-003)
- `signal-service`는 subscription 관련 코드를 import하지 않는다 (REG-001)
- 시그널 테이블에 구독자 FK를 추가하는 마이그레이션은 거부된다 (REG-001)
- 성과 수치를 표시하는 모든 API 응답에는 `disclaimer` 필드 필수 (SYS-026)
