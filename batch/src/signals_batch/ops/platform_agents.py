"""내부 운영 도구 — 자체 에이전트 등록·발행 (AGT-001/002, T15 → M1).

콜드스타트 해결을 위해 플랫폼이 직접 운영하는 3개 에이전트(든든·파도·질주)를 등록하고,
실제 signal-service 발행 엔드포인트로 시그널을 발행한다 → 해시체인에 실제 기록 + 포지션 개시.

**페이퍼 트레이딩(AGT-002 #1)**: 자체 에이전트도 외부와 동일하게 30일 페이퍼 트레이딩을 거친다.
→ 에이전트를 **VERIFYING** 상태로 두면 발행 시그널이 is_paper=true(페이퍼)로 기록된다. 이것이 M1 개시.

**인증**: 발행 엔드포인트는 ADMIN 토큰을 "내부 도구(자체 에이전트)"로 간주해 소유권 검사를 생략한다
(publish.controller). 그래서 공유 JWT_ACCESS_SECRET으로 ADMIN 액세스 토큰을 발급해 발행한다(HS256).

전제: signal-service 기동(:3001), DB 마이그레이션 적용. 실행: python -m signals_batch.ops.platform_agents
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time

import httpx
import psycopg

from signals_batch.config import DATABASE_URL

log = logging.getLogger("ops.platform_agents")

SIGNAL_SERVICE = os.environ.get("SIGNAL_SERVICE_URL", "http://localhost:3001")
JWT_SECRET = os.environ.get("JWT_ACCESS_SECRET", "change-me-local-only-access")

PLATFORM_PROVIDER = "55555555-5555-5555-5555-555555555555"
PLATFORM_USER = "55555555-0000-0000-0000-000000000001"

# AGT-001: 투자성향 스펙트럼을 커버하는 3개 자체 에이전트
AGENTS = [
    {
        "id": "a0000001-0000-0000-0000-000000000001", "name": "든든",
        "tagline": "배당·저PBR 가치주로 잃지 않는 투자", "risk": "MODERATE_CONS",
        "scope": "KR", "freq": "LOW", "holding": "LONG", "tags": ["VALUE", "DIVIDEND"],
        "signals": [
            {"market": "KOSPI", "ticker": "005930", "name": "삼성전자",
             "ref": 80000, "target": 92000, "stop": 74000, "weight": 0.15, "hold": 120,
             "rationale": "HBM 수요 확대와 메모리 업사이클 진입으로 하반기 실적 개선이 기대된다. "
                          "저PBR(0.9배)·배당 매력이 하방을 지지하며 12개월 선행 P/B 1.1배를 목표로 한다. "
                          "손절은 직전 지지선 이탈 기준으로 설정한다."},
        ],
    },
    {
        "id": "a0000002-0000-0000-0000-000000000002", "name": "파도",
        "tagline": "섹터 로테이션으로 흐름을 탄다", "risk": "NEUTRAL",
        "scope": "MIXED", "freq": "MEDIUM", "holding": "SWING", "tags": ["MOMENTUM", "SECTOR"],
        "signals": [
            {"market": "NASDAQ", "ticker": "AAPL", "name": "Apple",
             "ref": 100, "target": 115, "stop": 92, "weight": 0.20, "hold": 20,
             "rationale": "서비스 매출 비중 확대와 신제품 사이클 진입으로 상대강도가 개선되고 있다. "
                          "기술주 섹터로의 자금 로테이션이 관찰되어 단기 상승 여력이 있다고 판단한다. "
                          "손절은 20일 이동평균선 이탈 기준이다."},
        ],
    },
    {
        "id": "a0000003-0000-0000-0000-000000000003", "name": "질주",
        "tagline": "모멘텀·거래량 돌파에 올라탄다", "risk": "AGGRESSIVE",
        "scope": "US", "freq": "HIGH", "holding": "VERY_SHORT", "tags": ["MOMENTUM", "BREAKOUT"],
        "signals": [
            {"market": "NASDAQ", "ticker": "TSLA", "name": "Tesla",
             "ref": 250, "target": 285, "stop": 232, "weight": 0.10, "hold": 5,
             "rationale": "거래량이 20일 평균 대비 2배 이상 급증하며 전고점을 돌파했다. "
                          "단기 모멘텀이 강하게 형성되어 추격 매수 관점에서 접근한다. "
                          "변동성이 크므로 손절폭을 타이트하게 가져가고 보유기간은 짧게 유지한다."},
        ],
    },
]


def _mint_admin_token(ttl_sec: int = 3600) -> str:
    """core-api HS256 토큰 포맷으로 ADMIN 액세스 토큰 발급 (signal-service가 공유 시크릿으로 검증)."""
    def b64url(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps(
        {"sub": PLATFORM_USER, "role": "ADMIN", "exp": int(time.time()) + ttl_sec},
        separators=(",", ":"),
    ).encode())
    sig = b64url(hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def _seed_agents(conn) -> None:
    """플랫폼 공급자 + 3 자체 에이전트를 VERIFYING(페이퍼) 상태로 시드. 멱등."""
    conn.execute(
        """INSERT INTO users (id, email, risk_disclosure_at, role)
           VALUES (%s, 'platform@signals.internal', NOW(), 'ADMIN')
           ON CONFLICT (id) DO NOTHING""",
        (PLATFORM_USER,),
    )
    conn.execute(
        """INSERT INTO providers (id, user_id, display_name, bio, commission_rate, status,
             is_platform_owned)
           VALUES (%s, %s, '시그널스 플랫폼', '플랫폼이 직접 운영하는 자체 에이전트입니다 (REG-011).',
             0.0000, 'ACTIVE', TRUE)
           ON CONFLICT (id) DO NOTHING""",
        (PLATFORM_PROVIDER, PLATFORM_USER),
    )
    for a in AGENTS:
        genesis = hashlib.sha256(f"genesis:{a['name']}".encode()).hexdigest()
        conn.execute(
            """INSERT INTO agents (id, provider_id, name, tagline, description, agent_type,
                 risk_profile, asset_scope, strategy_tags, expected_frequency, avg_holding_period,
                 max_positions, price_tier, price_krw, status, genesis_hash, verification_start)
               VALUES (%s,%s,%s,%s,%s,'MANUAL',%s,%s,%s,%s,%s,5,'T2',29900,'VERIFYING',%s,NOW())
               ON CONFLICT (id) DO NOTHING""",
            (a["id"], PLATFORM_PROVIDER, a["name"], a["tagline"],
             f"{a['name']} — 플랫폼 자체 에이전트. 30일 페이퍼 트레이딩 중.",
             a["risk"], a["scope"], a["tags"], a["freq"], a["holding"], genesis),
        )
    conn.commit()


def _publish(token: str, agent_id: str, sig: dict) -> dict:
    body = {
        "agentId": agent_id, "market": sig["market"], "ticker": sig["ticker"],
        "instrumentName": sig["name"], "action": "ENTRY",
        "referencePrice": sig["ref"], "targetPrice": sig["target"], "stopLossPrice": sig["stop"],
        "suggestedWeight": sig["weight"], "maxHoldingDays": sig["hold"], "rationale": sig["rationale"],
        "idempotencyKey": f"t15-{agent_id[:8]}-{sig['ticker']}",
    }
    r = httpx.post(
        f"{SIGNAL_SERVICE}/v1/provider/signals", json=body,
        headers={"Authorization": f"Bearer {token}"}, timeout=15,
    )
    r.raise_for_status()
    return r.json()


def run() -> dict:
    stats = {"agents": 0, "published": 0, "failed": 0}
    with psycopg.connect(DATABASE_URL) as conn:
        _seed_agents(conn)
        stats["agents"] = len(AGENTS)

    token = _mint_admin_token()
    for a in AGENTS:
        for sig in a["signals"]:
            try:
                res = _publish(token, a["id"], sig)
                stats["published"] += 1
                log.info(
                    "발행 %s #%s %s hash=%s… paper=%s",
                    a["name"], res["sequenceNo"], sig["ticker"], res["contentHash"][:12], res["isPaper"],
                )
            except httpx.HTTPStatusError as e:
                stats["failed"] += 1
                log.error("발행 실패 %s %s: %s %s", a["name"], sig["ticker"], e.response.status_code, e.response.text)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
