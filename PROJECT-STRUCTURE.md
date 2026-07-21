# SIGNALS 프로젝트 구조 설계서

> 근거 문서: `SIGNALS 요구사항지시서 v1_0.md` (v1.0, 2026-07-21)
> 본 문서는 SRS의 아키텍처 요구사항(15장), 데이터 모델(16장), API 명세(17장), MVP 범위(21장)를
> 실제 저장소 구조로 변환한 것이다. 각 결정에는 관련 요구사항 ID를 병기한다.

---

## 1. 구조를 결정한 제약 요약

| 제약 | 출처 | 구조에 미치는 영향 |
|---|---|---|
| 모듈러 모놀리스 | SYS-001 | 단일 Core API 앱 + 내부 모듈 경계 강제 |
| 시그널 발행·전달 경로 분리 | SYS-001, SYS-012 | `signal-service` 별도 배포 단위 (Core 장애 시에도 발행 가능) |
| 알림 파이프라인 분리 | SYS-015~017 | `notification-service` 별도 배포 단위 |
| 성과 계산은 Python | SYS-006 | `batch/` 를 Python 프로젝트로 분리, DB·이벤트로만 통신 |
| 모듈 간 Service Layer 통신만 허용, 타 모듈 테이블 직접 SQL 금지 | SYS-003 | 모듈별 `repository`는 자기 테이블만 소유, 공개 인터페이스는 `<module>/api.ts` |
| 시그널 동일성 원칙 — 시그널에 subscriber 참조 금지 | REG-001 | `signal` 모듈은 `subscription` 모듈에 의존하지 않음 (컴파일 타임 강제) |
| 개인화는 탐색 계층까지만 | REG-002 | 추천/성향 매칭 코드는 `discovery`(프론트+ranking read)에만 존재 |
| 팀 4~6인 규모 | 22.3 | 단일 모노레포, 과도한 패키지 분할 금지 |

**기술 스택 결정 (SYS-005 범위 내, 확정)**
- Core API / 분리 서비스: **TypeScript + NestJS** (확정) — 모듈 경계·DI 강제가 SYS-002/003 구현에 유리, 팀 언어 경계(TS=API/프론트, Python=배치)와 일치
- 배치(성과·랭킹·시장데이터): **Python 3.12 + pandas/numpy** (SYS-006 명시)
- 프론트: **Next.js App Router** (SYS-005), 잡 큐: **BullMQ**(TS) / **Celery 불요** — Python 배치는 스케줄 기반
- DB: PostgreSQL 15+ / Redis 7+ / S3 호환 스토리지

---

## 2. 저장소 전략

**단일 모노레포** (pnpm workspaces + Python 서브프로젝트 공존).

- 4~6인 팀에서 폴리레포는 도메인 이벤트 스키마·DTO 동기화 비용이 크다
- Python 배치는 `batch/` 아래 독립 프로젝트로 두되 같은 저장소에서 마이그레이션과 함께 버전 관리
- 배포 단위는 4개: `core-api`, `signal-service`, `notification-service`, `batch`(스케줄 워커) + 프론트 3종

---

## 3. 전체 디렉터리 트리

```
signals/
├── apps/
│   ├── core-api/                    # 모듈러 모놀리스 (NestJS) — SYS-001
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── modules/             # SYS-002의 13개 모듈 중 10개
│   │   │       ├── identity/        # 인증·인가·본인인증 (의존: 없음)
│   │   │       ├── provider/        # 공급자·심사·정산정보 (의존: identity)
│   │   │       ├── agent/           # 에이전트·룰·상태머신 (의존: provider)
│   │   │       ├── marketdata/      # 종목마스터·캘린더 조회 (의존: 없음) ※ 수집은 batch
│   │   │       ├── ranking/         # 랭킹 조회 API (산출은 batch) (의존: performance-read)
│   │   │       ├── subscription/    # 구독·체험·상태 (의존: identity, agent)
│   │   │       ├── billing/         # 결제·환불·PG (의존: subscription)
│   │   │       ├── settlement/      # 공급자 정산 (의존: billing, provider)
│   │   │       ├── moderation/      # 금칙어·이상탐지 플래그 (의존: signal-read, agent)
│   │   │       └── audit/           # 감사 로그 (의존: * — append-only)
│   │   └── test/
│   │
│   ├── signal-service/              # 시그널 발행·전달 (분리 배포) — SYS-012~014
│   │   ├── src/
│   │   │   ├── publish/             # 발행 트랜잭션 13단계 검증 (17.6), 멱등성
│   │   │   ├── hashchain/           # sequence_no 채번, prev_hash, content_hash, 서버 서명 — SIG 8.2
│   │   │   ├── pairing/             # 진입-청산 페어링 — 8.5
│   │   │   ├── verify/              # 공개 무결성 검증 API — SYS-027, /v1/signals/{id}/verify
│   │   │   └── feed/                # 구독자 시그널 피드 조회
│   │   └── test/
│   │
│   ├── notification-service/        # 알림 발송 (분리 배포) — SYS-015~017
│   │   ├── src/
│   │   │   ├── fanout/              # SignalPublished → 구독자 조회 → 500명 배치 분할
│   │   │   ├── channels/            # push / email / in-app 어댑터
│   │   │   ├── scheduler/           # 정기결제 7일 전 고지(REG-017), 체험 종료 24h 알림(SUB-005)
│   │   │   └── delivery/            # 전송 결과 기록, 재시도 큐, 시각 분포 모니터링(SYS-017)
│   │   └── test/
│   │
│   ├── web/                         # 구독자 웹 (Next.js) — Phase 2
│   │   └── src/app/
│   │       ├── (marketing)/         # 랜딩, 투명성 리포트(공개) — PERF-020
│   │       ├── (auth)/              # 가입, 본인인증, 만19세 확인 — REG-020
│   │       ├── (discovery)/         # 탐색·랭킹·성향 매칭 — 개인화 허용 구역(REG-002)
│   │       ├── (subscriber)/        # 시그널 피드, 구독 관리, 포트폴리오 기록
│   │       └── verify/[signalId]/   # 공개 검증 페이지 — SYS-027
│   │
│   ├── provider-console/            # 공급자 콘솔 (Next.js) — 12.2
│   │   └── src/app/
│   │       ├── agents/              # 에이전트 CRUD, 룰 빌더(AGT-011), 드라이런
│   │       ├── signals/             # 수동 발행, 청산, 무효 요청
│   │       ├── analytics/           # 구독자·수익 분석 (Phase 3)
│   │       └── settlements/         # 정산 명세 — SUB-013
│   │
│   └── admin-console/               # 관리자 콘솔 (Next.js) — 14장, Phase 3
│       └── src/app/
│           ├── review-queue/        # 에이전트 심사 큐 — 14.2
│           ├── monitoring/          # 이상 탐지, 선행매매 플래그 — REG-012
│           ├── moderation/          # 콘텐츠 모더레이션 — 14.4
│           └── cs/                  # 환불·문의 처리 — 14.5
│
├── batch/                           # Python 배치 (성과·랭킹·데이터 수집) — SYS-006
│   ├── pyproject.toml
│   ├── src/
│   │   ├── ingestion/               # 시장 데이터 수집 — SYS-007~011
│   │   │   ├── kr/                  # KRX, DART, ECOS
│   │   │   ├── us/                  # Polygon, EDGAR
│   │   │   ├── quality/             # 결측·이상치·OHLC 정합성 검증 — SYS-009
│   │   │   └── calendar/            # 거래 캘린더 — SYS-011
│   │   ├── performance/             # 성과 검증 엔진 — 9장
│   │   │   ├── reference_price.py   # 기준가 확정 (익일 시가/VWAP) — 9.2
│   │   │   ├── settlement.py        # 자동 청산 판정 (목표가/손절/만기) — 9.3
│   │   │   ├── metrics.py           # 샤프·소르티노·MDD·승률(Wilson) — 9.4
│   │   │   └── snapshots.py         # agent_daily_snapshots 생성
│   │   ├── ranking/                 # SIGNALS Score, 리그·부문 랭킹 — 10장
│   │   ├── verification/            # 해시 체인 무결성 검증 배치 — 20.2
│   │   ├── anomaly/                 # 선행매매 탐지, 변동성-프로필 괴리(AGT-007) — REG-012
│   │   ├── rule_engine/             # 룰 기반 에이전트 조건 평가 → 발행 요청 — AGT-011
│   │   └── settlement_calc/         # 정산 산출 (홀드백·원천징수) — Phase 3, SUB-012
│   └── tests/
│       └── golden/                  # 수동 계산 대조 케이스 (오차 0.01%p) — 24.1 검수 기준
│
├── packages/                        # 공유 코드 (TypeScript)
│   ├── contracts/                   # API DTO, 에러 코드(SYS-024), 도메인 이벤트 스키마(SYS-004)
│   ├── database/                    # 스키마 정의·마이그레이션 (16장 26개 테이블)
│   │   └── migrations/
│   ├── domain/                      # 상태머신(6.3), 열거형(위험성향·태그·티어), 금칙어
│   └── ui/                          # 공용 컴포넌트 (면책문구, 수익률 표기 컴포넌트 — REG-005)
│
├── infra/
│   ├── docker/                      # 배포 단위별 Dockerfile
│   ├── terraform/                   # AWS/GCP
│   └── github-actions/              # CI/CD
│
├── docs/
│   ├── SIGNALS 요구사항지시서 v1_0.md
│   ├── adr/                         # 아키텍처 결정 기록
│   └── runbooks/                    # 장애·정산·심사 운영 절차
│
├── pnpm-workspace.yaml
└── package.json                     # pnpm -r 스크립트 (turbo는 앱 수 증가 시 도입)
```

---

## 4. Core API 모듈 내부 구조 (SYS-002/003 강제)

모든 모듈은 동일한 내부 레이아웃을 따른다.

```
modules/agent/
├── agent.module.ts          # NestJS 모듈 정의 (exports = 공개 인터페이스만)
├── api/                     # 컨트롤러 (HTTP 경계, /v1/agents, /v1/provider/agents)
├── application/             # 유스케이스 서비스 — 타 모듈이 호출 가능한 유일한 진입점
├── domain/                  # 엔티티, 상태머신(AGT-003), 도메인 규칙
├── infra/                   # 리포지토리 — 자기 소유 테이블만 접근 (SYS-003)
└── events/                  # 발행·구독 이벤트 핸들러 (SYS-004)
```

**의존 방향 (SYS-002 표 그대로, 순환 금지 — ESLint boundary 룰로 강제):**

```
identity ← provider ← agent ← (signal-service)
marketdata ← performance(batch) ← ranking
identity, agent ← subscription ← billing ← settlement
signal, subscription ← notification-service
audit ← 전 모듈 (append-only, 역방향 의존 없음)
```

**테이블 소유권 (16.1의 26개 테이블 → 모듈 매핑):**

| 모듈/서비스 | 소유 테이블 |
|---|---|
| identity | users, user_risk_profiles |
| provider | providers, provider_certifications, provider_payout_info |
| agent | agents, agent_rules |
| signal-service | signals, positions¹ |
| batch/performance | agent_daily_snapshots, agent_metrics |
| batch/ranking | agent_rankings |
| subscription | subscriptions, trial_history |
| billing | payments, refunds |
| settlement | settlements |
| batch/ingestion | instruments, daily_prices, intraday_vwap, trading_calendar, fx_rates, benchmark_values |
| notification-service | notification_deliveries |
| audit | audit_logs |
| moderation | anomaly_flags |

¹ positions는 signal-service가 생성(페어링), batch/performance가 기준가·청산 필드를 갱신 — 필드 단위 소유권을 마이그레이션 주석으로 명시할 것.

---

## 5. 규제 제약의 구조적 강제 포인트

코드 리뷰가 아닌 **구조로** 규제를 지키는 장치들:

1. **REG-001 (시그널 동일성)** — `signal-service`는 `subscription` 모듈을 import할 수 없다(패키지 의존성에 없음). 시그널 생성 함수 시그니처에 구독자 컨텍스트가 들어갈 경로 자체가 없다. `signals` 테이블에 subscriber FK 금지는 `packages/database` 마이그레이션 리뷰 체크리스트에 포함.
2. **REG-002 (개인화 경계)** — 투자성향(`user_risk_profiles`)을 읽는 코드는 `web/(discovery)`와 ranking 조회 API에만 허용. signal-service·notification-service에는 해당 리포지토리 접근이 없다.
3. **REG-003 (실행 분리)** — 증권사 API 클라이언트 패키지를 저장소에 두지 않는다. `contracts`에 주문 관련 DTO 자체가 없음.
4. **REG-005 (수익률 표기)** — 성과 응답 `disclaimer` 필드는 `contracts`의 응답 스키마에서 required (SYS-026). 프론트 수익률 표시는 `packages/ui`의 단일 컴포넌트만 사용(기간·표본수·면책 문구 강제 렌더).
5. **해시 체인 (SIG 8.2)** — 서명 키·해시 로직은 `signal-service/hashchain`에만 존재. 나중에 바꾸면 과거 데이터 재구성이 불가하므로(22.4) 이 모듈은 Phase 1 최우선 구현 + 스파이크 대상.

---

## 6. Phase별 구현 범위 매핑 (21.2)

| 디렉터리 | P1 (검증 엔진, D+0~70) | P2 (마켓플레이스, D+50~110) | P3 (운영, D+100~150) |
|---|:---:|:---:|:---:|
| core-api/identity | ✅ | | |
| core-api/agent | ✅ (수동 심사) | 룰 빌더 | |
| signal-service | ✅ 전체 | | |
| batch/ingestion, performance, ranking, verification | ✅ 전체 | | |
| core-api/audit | ✅ | | |
| core-api/subscription, billing | | ✅ | |
| notification-service | | ✅ | |
| core-api/provider, moderation | | ✅ (기본) | 고도화 |
| apps/web | | ✅ | |
| provider-console | | ✅ (기본) | 분석·레퍼럴 |
| core-api/settlement, batch/settlement_calc | | (수기) | ✅ |
| admin-console | | (내부 도구) | ✅ |
| 모바일 앱 (`apps/mobile`) | | | ✅ 신설 |

P1에서 프론트 3종은 만들지 않는다 — 자체 에이전트 3개 운영(AGT-001)은 내부 CLI/스크립트로 대체 (21.2 "내부 도구로 대체").

---

## 7. 착수 순서 (22.4 기술 리스크 순)

1. `batch/ingestion` — 시장데이터 수집 프로토타입 (1주 스파이크)
2. `batch/performance` + `tests/golden` — 수동 계산 대조로 정확성 확보
3. `signal-service/hashchain` — 해시 체인·서명 (변경 불가 영역이므로 조기 확정)
4. `packages/database` — 16장 스키마 마이그레이션
5. `core-api` identity → agent 순으로 모듈 채우기
6. PG 연동(billing)·알림은 후순위 (표준화되어 리스크 낮음)
