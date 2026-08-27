"""일일 전체 체인 재검증 배치 (SEC-018) — 무결성 감사.

에이전트별로 해시체인 전체를 재검증한다(chain_verify는 signal-service와 바이트 일치 검증).
체인 위조(변조/단절/서명불일치) 발견 시:
  1) anomaly_flags에 CRITICAL 플래그 기록
  2) 에이전트 SUSPENDED (자동 격리, AGT-003)
  3) audit_logs에 탐지 기록 (append-only, SEC-023)

정상 체인은 아무것도 바꾸지 않는다(멱등). 이미 SUSPENDED면 중복 격리하지 않는다.

실행: python -m signals_batch.verification.run_verification
"""

from __future__ import annotations

import json
import logging

from signals_batch.db import get_conn
from signals_batch.verification.chain_verify import SignalRecord, verify_chain

log = logging.getLogger("verification.run_verification")


def _load_pubkeys(conn) -> dict[str, str]:
    rows = conn.execute("SELECT key_id, public_key_pem FROM signing_keys").fetchall()
    return {r[0]: r[1] for r in rows}


def _agents_with_signals(conn) -> list:
    return conn.execute(
        """SELECT DISTINCT a.id, a.genesis_hash, a.status
           FROM agents a JOIN signals s ON s.agent_id = a.id"""
    ).fetchall()


def _load_chain(conn, agent_id) -> tuple[list[SignalRecord], dict]:
    rows = conn.execute(
        """SELECT agent_id, sequence_no, market, ticker, action,
                  target_price, stop_loss_price, suggested_weight, max_holding_days,
                  valid_until, rationale, published_at, prev_hash,
                  content_hash, signature, signing_key_id, id
           FROM signals WHERE agent_id=%s ORDER BY sequence_no ASC""",
        (agent_id,),
    ).fetchall()
    records, ids = [], {}
    for r in rows:
        records.append(SignalRecord(
            agent_id=str(r[0]), sequence_no=r[1], market=r[2], ticker=r[3], action=r[4],
            target_price=r[5], stop_loss_price=r[6], suggested_weight=r[7], max_holding_days=r[8],
            valid_until=r[9], rationale=r[10], published_at=r[11], prev_hash=r[12],
            content_hash=r[13], signature=r[14], signing_key_id=r[15],
        ))
        ids[r[1]] = r[16]  # sequence_no → signal id
    return records, ids


def _quarantine(conn, agent_id, status, broken, ids) -> None:
    """CRITICAL 플래그 + SUSPENDED + 감사 기록."""
    first = broken[0]
    detail = {
        "broken_links": [{"sequence_no": b.sequence_no, "reason": b.reason} for b in broken],
        "count": len(broken),
    }
    conn.execute(
        """INSERT INTO anomaly_flags (flag_type, severity, agent_id, signal_id, detail)
           VALUES ('CHAIN_INTEGRITY', 'CRITICAL', %s, %s, %s::jsonb)""",
        (agent_id, ids.get(first.sequence_no), json.dumps(detail, ensure_ascii=False)),
    )
    if status != "SUSPENDED":
        conn.execute(
            "UPDATE agents SET status='SUSPENDED', updated_at=NOW() WHERE id=%s", (agent_id,)
        )
    conn.execute(
        """INSERT INTO audit_logs (actor_role, action, entity_type, entity_id, after_state)
           VALUES ('SYSTEM', 'CHAIN_TAMPER_DETECTED', 'agent', %s, %s::jsonb)""",
        (str(agent_id), json.dumps(detail, ensure_ascii=False)),
    )


def run() -> dict:
    stats = {"agents": 0, "valid": 0, "broken": 0, "suspended": 0}
    with get_conn() as conn:
        pubkeys = _load_pubkeys(conn)
        agents = _agents_with_signals(conn)
        stats["agents"] = len(agents)

        for agent_id, genesis_hash, status in agents:
            chain, ids = _load_chain(conn, agent_id)
            broken = verify_chain(chain, genesis_hash, pubkeys)
            if not broken:
                stats["valid"] += 1
                log.info("체인 VALID agent=%s (%d건)", agent_id, len(chain))
                continue

            was_active = status != "SUSPENDED"
            _quarantine(conn, agent_id, status, broken, ids)
            stats["broken"] += 1
            if was_active:
                stats["suspended"] += 1
            reasons = ", ".join(f"#{b.sequence_no}:{b.reason}" for b in broken[:6])
            log.critical(
                "🚨 체인 BROKEN agent=%s (%d개 위반) → CRITICAL+SUSPENDED [%s]",
                agent_id, len(broken), reasons,
            )
        conn.commit()
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
