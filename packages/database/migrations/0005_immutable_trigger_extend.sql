-- 0005_immutable_trigger_extend.sql (ADR-0002 결정 1 확장)
-- 해시 봉인에 suggested_weight·max_holding_days·valid_until을 추가함에 따라,
-- 1차 방어선인 불변 트리거도 같은 필드를 보호하도록 확장한다.
-- (SRS 16.1 원문 트리거는 content_hash·ticker·action·가격·rationale·published_at만 보호)

CREATE OR REPLACE FUNCTION prevent_signal_content_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash
       OR OLD.market IS DISTINCT FROM NEW.market
       OR OLD.ticker IS DISTINCT FROM NEW.ticker
       OR OLD.action IS DISTINCT FROM NEW.action
       OR OLD.target_price IS DISTINCT FROM NEW.target_price
       OR OLD.stop_loss_price IS DISTINCT FROM NEW.stop_loss_price
       OR OLD.suggested_weight IS DISTINCT FROM NEW.suggested_weight
       OR OLD.max_holding_days IS DISTINCT FROM NEW.max_holding_days
       OR OLD.valid_until IS DISTINCT FROM NEW.valid_until
       OR OLD.rationale IS DISTINCT FROM NEW.rationale
       OR OLD.published_at IS DISTINCT FROM NEW.published_at
       OR OLD.prev_hash IS DISTINCT FROM NEW.prev_hash
       OR OLD.signature IS DISTINCT FROM NEW.signature
       OR OLD.signing_key_id IS DISTINCT FROM NEW.signing_key_id
       OR OLD.sequence_no IS DISTINCT FROM NEW.sequence_no
       OR OLD.agent_id IS DISTINCT FROM NEW.agent_id THEN
        RAISE EXCEPTION 'Signal content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
