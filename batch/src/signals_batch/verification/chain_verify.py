"""해시체인 무결성 검증 (SEC-018) — 정규직렬화의 Python 포팅.

⚠️ **이 모듈은 signal-service의 canonical.ts / hasher.ts / signer.ts와 바이트 단위로 일치해야 한다.**
    규격의 단일 출처는 ADR-0002. 한 글자라도 달라지면 정상 시그널을 위조로 오판한다(TR-4).
    TS `verify.service.ts`의 verifyChain과 동일 로직 + 서명 검증 추가.

정규직렬화 (ADR-0002 결정 1·2):
  agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|
  suggested_weight|max_holding_days|valid_until|rationale|published_at|prev_hash
  - 각 필드를 escape(\\→\\\\, |→\\|) 후 '|'로 join
  - content_hash = SHA256(직렬화, utf8) → hex64
  - 서명 = 직렬화 문자열에 ECDSA P-256/SHA-256, DER→base64

순수 함수 → DB 없이 골든 테스트.
"""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

HASH_INPUT_TEMPLATE = (
    "agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|"
    "suggested_weight|max_holding_days|valid_until|rationale|published_at|prev_hash"
)

BreakReason = Literal["PREV_HASH_MISMATCH", "CONTENT_TAMPERED", "SIGNATURE_INVALID", "NO_PUBLIC_KEY"]


# ── 필드 정규화 (canonical.ts와 동일) ──────────────────────────────────────
def escape_field(v: str) -> str:
    r"""백슬래시를 먼저 이스케이프해야 역변환이 유일해진다. \\→\\\\ 후 |→\\|."""
    return v.replace("\\", "\\\\").replace("|", "\\|")


def format_price(v: Decimal | float | str | None) -> str:
    """NUMERIC(18,4)/(5,4)와 동일하게 소수점 4자리 고정. None/''은 빈 문자열."""
    if v is None or v == "":
        return ""
    return f"{Decimal(str(v)):.4f}"


def format_int(v: int | None) -> str:
    """정수 필드. None은 빈 문자열."""
    return "" if v is None else str(int(v))


def format_timestamp(d: datetime) -> str:
    """ISO 8601 UTC, 밀리초 3자리 (JS Date.toISOString과 동일). DB 저장값과 일치해야 함."""
    u = d.astimezone(UTC)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"


def format_optional_timestamp(d: datetime | None) -> str:
    return format_timestamp(d) if d is not None else ""


@dataclass(frozen=True)
class SignalRecord:
    agent_id: str
    sequence_no: int
    market: str
    ticker: str
    action: str
    target_price: Decimal | None
    stop_loss_price: Decimal | None
    suggested_weight: Decimal | None
    max_holding_days: int | None
    valid_until: datetime | None
    rationale: str
    published_at: datetime
    prev_hash: str
    content_hash: str
    signature: str
    signing_key_id: str


def canonicalize(r: SignalRecord) -> str:
    """정규 직렬화 문자열. 해시·서명의 유일한 입력."""
    fields = [
        r.agent_id,
        str(r.sequence_no),
        r.market,
        r.ticker,
        r.action,
        format_price(r.target_price),
        format_price(r.stop_loss_price),
        format_price(r.suggested_weight),
        format_int(r.max_holding_days),
        format_optional_timestamp(r.valid_until),
        r.rationale,
        format_timestamp(r.published_at),
        r.prev_hash,
    ]
    return "|".join(escape_field(f) for f in fields)


def sha256hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def verify_signature(message: str, signature_b64: str, public_key_pem: str) -> bool:
    """ECDSA P-256/SHA-256 서명 검증 (signer.ts verifyMessage와 동일). 실패 시 False."""
    try:
        pub = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        sig = base64.b64decode(signature_b64)
        pub.verify(sig, message.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


@dataclass
class BrokenLink:
    sequence_no: int
    reason: BreakReason


def verify_chain(
    signals: Sequence[SignalRecord],
    genesis_hash: str,
    pubkeys: dict[str, str],
) -> list[BrokenLink]:
    """에이전트 체인 전체 재검증 (verify.service.ts verifyChain + 서명).

    signals는 sequence_no 오름차순. pubkeys: signing_key_id → public_key_pem.
    반환: 깨진 링크 목록(비어 있으면 VALID).
    """
    prev = genesis_hash
    broken: list[BrokenLink] = []
    for s in signals:
        canonical = canonicalize(s)
        if s.prev_hash != prev:
            broken.append(BrokenLink(s.sequence_no, "PREV_HASH_MISMATCH"))
        if sha256hex(canonical) != s.content_hash:
            broken.append(BrokenLink(s.sequence_no, "CONTENT_TAMPERED"))
        pem = pubkeys.get(s.signing_key_id)
        if pem is None:
            broken.append(BrokenLink(s.sequence_no, "NO_PUBLIC_KEY"))
        elif not verify_signature(canonical, s.signature, pem):
            broken.append(BrokenLink(s.sequence_no, "SIGNATURE_INVALID"))
        prev = s.content_hash
    return broken
