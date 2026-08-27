"""랭킹 산출 배치 (RANK-002~006) — agent_rankings 갱신.

파이프라인:
  1) 에이전트 + agent_metrics 로드
  2) 리그(최근 90일 시그널 시장 비중) · 부문(위험성향) 판정
  3) 노출 자격(RANK-005/006) 판정
  4) 6개 구성요소 원값 산출(월수익률은 일별 스냅샷에서 집계)
  5) 리그·부문 그룹별 Z정규화 + 가중합 → SIGNALS Score
  6) 부문/리그/전체 순위 매겨 agent_rankings upsert (미자격도 사유와 함께 기록)

실행: python -m signals_batch.ranking.run_ranking
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from signals_batch.db import get_conn
from signals_batch.performance.trading_calendar import market_tz
from signals_batch.ranking.scoring import (
    AgentInput,
    check_eligibility,
    classify_division,
    classify_league,
    consistency,
    discipline,
    retention,
    risk_adjusted,
    sample_confidence,
    score_group,
)

log = logging.getLogger("ranking.run_ranking")

_KR_MARKETS = ("KOSPI", "KOSDAQ")


def _today_kr() -> date:
    return datetime.now(UTC).astimezone(market_tz("KOSPI")).date()


def _load_agents(conn) -> list:
    return conn.execute(
        """SELECT a.id, a.status, a.risk_profile, a.expected_frequency,
                  m.sortino, m.calmar, m.alpha, m.void_rate, m.unclosed_rate,
                  m.freq_deviation, m.retention_3m, m.retention_6m,
                  m.closed_positions, m.operating_days
           FROM agents a
           LEFT JOIN agent_metrics m ON m.agent_id = a.id"""
    ).fetchall()


def _signal_market_counts(conn, agent_id, since: date) -> tuple[int, int]:
    rows = conn.execute(
        """SELECT market, COUNT(*) FROM signals
           WHERE agent_id=%s AND action='ENTRY' AND published_at >= %s
           GROUP BY market""",
        (agent_id, since),
    ).fetchall()
    kr = sum(c for m, c in rows if m in _KR_MARKETS)
    us = sum(c for m, c in rows if m not in _KR_MARKETS)
    return kr, us


def _has_recent_signal(conn, agent_id, since: date) -> bool:
    return conn.execute(
        "SELECT EXISTS(SELECT 1 FROM signals WHERE agent_id=%s AND action='ENTRY' AND published_at >= %s)",
        (agent_id, since),
    ).fetchone()[0]


def _monthly_returns(conn, agent_id) -> list[float]:
    """일별 스냅샷 → 월별 수익률(월말/월초 자산가치 − 1). 일관성 산출용."""
    rows = conn.execute(
        "SELECT snapshot_date, portfolio_value FROM agent_daily_snapshots "
        "WHERE agent_id=%s ORDER BY snapshot_date",
        (agent_id,),
    ).fetchall()
    by_month: dict[tuple[int, int], list] = defaultdict(list)
    for d, v in rows:
        by_month[(d.year, d.month)].append(float(v))
    return [(vals[-1] / vals[0] - 1) for vals in by_month.values() if vals[0]]


def _components(row, monthly: list[float]) -> dict[str, float | None]:
    (_id, _st, _rp, _fq, sortino, calmar, alpha, void_rate, unclosed_rate,
     freq_dev, r3m, r6m, closed, _days) = row
    f = lambda x: float(x) if x is not None else None
    return {
        "risk_adjusted": risk_adjusted(f(sortino), f(calmar)),
        "excess_return": f(alpha),
        "consistency": consistency(monthly),
        "retention": retention(f(r3m), f(r6m)),
        "discipline": discipline(f(void_rate), f(unclosed_rate), f(freq_dev)),
        "sample_confidence": sample_confidence(closed or 0),
    }


def run() -> dict:
    stats = {"agents": 0, "eligible": 0, "ineligible": 0}
    today = _today_kr()
    since90 = today - timedelta(days=90)
    since30 = today - timedelta(days=30)

    with get_conn() as conn:
        agents = _load_agents(conn)
        stats["agents"] = len(agents)

        # 1) 에이전트별 리그·부문·자격·구성요소
        meta: dict = {}
        groups: dict[tuple[str, str], list[AgentInput]] = defaultdict(list)
        for row in agents:
            agent_id, status, risk_profile, freq = row[0], row[1], row[2], row[3]
            closed, op_days = row[12] or 0, row[13] or 0
            void_rate, unclosed_rate = row[7], row[8]

            kr, us = _signal_market_counts(conn, agent_id, since90)
            league = classify_league(kr, us)
            division = classify_division(risk_profile or "")
            recent = _has_recent_signal(conn, agent_id, since30)
            comps = _components(row, _monthly_returns(conn, agent_id))
            eligible, reason = check_eligibility(
                status, closed, op_days,
                float(unclosed_rate) if unclosed_rate is not None else None,
                float(void_rate) if void_rate is not None else None,
                recent, freq or "",
            )
            meta[agent_id] = {"league": league, "division": division, "comps": comps,
                              "eligible": eligible, "reason": reason}
            groups[(league, division)].append(AgentInput(str(agent_id), comps, eligible))

        # 2) 그룹별 점수 → agent_id별 (score, z)
        scored: dict[str, tuple[float, dict]] = {}
        for scores in (score_group(inputs) for inputs in groups.values()):
            for s in scores:
                scored[s.agent_id] = (s.signals_score, s.z_components)

        # 3) 순위 계산 (자격자만, 점수 내림차순)
        elig_ids = [aid for aid in meta if meta[aid]["eligible"]]
        elig_ids.sort(key=lambda a: scored.get(str(a), (0.0, {}))[0], reverse=True)
        overall_rank = {aid: i + 1 for i, aid in enumerate(elig_ids)}

        league_rank = _rank_within(elig_ids, scored, meta, lambda m: m["league"])
        div_rank = _rank_within(elig_ids, scored, meta, lambda m: (m["league"], m["division"]))

        # 4) 저장
        for agent_id, info in meta.items():
            eligible = info["eligible"]
            score, zc = scored.get(str(agent_id), (0.0, {}))
            components_json = json.dumps({"raw": info["comps"], "z": zc}, ensure_ascii=False)
            conn.execute(
                """INSERT INTO agent_rankings
                     (agent_id, ranking_date, league, division, signals_score,
                      rank_in_division, rank_in_league, rank_overall, score_components,
                      is_eligible, ineligible_reason)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)
                   ON CONFLICT (agent_id, ranking_date) DO UPDATE SET
                     league=EXCLUDED.league, division=EXCLUDED.division,
                     signals_score=EXCLUDED.signals_score,
                     rank_in_division=EXCLUDED.rank_in_division,
                     rank_in_league=EXCLUDED.rank_in_league,
                     rank_overall=EXCLUDED.rank_overall,
                     score_components=EXCLUDED.score_components,
                     is_eligible=EXCLUDED.is_eligible, ineligible_reason=EXCLUDED.ineligible_reason""",
                (agent_id, today, info["league"], info["division"], round(score, 4),
                 div_rank.get(agent_id, 0), league_rank.get(agent_id, 0),
                 overall_rank.get(agent_id), components_json,
                 eligible, info["reason"]),
            )
            stats["eligible" if eligible else "ineligible"] += 1
            log.info(
                "랭킹 agent=%s: %s/%s score=%.4f rank(div=%s lg=%s all=%s) %s",
                agent_id, info["league"], info["division"], score,
                div_rank.get(agent_id, "—"), league_rank.get(agent_id, "—"),
                overall_rank.get(agent_id, "—"), "" if eligible else f"미산출({info['reason']})",
            )
        conn.commit()
    return stats


def _rank_within(elig_ids, scored, meta, keyfn) -> dict:
    """키(리그 또는 리그·부문)별로 점수 내림차순 순위."""
    buckets: dict = defaultdict(list)
    for aid in elig_ids:
        buckets[keyfn(meta[aid])].append(aid)
    out: dict = {}
    for ids in buckets.values():
        ids.sort(key=lambda a: scored.get(str(a), (0.0, {}))[0], reverse=True)
        for i, aid in enumerate(ids):
            out[aid] = i + 1
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
