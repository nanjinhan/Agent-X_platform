"""미국 종목 시드 유니버스.

전체 미국 시장(NYSE/NASDAQ 수천 종목)을 무료로 온전히 받을 소스가 없어,
Phase 1에는 자체/시연 에이전트가 쓸 유동성 상위 종목만 시드로 적재한다.
정식 데이터 계약(SYS-007) 시 전체 유니버스로 확장한다.

market 값은 instruments 테이블 규약(NYSE/NASDAQ)을 따른다.
"""

# (ticker, market, 한글명)
US_SEED: list[tuple[str, str, str]] = [
    ("AAPL", "NASDAQ", "애플"),
    ("MSFT", "NASDAQ", "마이크로소프트"),
    ("NVDA", "NASDAQ", "엔비디아"),
    ("AMZN", "NASDAQ", "아마존"),
    ("GOOGL", "NASDAQ", "알파벳 A"),
    ("META", "NASDAQ", "메타"),
    ("TSLA", "NASDAQ", "테슬라"),
    ("AVGO", "NASDAQ", "브로드컴"),
    ("AMD", "NASDAQ", "AMD"),
    ("NFLX", "NASDAQ", "넷플릭스"),
    ("ADBE", "NASDAQ", "어도비"),
    ("COST", "NASDAQ", "코스트코"),
    ("PEP", "NASDAQ", "펩시코"),
    ("INTC", "NASDAQ", "인텔"),
    ("QCOM", "NASDAQ", "퀄컴"),
    ("BRK-B", "NYSE", "버크셔 해서웨이 B"),
    ("JPM", "NYSE", "JP모건"),
    ("V", "NYSE", "비자"),
    ("UNH", "NYSE", "유나이티드헬스"),
    ("JNJ", "NYSE", "존슨앤드존슨"),
    ("WMT", "NYSE", "월마트"),
    ("XOM", "NYSE", "엑슨모빌"),
    ("MA", "NYSE", "마스터카드"),
    ("PG", "NYSE", "프록터앤드갬블"),
    ("HD", "NYSE", "홈디포"),
    ("KO", "NYSE", "코카콜라"),
    ("BAC", "NYSE", "뱅크오브아메리카"),
    ("DIS", "NYSE", "디즈니"),
    ("CVX", "NYSE", "셰브런"),
    ("CRM", "NYSE", "세일즈포스"),
    # ETF (레버리지/인버스 아님, REG-009 허용 범위)
    ("SPY", "NYSE", "SPDR S&P500 ETF"),
    ("QQQ", "NASDAQ", "인베스코 QQQ"),
    ("VOO", "NYSE", "뱅가드 S&P500 ETF"),
    ("SCHD", "NYSE", "슈왑 배당 ETF"),
]

# ETF 여부 (instruments.is_etf)
US_ETF_TICKERS = {"SPY", "QQQ", "VOO", "SCHD"}
