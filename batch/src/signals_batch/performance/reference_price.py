"""기준가 확정 (SRS 9.2).

장외 발행 시그널: 발행 익일 시가 (NEXT_OPEN).
장중 발행 시그널: 발행 후 5분 VWAP (INTRADAY_VWAP).
거래 캘린더(trading_calendar)에 의존하므로 휴장일 처리에 주의.
"""
