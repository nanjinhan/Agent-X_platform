-- 0003_user_password.sql
-- SRS 정오: 16.1 users 테이블에 password_hash 컬럼 누락.
-- SEC-001(이메일+비밀번호 로그인)·SEC-002(Argon2id 해싱)가 이를 요구하므로 보강한다.
-- 소셜 전용 계정은 NULL 허용.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
