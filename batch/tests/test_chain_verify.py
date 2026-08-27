"""해시체인 무결성 검증 골든 테스트 (SEC-018). DB 비의존.

정규직렬화가 ADR-0002 규격과 정확히 일치하는지(바이트) + 실제 P-256 서명 체인의
검증·위조탐지(변조/체인단절/서명불일치)를 확인한다.
"""

import base64
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from signals_batch.verification.chain_verify import (
    SignalRecord,
    canonicalize,
    escape_field,
    format_price,
    format_timestamp,
    sha256hex,
    verify_chain,
    verify_signature,
)

AID = "0192f8a1-0000-0000-0000-000000000001"
PUB_AT = datetime(2026, 7, 21, 5, 32, 11, 123000, tzinfo=UTC)


def _base_record(**over) -> SignalRecord:
    d = {
        "agent_id": AID, "sequence_no": 1, "market": "KOSPI", "ticker": "005930", "action": "ENTRY",
        "target_price": Decimal("89000.0000"), "stop_loss_price": Decimal("73000.0000"),
        "suggested_weight": Decimal("0.5000"), "max_holding_days": 5, "valid_until": None,
        "rationale": "테스트 근거", "published_at": PUB_AT, "prev_hash": "g" * 64,
        "content_hash": "", "signature": "", "signing_key_id": "signals-dev-01",
    }
    d.update(over)
    return SignalRecord(**d)


class TestCanonical:
    def test_exact_serialization(self):
        # ADR-0002 규격 그대로: 필드 순서·빈 valid_until·타임스탬프 ms·가격 4자리
        r = _base_record()
        expected = (
            f"{AID}|1|KOSPI|005930|ENTRY|89000.0000|73000.0000|0.5000|5|"
            "|테스트 근거|2026-07-21T05:32:11.123Z|" + "g" * 64
        )
        assert canonicalize(r) == expected

    def test_format_price_4dp(self):
        assert format_price(Decimal(89000)) == "89000.0000"
        assert format_price(0.5) == "0.5000"
        assert format_price(None) == ""

    def test_timestamp_millis(self):
        assert format_timestamp(PUB_AT) == "2026-07-21T05:32:11.123Z"
        # 마이크로초 0 → .000Z
        assert format_timestamp(datetime(2026, 7, 19, 8, 0, 0, tzinfo=UTC)) == "2026-07-19T08:00:00.000Z"

    def test_escape(self):
        # rationale에 | 와 \ 포함 → 이스케이프되어 필드 경계 위조 불가
        assert escape_field("a|b") == "a\\|b"
        assert escape_field("a\\b") == "a\\\\b"
        r = _base_record(rationale="목표|손절")
        assert "목표\\|손절" in canonicalize(r)


# ── 서명 체인 검증 (실제 P-256 키로) ──────────────────────────────────────
_PRIV = ec.generate_private_key(ec.SECP256R1())
_PUB_PEM = _PRIV.public_key().public_bytes(
    serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
).decode()
_PUBKEYS = {"signals-dev-01": _PUB_PEM}


def _sign(record: SignalRecord) -> SignalRecord:
    """canonical을 계산해 정상 content_hash·signature를 채운다."""
    canonical = canonicalize(record)
    ch = sha256hex(canonical)
    sig = base64.b64encode(_PRIV.sign(canonical.encode("utf-8"), ec.ECDSA(hashes.SHA256()))).decode()
    return replace(record, content_hash=ch, signature=sig)


class TestVerifySignature:
    def test_valid_signature_roundtrip(self):
        r = _sign(_base_record())
        assert verify_signature(canonicalize(r), r.signature, _PUB_PEM)

    def test_tampered_message_fails(self):
        r = _sign(_base_record())
        assert not verify_signature(canonicalize(r) + "x", r.signature, _PUB_PEM)

    def test_garbage_signature_false(self):
        assert not verify_signature("msg", "not-base64-!!!", _PUB_PEM)


class TestVerifyChain:
    def _valid_chain(self):
        genesis = "g" * 64
        s1 = _sign(_base_record(sequence_no=1, prev_hash=genesis))
        s2 = _sign(_base_record(sequence_no=2, prev_hash=s1.content_hash, target_price=Decimal("91000.0000")))
        return genesis, [s1, s2]

    def test_valid_chain_no_breaks(self):
        genesis, chain = self._valid_chain()
        assert verify_chain(chain, genesis, _PUBKEYS) == []

    def test_content_tampered_detected(self):
        # 내용 위조: content_hash는 그대로인데 target_price만 바꿈 → 재계산 불일치
        genesis, chain = self._valid_chain()
        chain[0] = replace(chain[0], target_price=Decimal("99999.0000"))
        breaks = verify_chain(chain, genesis, _PUBKEYS)
        reasons = {(b.sequence_no, b.reason) for b in breaks}
        assert (1, "CONTENT_TAMPERED") in reasons
        assert (1, "SIGNATURE_INVALID") in reasons  # 서명도 안 맞음

    def test_prev_hash_mismatch_detected(self):
        genesis, chain = self._valid_chain()
        chain[1] = replace(chain[1], prev_hash="f" * 64)  # 체인 단절
        breaks = verify_chain(chain, genesis, _PUBKEYS)
        # prev_hash를 바꾸면 canonical도 달라져 content/서명도 깨짐. 최소한 체인 단절은 잡아야
        assert any(b.sequence_no == 2 and b.reason == "PREV_HASH_MISMATCH" for b in breaks)

    def test_no_public_key(self):
        genesis, chain = self._valid_chain()
        breaks = verify_chain(chain, genesis, {})  # 키 없음
        assert all(b.reason == "NO_PUBLIC_KEY" for b in breaks if b.reason.startswith("NO"))
        assert any(b.reason == "NO_PUBLIC_KEY" for b in breaks)

    def test_wrong_signer_key(self):
        # 다른 키로 서명된 것처럼: 공개키는 맞지만 서명이 다른 메시지 것
        genesis, chain = self._valid_chain()
        bad = replace(chain[0], signature=chain[1].signature)  # s2의 서명을 s1에
        breaks = verify_chain([bad], genesis, _PUBKEYS)
        assert any(b.reason == "SIGNATURE_INVALID" for b in breaks)
