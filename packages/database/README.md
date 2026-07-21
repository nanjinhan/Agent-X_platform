# @signals/database

SRS 16장 [SYS-018] 스키마의 단일 소유처. 마이그레이션은 번호순 SQL 파일로 관리한다.

## 마이그레이션 리뷰 체크리스트 (필수)

- [ ] `signals` 테이블에 구독자 참조(FK/컬럼)를 추가하지 않는다 — **REG-001 시그널 동일성 원칙**
- [ ] `signals`의 내용 필드(ticker, action, target_price, rationale, published_at 등)를 변경하는 UPDATE 경로를 만들지 않는다 — `trg_signal_immutable` 트리거 유지
- [ ] 테이블 소유 모듈 외의 모듈이 접근해야 한다면 스키마가 아니라 서비스 레이어로 해결한다 (SYS-003)
- [ ] 파티션 테이블 신규 생성 시 3개월 선행 파티션 포함 (SYS-020)
- [ ] 개인정보 컬럼은 암호화(`*_enc BYTEA`) 또는 해시(`*_hash`)로만 저장 (REG-018)

## 테이블 소유권

PROJECT-STRUCTURE.md §4 표 참조. `positions`는 signal-service가 행을 생성하고
batch/performance가 기준가·청산·수익률 필드를 갱신한다.

## 적용

```bash
psql $DATABASE_URL -f migrations/0001_init.sql
psql $DATABASE_URL -f migrations/0002_partitions.sql
```

(마이그레이션 러너 도입 전 임시. P1에서 node-pg-migrate 또는 dbmate 도입 예정 — `scripts/migrate.mjs` 자리)
