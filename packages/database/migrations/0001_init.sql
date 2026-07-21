-- 0001_init.sql — SRS 16.1 [SYS-018] 스키마 원문 추출 (요구사항지시서 v1.0)
-- 주의: daily_prices, agent_daily_snapshots, notification_deliveries, audit_logs는
-- PARTITION BY RANGE 선언만 있음. 초기 파티션 생성은 0002에서 수행 (SYS-019/020).

-- ============================================
-- 사용자 / 인증
-- ============================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone_hash          VARCHAR(64),              -- 해시 저장
    ci_hash             VARCHAR(88) UNIQUE,       -- 본인인증 CI (중복가입 방지)
    name_encrypted      BYTEA,                    -- 암호화 저장
    birth_date          DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                        -- ACTIVE, DORMANT, SUSPENDED, WITHDRAWN
    role                VARCHAR(20) NOT NULL DEFAULT 'SUBSCRIBER',
                        -- SUBSCRIBER, PROVIDER, ADMIN
    verified_at         TIMESTAMPTZ,              -- 본인인증 완료
    marketing_consent   BOOLEAN DEFAULT FALSE,
    risk_disclosure_at  TIMESTAMPTZ NOT NULL,     -- 위험고지 동의
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at        TIMESTAMPTZ
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role) WHERE role != 'SUBSCRIBER';

CREATE TABLE user_risk_profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    profile             VARCHAR(20) NOT NULL,
                        -- CONSERVATIVE ~ VERY_AGGRESSIVE
    survey_answers      JSONB NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 공급자
-- ============================================

CREATE TABLE providers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id),
    display_name        VARCHAR(50) UNIQUE NOT NULL,   -- 필명 또는 실명
    is_anonymous        BOOLEAN NOT NULL DEFAULT FALSE,
    bio                 TEXT NOT NULL,
    avatar_url          VARCHAR(500),
    expertise_tags      VARCHAR(30)[],
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                        -- PENDING, ACTIVE, SUSPENDED, TERMINATED
    tier                VARCHAR(20) NOT NULL DEFAULT 'BRONZE',
    commission_rate     NUMERIC(5,4) NOT NULL,         -- 0.1000 = 10%
    is_early_bird       BOOLEAN NOT NULL DEFAULT FALSE,
    is_platform_owned   BOOLEAN NOT NULL DEFAULT FALSE,
    max_agents          SMALLINT NOT NULL DEFAULT 3,
    referral_code       VARCHAR(20) UNIQUE,
    approved_at         TIMESTAMPTZ,
    suspended_at        TIMESTAMPTZ,
    suspension_reason   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_providers_status ON providers(status);

CREATE TABLE provider_certifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES providers(id),
    cert_type           VARCHAR(30) NOT NULL,
                        -- CAREER, LICENSE, DEGREE, AWARD
    cert_detail         VARCHAR(200) NOT NULL,
    verified_by         UUID REFERENCES users(id),
    verified_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE provider_payout_info (
    provider_id         UUID PRIMARY KEY REFERENCES providers(id),
    is_business         BOOLEAN NOT NULL,
    business_no_enc     BYTEA,
    bank_code           VARCHAR(10) NOT NULL,
    account_no_enc      BYTEA NOT NULL,
    account_holder_enc  BYTEA NOT NULL,
    tax_type            VARCHAR(20) NOT NULL,     -- WITHHOLDING, INVOICE
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 에이전트
-- ============================================

CREATE TABLE agents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES providers(id),
    name                VARCHAR(30) UNIQUE NOT NULL,
    tagline             VARCHAR(60) NOT NULL,
    description         TEXT NOT NULL,
    thumbnail_url       VARCHAR(500),

    agent_type          VARCHAR(20) NOT NULL,     -- MANUAL, RULE_BASED
    risk_profile        VARCHAR(20) NOT NULL,
    asset_scope         VARCHAR(10) NOT NULL,     -- KR, US, MIXED
    strategy_tags       VARCHAR(30)[] NOT NULL,
    expected_frequency  VARCHAR(20) NOT NULL,
    avg_holding_period  VARCHAR(20) NOT NULL,
    max_positions       SMALLINT NOT NULL DEFAULT 5,

    price_tier          VARCHAR(5) NOT NULL,      -- T0~T5
    price_krw           INTEGER NOT NULL,

    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    genesis_hash        VARCHAR(64) NOT NULL,     -- 해시체인 시작점
    current_rule_ver    INTEGER DEFAULT 1,

    -- 검증
    verification_start  TIMESTAMPTZ,
    verification_end    TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    archive_reason      VARCHAR(50),

    -- 캐시된 집계 (배치로 갱신)
    subscriber_count    INTEGER NOT NULL DEFAULT 0,
    signal_count        INTEGER NOT NULL DEFAULT 0,
    closed_position_cnt INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_provider ON agents(provider_id);
CREATE INDEX idx_agents_scope_risk ON agents(asset_scope, risk_profile) 
    WHERE status = 'ACTIVE';

CREATE TABLE agent_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    version             INTEGER NOT NULL,
    rule_json           JSONB NOT NULL,
    change_summary      TEXT,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, version)
);

-- ============================================
-- 시그널 (핵심)
-- ============================================

CREATE TABLE signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    sequence_no         INTEGER NOT NULL,
    rule_version        INTEGER,

    market              VARCHAR(10) NOT NULL,
    ticker              VARCHAR(20) NOT NULL,
    instrument_name     VARCHAR(100) NOT NULL,

    action              VARCHAR(10) NOT NULL,     -- ENTRY, EXIT
    side                VARCHAR(10) NOT NULL DEFAULT 'LONG',

    -- ENTRY 전용
    reference_price     NUMERIC(18,4),            -- 발행 시점 참고가
    target_price        NUMERIC(18,4),
    stop_loss_price     NUMERIC(18,4),
    suggested_weight    NUMERIC(5,4),
    valid_until         TIMESTAMPTZ,
    max_holding_days    SMALLINT,

    -- EXIT 전용
    entry_signal_id     UUID REFERENCES signals(id),
    exit_reason         VARCHAR(30),

    rationale           TEXT NOT NULL,
    attachments         JSONB,

    published_at        TIMESTAMPTZ NOT NULL,
    market_session      VARCHAR(10) NOT NULL,

    -- 무결성
    content_hash        VARCHAR(64) NOT NULL,
    prev_hash           VARCHAR(64) NOT NULL,
    signature           TEXT NOT NULL,

    status              VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    voided_at           TIMESTAMPTZ,
    voided_reason       VARCHAR(200),
    voided_by           UUID REFERENCES users(id),
    void_excluded       BOOLEAN NOT NULL DEFAULT FALSE,  -- 성과 제외 여부

    is_paper            BOOLEAN NOT NULL DEFAULT FALSE,  -- 검증기간 여부
    idempotency_key     VARCHAR(100),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (agent_id, sequence_no),
    UNIQUE (agent_id, idempotency_key)
);
CREATE INDEX idx_signals_agent_pub ON signals(agent_id, published_at DESC);
CREATE INDEX idx_signals_ticker ON signals(market, ticker, published_at DESC);
CREATE INDEX idx_signals_entry_ref ON signals(entry_signal_id) 
    WHERE entry_signal_id IS NOT NULL;
CREATE INDEX idx_signals_open ON signals(agent_id) 
    WHERE action = 'ENTRY' AND status IN ('PUBLISHED','FILLED');

-- 시그널은 수정 불가. UPDATE는 status/voided 필드만 허용
CREATE OR REPLACE FUNCTION prevent_signal_content_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash
       OR OLD.ticker IS DISTINCT FROM NEW.ticker
       OR OLD.action IS DISTINCT FROM NEW.action
       OR OLD.target_price IS DISTINCT FROM NEW.target_price
       OR OLD.stop_loss_price IS DISTINCT FROM NEW.stop_loss_price
       OR OLD.rationale IS DISTINCT FROM NEW.rationale
       OR OLD.published_at IS DISTINCT FROM NEW.published_at THEN
        RAISE EXCEPTION 'Signal content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_signal_immutable
    BEFORE UPDATE ON signals
    FOR EACH ROW EXECUTE FUNCTION prevent_signal_content_update();

-- ============================================
-- 포지션 (진입-청산 페어)
-- ============================================

CREATE TABLE positions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    entry_signal_id     UUID UNIQUE NOT NULL REFERENCES signals(id),
    exit_signal_id      UUID UNIQUE REFERENCES signals(id),

    market              VARCHAR(10) NOT NULL,
    ticker              VARCHAR(20) NOT NULL,

    -- 진입
    entry_date          DATE NOT NULL,
    entry_price         NUMERIC(18,4),            -- 기준가 (익일시가 or 5분VWAP)
    entry_price_type    VARCHAR(20),              -- NEXT_OPEN, INTRADAY_VWAP
    entry_confirmed_at  TIMESTAMPTZ,

    -- 청산
    exit_date           DATE,
    exit_price          NUMERIC(18,4),
    exit_reason         VARCHAR(30),
    exit_confirmed_at   TIMESTAMPTZ,

    -- 비용
    entry_cost_rate     NUMERIC(8,6),
    exit_cost_rate      NUMERIC(8,6),
    slippage_rate       NUMERIC(8,6),

    -- 수익률
    gross_return        NUMERIC(10,6),
    net_return          NUMERIC(10,6),
    net_return_krw      NUMERIC(10,6),            -- 미국주식용 원화환산

    -- 환율 (미국주식)
    entry_fx_rate       NUMERIC(10,4),
    exit_fx_rate        NUMERIC(10,4),

    holding_days        SMALLINT,
    weight              NUMERIC(5,4),

    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                        -- PENDING, OPEN, CLOSED, EXPIRED, VOIDED, SKIPPED
    is_paper            BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_positions_agent_status ON positions(agent_id, status);
CREATE INDEX idx_positions_agent_exit ON positions(agent_id, exit_date DESC) 
    WHERE status = 'CLOSED';

-- ============================================
-- 성과
-- ============================================

CREATE TABLE agent_daily_snapshots (
    agent_id            UUID NOT NULL REFERENCES agents(id),
    snapshot_date       DATE NOT NULL,
    portfolio_value     NUMERIC(18,6) NOT NULL,   -- 초기 100 기준
    cash                NUMERIC(18,6) NOT NULL,
    open_positions      SMALLINT NOT NULL,
    daily_return        NUMERIC(10,6),
    cumulative_return   NUMERIC(10,6),
    drawdown            NUMERIC(10,6),
    benchmark_value     NUMERIC(18,6),
    PRIMARY KEY (agent_id, snapshot_date)
) PARTITION BY RANGE (snapshot_date);

CREATE TABLE agent_metrics (
    agent_id            UUID PRIMARY KEY REFERENCES agents(id),
    computed_at         TIMESTAMPTZ NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,

    -- 수익성
    cumulative_return   NUMERIC(10,6),
    cagr                NUMERIC(10,6),
    avg_signal_return   NUMERIC(10,6),
    median_signal_ret   NUMERIC(10,6),
    best_return         NUMERIC(10,6),
    worst_return        NUMERIC(10,6),

    -- 위험
    volatility          NUMERIC(10,6),
    downside_vol        NUMERIC(10,6),
    max_drawdown        NUMERIC(10,6),
    mdd_duration_days   SMALLINT,
    recovery_days       SMALLINT,
    var_95              NUMERIC(10,6),

    -- 위험조정
    sharpe              NUMERIC(10,4),
    sortino             NUMERIC(10,4),
    calmar              NUMERIC(10,4),
    information_ratio   NUMERIC(10,4),
    alpha               NUMERIC(10,6),
    beta                NUMERIC(10,4),

    -- 실행
    win_rate            NUMERIC(6,4),
    win_rate_wilson_lb  NUMERIC(6,4),
    profit_factor       NUMERIC(10,4),
    avg_win             NUMERIC(10,6),
    avg_loss            NUMERIC(10,6),
    expectancy          NUMERIC(10,6),
    avg_holding_days    NUMERIC(6,2),
    max_consec_loss     SMALLINT,

    -- 규율
    take_profit_rate    NUMERIC(6,4),
    stop_loss_adherence NUMERIC(6,4),
    unclosed_rate       NUMERIC(6,4),
    void_rate           NUMERIC(6,4),
    freq_deviation      NUMERIC(6,4),
    skip_rate           NUMERIC(6,4),

    -- 표본
    total_signals       INTEGER,
    closed_positions    INTEGER,
    open_positions      INTEGER,
    operating_days      INTEGER,

    -- 구독자
    retention_3m        NUMERIC(6,4),
    retention_6m        NUMERIC(6,4)
);

CREATE TABLE agent_rankings (
    id                  BIGSERIAL PRIMARY KEY,
    agent_id            UUID NOT NULL REFERENCES agents(id),
    ranking_date        DATE NOT NULL,
    league              VARCHAR(10) NOT NULL,     -- KR, US, MIXED
    division            VARCHAR(10) NOT NULL,     -- STABLE, NEUTRAL, AGGRESSIVE
    signals_score       NUMERIC(8,4) NOT NULL,
    rank_in_division    INTEGER NOT NULL,
    rank_in_league      INTEGER NOT NULL,
    rank_overall        INTEGER,
    score_components    JSONB NOT NULL,           -- 각 구성요소 점수
    is_eligible         BOOLEAN NOT NULL,
    ineligible_reason   VARCHAR(100),
    UNIQUE (agent_id, ranking_date)
);
CREATE INDEX idx_rankings_date_league ON agent_rankings(ranking_date, league, division, rank_in_division);

-- ============================================
-- 구독 / 결제
-- ============================================

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    agent_id            UUID NOT NULL REFERENCES agents(id),

    status              VARCHAR(20) NOT NULL,
    price_krw           INTEGER NOT NULL,         -- 구독 시점 가격 (락인)

    trial_start         TIMESTAMPTZ,
    trial_end           TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end  TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,

    paused_from         TIMESTAMPTZ,
    paused_until        TIMESTAMPTZ,

    billing_key         VARCHAR(200),
    next_billing_at     TIMESTAMPTZ,
    failed_attempts     SMALLINT DEFAULT 0,

    referred_by         UUID REFERENCES providers(id),
    signals_received    INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_sub_active ON subscriptions(user_id, agent_id)
    WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLING');
CREATE INDEX idx_sub_agent_active ON subscriptions(agent_id)
    WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLING');
CREATE INDEX idx_sub_billing ON subscriptions(next_billing_at)
    WHERE status = 'ACTIVE';

CREATE TABLE trial_history (
    user_id             UUID NOT NULL REFERENCES users(id),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    used_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, agent_id)
);

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    amount_krw          INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL,     -- PENDING, PAID, FAILED, REFUNDED, PARTIAL_REFUND
    pg_provider         VARCHAR(30) NOT NULL,
    pg_tid              VARCHAR(100),
    pg_response         JSONB,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    attempt_no          SMALLINT NOT NULL DEFAULT 1,
    paid_at             TIMESTAMPTZ,
    failed_reason       VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_sub ON payments(subscription_id, created_at DESC);

CREATE TABLE refunds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          UUID NOT NULL REFERENCES payments(id),
    amount_krw          INTEGER NOT NULL,
    reason_code         VARCHAR(30) NOT NULL,
    reason_detail       TEXT,
    signals_deducted    INTEGER,
    approved_by         UUID REFERENCES users(id),
    status              VARCHAR(20) NOT NULL,
    pg_refund_tid       VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

-- ============================================
-- 정산
-- ============================================

CREATE TABLE settlements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES providers(id),
    period_year         SMALLINT NOT NULL,
    period_month        SMALLINT NOT NULL,

    gross_revenue       INTEGER NOT NULL,
    refund_amount       INTEGER NOT NULL DEFAULT 0,
    commission_amount   INTEGER NOT NULL,
    commission_rate     NUMERIC(5,4) NOT NULL,
    referral_bonus      INTEGER NOT NULL DEFAULT 0,
    holdback_amount     INTEGER NOT NULL DEFAULT 0,
    holdback_released   INTEGER NOT NULL DEFAULT 0,
    withholding_tax     INTEGER NOT NULL DEFAULT 0,
    net_payout          INTEGER NOT NULL,

    status              VARCHAR(20) NOT NULL,     -- DRAFT, CONFIRMED, PAID, HELD
    paid_at             TIMESTAMPTZ,
    detail_json         JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, period_year, period_month)
);

-- ============================================
-- 시장 데이터
-- ============================================

CREATE TABLE instruments (
    market              VARCHAR(10) NOT NULL,
    ticker              VARCHAR(20) NOT NULL,
    name_kr             VARCHAR(100),
    name_en             VARCHAR(100),
    sector              VARCHAR(50),
    industry            VARCHAR(100),
    market_cap          BIGINT,
    avg_value_20d       BIGINT,                   -- 20일 평균거래대금
    listed_at           DATE,
    delisted_at         DATE,
    is_tradable         BOOLEAN NOT NULL DEFAULT TRUE,
    is_suspended        BOOLEAN NOT NULL DEFAULT FALSE,
    is_managed          BOOLEAN NOT NULL DEFAULT FALSE,  -- 관리종목
    is_etf              BOOLEAN NOT NULL DEFAULT FALSE,
    is_leveraged        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (market, ticker)
);
CREATE INDEX idx_instruments_tradable ON instruments(market, is_tradable, market_cap);

CREATE TABLE daily_prices (
    market              VARCHAR(10) NOT NULL,
    ticker              VARCHAR(20) NOT NULL,
    trade_date          DATE NOT NULL,
    open                NUMERIC(18,4) NOT NULL,
    high                NUMERIC(18,4) NOT NULL,
    low                 NUMERIC(18,4) NOT NULL,
    close               NUMERIC(18,4) NOT NULL,
    volume              BIGINT NOT NULL,
    value               BIGINT,
    adj_factor          NUMERIC(18,10) NOT NULL DEFAULT 1,
    source              VARCHAR(30) NOT NULL,
    PRIMARY KEY (market, ticker, trade_date)
) PARTITION BY RANGE (trade_date);

CREATE TABLE intraday_vwap (
    market              VARCHAR(10) NOT NULL,
    ticker              VARCHAR(20) NOT NULL,
    window_start        TIMESTAMPTZ NOT NULL,
    window_end          TIMESTAMPTZ NOT NULL,
    vwap                NUMERIC(18,4) NOT NULL,
    volume              BIGINT NOT NULL,
    PRIMARY KEY (market, ticker, window_start)
);

CREATE TABLE trading_calendar (
    market              VARCHAR(10) NOT NULL,
    trade_date          DATE NOT NULL,
    is_open             BOOLEAN NOT NULL,
    open_time           TIME,
    close_time          TIME,
    is_early_close      BOOLEAN NOT NULL DEFAULT FALSE,
    note                VARCHAR(100),
    PRIMARY KEY (market, trade_date)
);

CREATE TABLE fx_rates (
    currency_pair       VARCHAR(10) NOT NULL,     -- USDKRW
    rate_date           DATE NOT NULL,
    rate                NUMERIC(12,4) NOT NULL,
    source              VARCHAR(30) NOT NULL,
    PRIMARY KEY (currency_pair, rate_date)
);

CREATE TABLE benchmark_values (
    benchmark_code      VARCHAR(20) NOT NULL,     -- KOSPI200_TR, SPX_TR
    value_date          DATE NOT NULL,
    value               NUMERIC(18,6) NOT NULL,
    PRIMARY KEY (benchmark_code, value_date)
);

-- ============================================
-- 알림
-- ============================================

CREATE TABLE notification_deliveries (
    -- SRS 원문은 id 단독 PK이나, PostgreSQL 파티션 테이블의 PK는
    -- 파티션 키를 포함해야 하므로 복합 PK로 정정 (SRS 16.1 정오 사항)
    id                  BIGSERIAL,
    signal_id           UUID REFERENCES signals(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    channel             VARCHAR(20) NOT NULL,     -- PUSH, EMAIL, INAPP
    status              VARCHAR(20) NOT NULL,     -- QUEUED, SENT, FAILED, READ
    attempt_no          SMALLINT NOT NULL DEFAULT 1,
    queued_at           TIMESTAMPTZ NOT NULL,
    sent_at             TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    error_detail        VARCHAR(300),
    PRIMARY KEY (id, queued_at)
) PARTITION BY RANGE (queued_at);
CREATE INDEX idx_notif_signal ON notification_deliveries(signal_id);
CREATE INDEX idx_notif_user ON notification_deliveries(user_id, queued_at DESC);

-- ============================================
-- 감사
-- ============================================

CREATE TABLE audit_logs (
    -- 위와 동일한 사유로 복합 PK로 정정 (SRS 16.1 정오 사항)
    id                  BIGSERIAL,
    actor_id            UUID,
    actor_role          VARCHAR(20),
    action              VARCHAR(50) NOT NULL,
    entity_type         VARCHAR(30) NOT NULL,
    entity_id           VARCHAR(100),
    before_state        JSONB,
    after_state         JSONB,
    ip_address          INET,
    user_agent          VARCHAR(300),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, occurred_at DESC);

CREATE TABLE anomaly_flags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_type           VARCHAR(40) NOT NULL,
    severity            VARCHAR(10) NOT NULL,     -- LOW, MEDIUM, HIGH, CRITICAL
    agent_id            UUID REFERENCES agents(id),
    provider_id         UUID REFERENCES providers(id),
    signal_id           UUID REFERENCES signals(id),
    detail              JSONB NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    resolved_by         UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_anomaly_open ON anomaly_flags(status, severity, detected_at DESC)
    WHERE status = 'OPEN';
