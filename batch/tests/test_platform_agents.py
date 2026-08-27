"""자체 에이전트 운영 도구 순수 로직 테스트 (T15). DB·HTTP 비의존.

ADMIN JWT 발급이 core-api HS256 포맷과 호환되는지(signal-service가 검증 가능한지) 확인.
"""

import base64
import hashlib
import hmac
import json

from signals_batch.ops.platform_agents import AGENTS, JWT_SECRET, _mint_admin_token


def _decode(token: str):
    header_b64, payload_b64, sig_b64 = token.split(".")
    expected = hmac.new(JWT_SECRET.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    actual = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)))
    return payload, hmac.compare_digest(expected, actual)


class TestAdminToken:
    def test_structure_and_signature(self):
        token = _mint_admin_token()
        assert token.count(".") == 2  # header.payload.sig
        payload, sig_ok = _decode(token)
        assert sig_ok  # signal-service가 공유 시크릿으로 검증 가능
        assert payload["role"] == "ADMIN"  # 자체 에이전트 발행 경로
        assert payload["sub"]  # userId 존재

    def test_expiry_in_future(self):
        import time
        payload, _ = _decode(_mint_admin_token(ttl_sec=600))
        assert payload["exp"] > time.time()


class TestAgentSpec:
    def test_three_agents_cover_spectrum(self):
        # AGT-001: 3개가 안정/중립/공격 + 국내/혼합/미국을 커버
        assert len(AGENTS) == 3
        risks = {a["risk"] for a in AGENTS}
        scopes = {a["scope"] for a in AGENTS}
        assert "MODERATE_CONS" in risks and "NEUTRAL" in risks and "AGGRESSIVE" in risks
        assert scopes == {"KR", "MIXED", "US"}

    def test_signals_have_valid_price_order(self):
        # 모든 ENTRY 시그널: 목표가 > 참고가 > 손절가 (SIG-002)
        for a in AGENTS:
            for s in a["signals"]:
                assert s["target"] > s["ref"] > s["stop"]
                assert len(s["rationale"]) >= 100  # AGT-017 근거 최소 100자
