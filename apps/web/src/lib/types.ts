/**
 * 프론트 표시 모델. 지금은 mock에서 채우고, T13(랭킹)·T9~T12(성과) 완성 후
 * 실제 API(/v1/agents, /v1/rankings)로 갈아끼운다. 필드는 SRS 17.3 응답과 정렬.
 */
export type League = 'KR' | 'US' | 'MIXED';
export type Division = 'STABLE' | 'NEUTRAL' | 'AGGRESSIVE';

export interface AgentMetrics {
  signalsScore: number;
  cumulativeReturn: number; // 0.283 = +28.3%
  alpha: number;
  sortino: number;
  maxDrawdown: number; // -0.121
  winRate: number;
  winRateWilsonLb: number;
  closedPositions: number;
  openPositions: number;
  operatingDays: number;
  subscribers: number;
  retention3m: number;
}

/** 전략 성격 아이콘 키 (agent-icon.tsx와 대응) */
export type AgentIconKey = 'value' | 'dividend' | 'rotation' | 'momentum' | 'default';

export interface AgentSummary {
  id: string;
  rank: number | null;
  name: string;
  tagline: string;
  icon: AgentIconKey;
  providerName: string;
  isPlatformOwned: boolean;
  badges: BadgeKind[];
  league: League;
  division: Division;
  priceKrw: number;
  priceTier: string;
  status: 'ACTIVE' | 'ARCHIVED';
  archiveReason?: string;
  metrics: AgentMetrics;
}

export type BadgeKind = 'VERIFIED' | 'EXPERT' | 'PLATFORM' | 'LOW_DD' | 'POOR';

export type SignalResult = 'TAKE_PROFIT' | 'STOP_LOSS' | 'OPEN' | 'VOID' | 'TIME_LIMIT';

export interface SignalRow {
  seq: number;
  name: string;
  ticker: string;
  action: '진입' | '청산' | '—';
  entry: string;
  exit: string;
  returnPct: string; // "+13.2%" | "−7.1%" | "제외"
  holding: string;
  result: SignalResult;
}
