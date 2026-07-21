# HANDOFF — 작업 인수인계 문서

> **이 문서의 목적**: 누가 이어받든(다음 세션의 Claude Code, 다른 개발자) 여기만 읽으면
> "어디까지 했고, 다음에 뭘 해야 하는지" 알 수 있게 한다.
> **규칙: 깃허브에 푸시할 때마다 이 문서를 먼저 갱신한다.**

**마지막 갱신**: 2026-07-21
**현재 위치**: T1 완료 → **다음 작업: T2 (국내 시장데이터 수집)**

---

## 1. 프로젝트 개요

한국형 투자 시그널 에이전트 마켓플레이스 **SIGNALS**.
유사투자자문업 모델. 핵심 차별점은 해시체인 기반 조작 불가능한 성과 검증.

| 문서 | 내용 |
|---|---|
| [SIGNALS 요구사항지시서 v1_0.md](./SIGNALS%20요구사항지시서%20v1_0.md) | SRS 원문 (5,047줄). 요구사항 ID(REG/AGT/SIG/PERF/SYS…)의 출처 |
| [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md) | 저장소 구조 설계 — 모듈 경계, 테이블 소유권, 규제 강제 포인트 |
| [docs/TASKS.md](./docs/TASKS.md) | 구현 태스크 T1~T30, 상태 표기 포함 |
| [docs/adr/](./docs/adr/) | 아키텍처 결정 기록 (ADR-0001: NestJS 채택) |

## 2. 완료된 것

### 스캐폴드 (2026-07-21)
- pnpm 모노레포: `apps/core-api`(NestJS, 10개 모듈), `apps/signal-service`, `apps/notification-service`, 프론트 3종 스텁, `batch/`(Python), `packages/{domain,contracts,database,ui}`
- `@signals/domain`: SRS 6.3 상태머신·열거형 구현 완료
- `@signals/contracts`: 에러 코드(SYS-024)·도메인 이벤트(SYS-004) 타입 완료
- TS 전체 빌드 통과, core-api 부팅 확인됨

### T1 — 로컬 인프라 (2026-07-21 완료)
- `docker-compose.yml`: Postgres 15(**호스트 포트 5433** — 5432는 이 PC의 다른 프로젝트가 점유), Redis 7
- 마이그레이션 0001(SRS 16.1 스키마 26개 테이블)·0002(초기 파티션) 적용 검증
- **SRS 정오 발견**: 16.1의 `notification_deliveries`·`audit_logs`는 단독 PK로는 파티션 생성 불가 → 복합 PK로 정정 (마이그레이션 파일에 주석 있음)
- 스모크 테스트: 시그널 불변 트리거(`Signal content is immutable`) 작동 확인

## 3. 다음 작업: T2 — 국내 시장데이터 수집

**위치**: `batch/src/signals_batch/ingestion/kr/` (현재 빈 스텁)

**할 일** (SYS-007, SYS-009, SYS-011):
1. KRX 일봉(OHLCV)·종목마스터 수집기 — 공개 소스(KRX 정보데이터시스템 OTP 방식 또는 네이버금융)로 시작 가능, API 키 불필요
2. 거래 캘린더 적재 (`trading_calendar`)
3. 품질검증 6종: 결측 / 이상치(±50%) / OHLC 정합성 / 거래량 음수 / 중복 / 지연 → 실패 시 `ingestion/quality`에서 거부·플래그
4. **완료 기준**: 실데이터 30일치가 `daily_prices`·`instruments`에 적재되고 검증 통과

**T2 이후**: T3(미국·환율·벤치마크) → T4(identity) → … 전체 순서는 [docs/TASKS.md](./docs/TASKS.md).
크리티컬 패스는 **T2→T9→T12** (시장데이터 → 기준가 → 골든 테스트 오차 0.01%p).

## 4. 개발 환경 셋업 (새로 받은 사람용)

```bash
# 요구: Node 20+, pnpm 9, Docker, Python 3.12+
pnpm install
pnpm build                        # TS 전체 빌드 (의존 순서 자동)

cp .env.example .env              # 로컬 기본값 그대로 동작
docker compose up -d --wait       # Postgres(5433) + Redis(6379)

# 마이그레이션 (아직 러너 미도입, psql 직접 실행)
docker exec signals-postgres psql -U signals -d signals -f /migrations/0001_init.sql
docker exec signals-postgres psql -U signals -d signals -f /migrations/0002_partitions.sql

# Python 배치
cd batch
python -m venv .venv && .venv/Scripts/activate    # Windows
pip install -e ".[dev]"
```

## 5. 절대 어기면 안 되는 것 (요약)

1. **REG-001**: `signals` 테이블에 구독자 참조 금지. signal-service는 subscription 코드를 import하지 않는다. 시그널 생성에 개인화 진입 금지.
2. **SIG-007**: 발행된 시그널 내용 수정 절대 불가 (DB 트리거로도 막혀 있음). 오타도 정정 시그널 재발행.
3. **T6(해시체인)은 비가역**: 해시 입력 필드·서명 방식은 확정 후 변경 시 과거 체인 재구성 불가. 구현 전 설계 리뷰 필수.
4. **SYS-003**: 타 모듈 테이블 직접 SQL 금지. 모듈 공개 서비스 레이어로만.
5. 성과 수치 응답에는 `disclaimer` 필드 필수 (SYS-026), 표기는 기간·표본수·면책 병기 (REG-005).

## 6. 결정 이력 (요약)

- 백엔드 **NestJS 확정** (ADR-0001) — 팀 언어 경계, 모듈 강제, 타입 공유
- 배치는 **Python** (SYS-006 명시)
- turbo 미도입 (pnpm -r로 충분, 앱 늘면 도입)
- 마이그레이션 러너 미도입 (P1 중 node-pg-migrate 또는 dbmate 도입 예정)
