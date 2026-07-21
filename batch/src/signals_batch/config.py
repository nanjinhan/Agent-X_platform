"""배치 공통 설정. 환경변수 우선, 없으면 로컬 개발 기본값."""

import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://signals:signals_local_dev@localhost:5433/signals",
)
