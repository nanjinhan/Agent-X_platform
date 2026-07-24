-- 0004_signing_keys.sql
-- SRS 정오 + 보완 (ADR-0002)
--  1) signals에 서명 키 식별자 누락 → SYS-027 검증 응답의 public_key_id를 낼 수 없고,
--     SEC-017의 연 1회 키 회전 후 과거 시그널 검증이 불가능해진다.
--  2) 공개키 레지스트리 부재 → SYS-028(/.well-known/signing-keys)이 낼 데이터가 없다.
--     공개키는 비밀이 아니며, 과거 시그널 검증을 위해 폐기 후에도 영구 보존한다.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS signing_key_id VARCHAR(40);
UPDATE signals SET signing_key_id = 'legacy-unknown' WHERE signing_key_id IS NULL;
ALTER TABLE signals ALTER COLUMN signing_key_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS signing_keys (
    key_id          VARCHAR(40) PRIMARY KEY,      -- 예: signals-2026-01
    algorithm       VARCHAR(30) NOT NULL,         -- ECDSA_P256_SHA256
    public_key_pem  TEXT NOT NULL,                -- SPKI PEM (공개 — 비밀 아님)
    hash_input_template TEXT NOT NULL,            -- 제3자 재현용 (SYS-027)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at      TIMESTAMPTZ                   -- 회전 후에도 검증용으로 행은 영구 유지
);

COMMENT ON TABLE signing_keys IS '서명 공개키 레지스트리. 회전 후에도 과거 시그널 검증을 위해 삭제 금지 (SEC-017).';
