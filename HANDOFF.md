# HANDOFF — 작업 인수인계 문서

> **이 문서의 목적**: 누가 이어받든(다음 세션의 Claude Code, 다른 개발자) 여기만 읽으면
> "어디까지 했고, 다음에 뭘 해야 하는지" 알 수 있게 한다.
> **규칙: 깃허브에 푸시할 때마다 이 문서를 먼저 갱신한다.**

**마지막 갱신**: 2026-07-21
**현재 위치**: T1·T2·T3 완료 → **다음 작업: T4 (identity 모듈 — 가입·로그인·본인인증)**

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

### T2 — 국내 시장데이터 수집 (2026-07-21 완료)
- **소스 전환 결정**: KRX data.krx.co.kr 직접 호출이 이 네트워크에서 400 "LOGOUT" 차단
  → **네이버 금융 시세 API(`naver_client.py`) + KIND 상장법인목록(`kind_client.py`)** 조합으로 구현.
  `krx_client.py`는 차단 기록과 함께 보존 (정식 데이터 계약 시 재구현 지점).
- 실행: `cd batch && .venv/Scripts/python -m signals_batch.ingestion.kr.backfill --days 45`
- 결과: 2,635종목 × 개장일 30일 = **75,125행 적재**, 미거래일(OHLC 없음+거래량 0) 2,769행 거부, 플래그 0
- 품질검증(SYS-009) 6종 구현: `ingestion/quality/validators.py` + 단위테스트 14건 (`pytest` 통과)
- 거래 캘린더: market='KR' 공통, "데이터 존재 = 개장일" 방식 (정식 휴장일 소스는 후속)
- **후속 보강 필요** (T9 슬리피지·REG-013 전까지): 시가총액, 거래대금(value), ETF 마스터, 수정주가 계수

### T3 — 미국·환율·벤치마크 수집 (2026-07-21 완료)
- **무료 구현**: Polygon(키 필요) 대신 **야후 파이낸스 차트 API**(`yahoo_client.py`, 키 불필요).
  개별주·지수·환율이 같은 엔드포인트. 실행: `python -m signals_batch.ingestion.us.backfill --days 45`
- 적재: 미국 34종목(NASDAQ 16 + NYSE 18) 986행, USDKRW 31행, 벤치마크 SPX_TR/KOSPI200_TR 각 29, US 캘린더 29개장일
- **주의할 한계**:
  - `KOSPI200_TR`은 실제로 **가격지수(`^KS200`) 근사** — 무료 TR 소스 부재. 배당수익률(~2%/년)만큼 벤치마크가 과소 → 알파(PERF-015)가 그만큼 과대 계상됨. **정식 데이터 계약 시 실제 TR로 교체 필수.**
  - 미국 유니버스는 전체가 아니라 유동성 상위 34종목 시드(`us_universe.py`). 자체 에이전트 시연엔 충분하나 확장 필요.
  - 거래대금·시가총액·수정주가 계수 여전히 없음(T2와 동일 후속 항목).

## 3. 다음 작업: T4 — identity 모듈

**위치**: `apps/core-api/src/modules/identity/` (빈 모듈 스켈레톤)

**할 일** (SYS-025, REG-010, REG-020, SEC-001~004):
1. 가입·로그인·소셜(kakao/naver/google/apple)·로그아웃·탈퇴 — API 8종은 SRS 17.2 참조
2. JWT: Access 30분(메모리) + Refresh 30일(HttpOnly), Refresh 회전 + 재사용 감지(SYS-025)
3. 본인인증(휴대폰) 연동 + 만 19세 미만 차단(REG-020) — 실 PASS 연동은 목킹 가능, 인터페이스만 확정
4. 비밀번호 Argon2id, deny-by-default 인가(SEC-005)
5. `packages/domain`의 `UserRole` 사용, 소유 테이블은 `users`·`user_risk_profiles`
6. **완료 기준**: 인증 API 8종 동작, 만 19세 차단 확인

**T4 이후**: T5(provider·agent) → T6(해시체인, 비가역) → … [docs/TASKS.md](./docs/TASKS.md).
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
