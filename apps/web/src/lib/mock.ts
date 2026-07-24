import type { AgentSummary, SignalRow } from './types';

/** T13 랭킹 API 완성 전까지 쓰는 목 데이터. 실제 값 아님(시안용). */
export const AGENTS: AgentSummary[] = [
  {
    id: 'jjanggu-value',
    rank: 1,
    name: '짱구가치',
    tagline: '저PBR·고배당 대형 가치주 · 장기 보유',
    icon: 'value',
    providerName: '짱구퀀트',
    isPlatformOwned: false,
    badges: ['VERIFIED', 'EXPERT'],
    league: 'KR',
    division: 'NEUTRAL',
    priceKrw: 29900,
    priceTier: 'T3',
    status: 'ACTIVE',
    metrics: {
      signalsScore: 82.4, cumulativeReturn: 0.283, alpha: 0.115, sortino: 1.84,
      maxDrawdown: -0.121, winRate: 0.58, winRateWilsonLb: 0.46, closedPositions: 64,
      openPositions: 3, operatingDays: 247, subscribers: 312, retention3m: 0.61,
    },
  },
  {
    id: 'dundun-value',
    rank: 2,
    name: '든든가치',
    tagline: '배당 성장주 · 저변동성',
    icon: 'dividend',
    providerName: '한서영',
    isPlatformOwned: false,
    badges: ['VERIFIED', 'EXPERT', 'LOW_DD'],
    league: 'KR',
    division: 'STABLE',
    priceKrw: 19900,
    priceTier: 'T2',
    status: 'ACTIVE',
    metrics: {
      signalsScore: 79.0, cumulativeReturn: 0.154, alpha: 0.061, sortino: 1.67,
      maxDrawdown: -0.082, winRate: 0.62, winRateWilsonLb: 0.5, closedPositions: 41,
      openPositions: 2, operatingDays: 210, subscribers: 178, retention3m: 0.66,
    },
  },
  {
    id: 'pado',
    rank: 3,
    name: '파도',
    tagline: '섹터 로테이션 · 상대강도',
    icon: 'rotation',
    providerName: '플랫폼 운영',
    isPlatformOwned: true,
    badges: ['VERIFIED', 'PLATFORM'],
    league: 'MIXED',
    division: 'NEUTRAL',
    priceKrw: 19900,
    priceTier: 'T2',
    status: 'ACTIVE',
    metrics: {
      signalsScore: 76.1, cumulativeReturn: 0.197, alpha: 0.072, sortino: 1.42,
      maxDrawdown: -0.148, winRate: 0.54, winRateWilsonLb: 0.43, closedPositions: 51,
      openPositions: 4, operatingDays: 198, subscribers: 205, retention3m: 0.57,
    },
  },
];

export const ARCHIVED_AGENTS: AgentSummary[] = [
  {
    id: 'geupdeung',
    rank: null,
    name: '급등포착',
    tagline: '모멘텀·거래량 돌파 (종료)',
    icon: 'momentum',
    providerName: '익명퀀트',
    isPlatformOwned: false,
    badges: ['POOR'],
    league: 'KR',
    division: 'AGGRESSIVE',
    priceKrw: 0,
    priceTier: '',
    status: 'ARCHIVED',
    archiveReason: '성과 부진',
    metrics: {
      signalsScore: 0, cumulativeReturn: -0.312, alpha: -0.189, sortino: -0.4,
      maxDrawdown: -0.441, winRate: 0.38, winRateWilsonLb: 0.28, closedPositions: 53,
      openPositions: 0, operatingDays: 94, subscribers: 0, retention3m: 0,
    },
  },
];

export function getAgent(id: string): AgentSummary | undefined {
  return [...AGENTS, ...ARCHIVED_AGENTS].find((a) => a.id === id);
}

/** 성과 차트용 정규화 누적수익(%) 시계열 (100 기준). */
export const PERF_SERIES = {
  agent: [0, 1.2, 2.0, 1.4, 3.1, 4.6, 4.0, 6.2, 8.1, 7.0, 9.4, 11.2, 10.1, 13.6, 15.0, 14.2, 17.1, 19.8, 18.4, 21.6, 23.9, 22.1, 25.4, 27.0, 26.2, 28.3],
  benchmark: [0, 0.8, 1.4, 1.1, 2.0, 2.9, 2.4, 3.6, 4.4, 3.9, 5.1, 6.0, 5.4, 7.2, 8.1, 7.6, 9.4, 10.6, 9.9, 12.1, 13.4, 12.6, 14.4, 15.5, 15.0, 16.8],
  drawdown: [0, -0.4, -0.2, -2.1, -0.8, 0, -1.1, 0, 0, -3.2, -1.4, 0, -2.6, 0, 0, -4.1, -1.9, 0, -5.0, -2.2, 0, -6.8, -3.1, 0, -12.1, -4.4],
  verifyEndIdx: 4,
};

export const SIGNALS: SignalRow[] = [
  { seq: 87, name: '삼성전자', ticker: '005930', action: '진입', entry: '78,500', exit: '—', returnPct: '+2.4%', holding: '보유중', result: 'OPEN' },
  { seq: 86, name: 'SK하이닉스', ticker: '000660', action: '청산', entry: '142,000', exit: '161,500', returnPct: '+13.2%', holding: '21일', result: 'TAKE_PROFIT' },
  { seq: 85, name: 'NAVER', ticker: '035420', action: '청산', entry: '215,000', exit: '199,800', returnPct: '−7.1%', holding: '9일', result: 'STOP_LOSS' },
  { seq: 84, name: '현대차', ticker: '005380', action: '청산', entry: '238,000', exit: '259,200', returnPct: '+8.9%', holding: '34일', result: 'TAKE_PROFIT' },
  { seq: 83, name: '카카오', ticker: '035720', action: '청산', entry: '52,400', exit: '48,800', returnPct: '−6.9%', holding: '12일', result: 'STOP_LOSS' },
  { seq: 82, name: 'KB금융', ticker: '105560', action: '청산', entry: '71,200', exit: '79,200', returnPct: '+11.2%', holding: '28일', result: 'TAKE_PROFIT' },
  { seq: 81, name: '셀트리온', ticker: '068270', action: '—', entry: '—', exit: '—', returnPct: '제외', holding: '—', result: 'VOID' },
];

export const TRANSPARENCY = {
  total: 127, selling: 48, verifying: 19, paused: 12, archived: 48,
  avgLifespanMonths: 8.3,
  beatBenchmarkRate: 0.386,
  distribution: [
    { label: '상위 10%', value: '+42.1%', width: 92, kind: 'up' as const },
    { label: '상위 25%', value: '+18.7%', width: 70, kind: 'up' as const },
    { label: '벤치마크 (KOSPI200)', value: '+7.8%', width: 55, kind: 'mark' as const },
    { label: '중앙값', value: '+3.2%', width: 48, kind: 'neutral' as const },
    { label: '하위 25%', value: '−8.4%', width: 32, kind: 'down' as const },
    { label: '하위 10%', value: '−24.9%', width: 14, kind: 'down' as const },
  ],
  reasons: [
    { label: '공급자 자발 종료', pct: 46 },
    { label: '성과 부진', pct: 29 },
    { label: '규정 위반', pct: 15 },
    { label: '미발행 자동종료', pct: 10 },
  ],
};
