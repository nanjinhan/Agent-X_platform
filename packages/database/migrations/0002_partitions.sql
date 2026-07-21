-- 0002_partitions.sql — 초기 파티션 생성 (SYS-019, SYS-020)
-- 운영에서는 pg_partman 또는 batch/의 파티션 관리 잡이 3개월 앞까지 선생성한다.
-- 여기서는 개발 환경 부트스트랩용 최소 파티션만 만든다.

-- daily_prices: 연 단위, 영구 보관
CREATE TABLE daily_prices_2025 PARTITION OF daily_prices
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE daily_prices_2026 PARTITION OF daily_prices
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- agent_daily_snapshots: 연 단위, 영구 보관
CREATE TABLE agent_daily_snapshots_2026 PARTITION OF agent_daily_snapshots
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- notification_deliveries: 월 단위, 6개월 보관
CREATE TABLE notification_deliveries_2026_07 PARTITION OF notification_deliveries
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE notification_deliveries_2026_08 PARTITION OF notification_deliveries
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE notification_deliveries_2026_09 PARTITION OF notification_deliveries
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- audit_logs: 월 단위, 5년 보관
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
