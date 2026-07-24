# ADR-0002: 시그널 해시체인 · 서명 규격

- 상태: **검토 요청** (2026-07-23)
- 관련 요구사항: SIG-005(해시체인), SIG-006(서버 서명), SIG-007(불변), SEC-017(키 보관), SEC-018(무결성 배치), SYS-027/028(공개 검증)
- 관련 리스크: **TR-4 — 해시 체인 설계 오류. 발행 시작 후 변경 시 과거 체인 재구성 불가**

## 왜 이 문서가 먼저인가

해시 입력 필드·직렬화 규칙·서명 방식은 **첫 시그널이 발행되는 순간 영구 고정**된다.
나중에 바꾸면 과거 시그널을 다시 검증할 수 없고, "조작 불가능한 기록"이라는 제품의 존재 이유가 무너진다.
그래서 구현 전에 아래 6개 결정을 확정한다.

---

## 결정 1 — 해시 입력 직렬화 (⚠️ SRS 공백 보완 + 템플릿 확장)

**SRS 규격** (SIG-005 / SYS-027 `hash_input_template`):

```
agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|rationale|published_at|prev_hash
```

**확장 (2026-07-24 승인, 발행 개시 전이므로 무비용)**: SRS 템플릿에는 성과 계산을 좌우하는
`suggested_weight`(비중, PERF-011) · `max_holding_days`(자동청산 시점, SIG-019) ·
`valid_until`(만료 판정, SIG-003)이 빠져 있다. 봉인 밖에 있으면 발행 후 이 값들만 바꿔
**체인은 VALID인 채로 측정 수익률을 조작**할 수 있다(T6 검증에서 실증). **확정 템플릿**:

```
agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|suggested_weight|max_holding_days|valid_until|rationale|published_at|prev_hash
```

- `suggested_weight`: 소수점 4자리 고정(NUMERIC(5,4)), NULL은 빈 문자열
- `max_holding_days`: 10진 정수, NULL은 빈 문자열
- `valid_until`: ISO 8601 UTC 밀리초(published_at과 동일 규칙), NULL은 빈 문자열
- 추가로 DB 불변 트리거도 이 3개 필드를 보호하도록 확장한다(마이그레이션 0005)

**문제**: SRS는 구분자 `|`만 정하고 **이스케이프 규칙이 없다.** `rationale`은 100자 이상 자유 텍스트라
`|`를 포함할 수 있다. 그러면 필드 경계가 모호해져 **서로 다른 시그널이 같은 해시 입력을 만들 수 있다**
(예: rationale에 `|`를 넣어 뒤 필드를 위조). 검증 인프라의 근간에 생기는 구멍이다.

**결정**: 템플릿은 SRS 그대로 두되, **각 필드 값을 이스케이프한 뒤 join** 한다.

```
escape(v) = v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')   // \ → \\ , | → \|
content_hash = SHA256(fields.map(escape).join('|'), 'utf8') → hex(64)
```

이스케이프 순서(백슬래시 먼저)를 지켜야 역변환이 유일해진다.

## 결정 2 — 필드 정규화 (결정적 직렬화)

같은 시그널이 언제·어디서 계산해도 **바이트 단위로 동일**해야 한다.

| 필드 | 규칙 | 예 |
|---|---|---|
| `agent_id` | UUID 소문자 | `0192f8a1-...` |
| `sequence_no` | 10진 정수, 패딩 없음 | `87` |
| `market`, `ticker`, `action` | 원문 대문자 그대로 | `KOSPI`, `005930`, `ENTRY` |
| `target_price`, `stop_loss_price` | **소수점 4자리 고정**(DB `NUMERIC(18,4)`와 일치). NULL은 빈 문자열 | `89000.0000` / `` |
| `rationale` | 원문 UTF-8, 트림·정규화 없음 | |
| `published_at` | **ISO 8601 UTC, 밀리초 3자리** | `2026-07-21T05:32:11.123Z` |
| `prev_hash` | 소문자 hex 64자 | |

**published_at 정밀도 주의**: DB `TIMESTAMPTZ`는 마이크로초까지 저장한다. 해시를 밀리초로 계산하면
DB 값과 달라져 **제3자가 DB만 보고 재현할 수 없다.** → **저장 시에도 밀리초로 절삭**하여
"DB에 있는 값 == 해시에 들어간 값"을 보장한다.

## 결정 3 — 서명 알고리즘: **ECDSA P-256 / SHA-256**

| 후보 | 장점 | 채택 못 하는 이유 |
|---|---|---|
| Ed25519 | 결정적 서명, 짧고 빠름, 테스트 쉬움 | **AWS KMS·GCP KMS가 서명용으로 미지원** — SEC-017의 "운영은 KMS" 요건과 충돌 |
| **ECDSA P-256 (채택)** | KMS 양쪽 지원(`ECC_NIST_P256`), 범용 검증 가능 | 서명이 비결정적(같은 입력→다른 서명) — 검증엔 무관 |
| RSA-2048 | 지원 광범위 | 서명 길이·연산 비용 큼 |

- 서명 대상: **정규 직렬화 문자열 그 자체**에 ECDSA-SHA256 서명.
  (ECDSA-SHA256이 내부적으로 SHA-256을 계산하므로 결과적으로 `content_hash`와 동일한 다이제스트에 서명된다.
  다이제스트에 직접 서명하면 검증자가 이중 해싱을 해야 해서 표준 라이브러리로 검증이 어려워진다 —
  구현 단계에서 표준 방식으로 확정, 2026-07-23)
- 인코딩: DER → **base64**로 `signals.signature`에 저장
- 개발: 로컬 키 파일(`.keys/`, gitignore) / 운영: KMS. **알고리즘·인코딩은 동일**해 포맷이 바뀌지 않는다.

## 결정 4 — 키 식별·회전 (⚠️ SRS 스키마 누락)

SYS-027의 검증 응답은 `public_key_id`를 포함해야 하는데, **`signals` 테이블에 키 식별 컬럼이 없다.**
키를 연 1회 회전(SEC-017)하면 과거 시그널이 어느 키로 서명됐는지 알 수 없어 검증 불가.

**결정**: 마이그레이션 `0004`로 `signals.signing_key_id VARCHAR(40) NOT NULL` 추가.
- 키 ID 형식: `signals-YYYY-NN` (예: `signals-2026-01`)
- 과거 공개키는 **영구 공개 유지** → `GET /v1/.well-known/signing-keys`가 전체 키 목록 반환(SYS-028)

## 결정 5 — sequence_no 채번

에이전트별 연속 정수, **구멍 없이** 증가해야 체인이 성립한다(SYS-013 6단계).

```
BEGIN
  SELECT id, genesis_hash FROM agents WHERE id = $1 FOR UPDATE;   -- 에이전트 행 잠금
  SELECT sequence_no, content_hash FROM signals
    WHERE agent_id = $1 ORDER BY sequence_no DESC LIMIT 1;        -- 직전 시그널
  seq      = last ? last.sequence_no + 1 : 1
  prevHash = last ? last.content_hash   : agent.genesis_hash      -- 첫 시그널은 제네시스
  ... 해시·서명 계산 후 INSERT ...
COMMIT
```

동시 발행은 에이전트 행 잠금으로 직렬화된다. `UNIQUE(agent_id, sequence_no)`가 최후 방어선.

## 결정 6 — 불변성과 VOID의 관계

- 내용 필드 수정은 DB 트리거가 차단(T1에서 검증 완료)
- **VOID는 내용을 바꾸지 않는다** — `status`/`voided_*`만 변경되므로 `content_hash`는 그대로 유효(SIG-007)
- 즉 무효화된 시그널도 체인에 남고 검증을 통과한다. 이것이 "삭제해도 흔적이 남는다"의 구현

---

## 결과 · 후속

- 마이그레이션 `0004_signing_key_id.sql` 필요
- `hash_input_template`을 검증 API가 그대로 노출(SYS-027) → 제3자가 동일 규칙으로 재현 가능해야 하므로
  **이스케이프 규칙도 함께 문서화·공개**한다
- 일일 전체 체인 재검증 배치(SEC-018)는 T14에서 이 규격을 그대로 사용
- 이 ADR 변경은 **발행 개시 전에만** 가능. 이후 변경은 신규 키·신규 체인 버전 도입으로만 처리
