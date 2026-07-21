"""성과 지표 계산 (SRS 9.4) — agent_metrics 테이블 갱신.

수익성: 누적수익률, CAGR / 위험: 변동성, MDD, VaR95
위험조정: 샤프, 소르티노, 칼마, 알파, 베타
실행: 승률(Wilson 하한 포함), profit factor, 기대값
규율: 손절 준수율, 미청산율, 무효율

검증: empyrical/quantstats와 교차 검증 권장 (SYS-006).
"""
