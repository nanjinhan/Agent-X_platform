# signals-batch

성과 계산·랭킹·시장데이터 수집 배치 (Python, SYS-006).
Core API와는 **DB와 도메인 이벤트로만** 통신한다.

## 패키지 구성

| 패키지 | 책임 | SRS |
|---|---|---|
| `ingestion` | 국내(KRX/DART/ECOS)·미국(Polygon/EDGAR) 데이터 수집, 품질 검증, 거래 캘린더 | SYS-007~011 |
| `performance` | 기준가 확정, 자동 청산 판정, 수익률·지표 계산, 일별 스냅샷 | 9장 |
| `ranking` | SIGNALS Score, 리그·부문 랭킹 산출 | 10장 |
| `verification` | 해시 체인 무결성 검증 배치 | 20.2 |
| `anomaly` | 선행매매 탐지(REG-012), 변동성-프로필 괴리(AGT-007), 빈도 위반(AGT-010) | — |
| `rule_engine` | 룰 기반 에이전트 조건 평가 → signal-service 발행 API 호출 | AGT-011 |
| `settlement_calc` | 정산 산출 (홀드백·원천징수) — Phase 3 | SUB-012 |

## 정확성 기준 (Phase 1 검수, 24.1)

성과 계산은 수동 계산 대비 **오차 0.01%p 이내**여야 한다.
`tests/golden/`의 대조 케이스가 이를 검증하며, 계산 로직 변경 시 골든 케이스를 먼저 갱신한다.

## 실행

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
pytest
```
