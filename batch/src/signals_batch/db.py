"""DB 접근 헬퍼 (psycopg3).

배치는 Core API 모듈 경계(SYS-003)의 예외적 소유자다:
instruments / daily_prices / trading_calendar / fx_rates / benchmark_values /
agent_daily_snapshots / agent_metrics / agent_rankings 를 소유한다.
그 외 테이블에는 쓰지 않는다 (anomaly_flags는 플래그 INSERT만 허용).
"""

from contextlib import contextmanager

import psycopg

from signals_batch.config import DATABASE_URL


@contextmanager
def get_conn():
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn
