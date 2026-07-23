/** 표시 포맷 유틸. 한국 시장 관례: 상승=빨강(up), 하락=파랑(down). */

export const krw = (n: number) => n.toLocaleString('ko-KR');

/** 0.283 → "+28.3%", 음수는 유니코드 마이너스(−)로 */
export function pct(v: number, digits = 1): string {
  const s = (v * 100).toFixed(digits);
  return v >= 0 ? `+${s}%` : `−${Math.abs(v * 100).toFixed(digits)}%`;
}

export function pctPoint(v: number, digits = 1): string {
  const s = Math.abs(v * 100).toFixed(digits);
  return v >= 0 ? `+${s}%p` : `−${s}%p`;
}

/** 수익률 부호 → 색상 클래스 ('up' 빨강 / 'down' 파랑 / '') */
export function dir(v: number): 'up' | 'down' | '' {
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}

export function dirStr(s: string): 'up' | 'down' | '' {
  if (s.startsWith('+')) return 'up';
  if (s.startsWith('−') || s.startsWith('-')) return 'down';
  return '';
}

export const LEAGUE_LABEL: Record<string, string> = { KR: '국내', US: '미국', MIXED: '혼합' };
export const DIVISION_LABEL: Record<string, string> = { STABLE: '안정', NEUTRAL: '중립', AGGRESSIVE: '공격' };
