'use client';

import { PERF_SERIES } from '@/lib/mock';

/** 누적수익 vs 벤치마크 + 낙폭 서브차트 (SVG). 검증기간 음영·엔드포인트 강조. */
export function PerfChart() {
  const { agent, benchmark, drawdown, verifyEndIdx } = PERF_SERIES;
  const W = 820, padL = 8, padR = 8, topH = 178, gap = 14, ddH = 42;
  const n = agent.length, maxV = 30, minDD = -13;
  const X = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const Y = (v: number) => 12 + (1 - v / maxV) * (topH - 12);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = line(agent) + ` L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)} L${X(0).toFixed(1)},${Y(0).toFixed(1)} Z`;

  const ddY = topH + gap;
  const dX = (i: number) => padL + (i / (drawdown.length - 1)) * (W - padL - padR);
  const dY = (v: number) => ddY + (v / minDD) * ddH;
  const ddLine = drawdown.map((v, i) => `${i ? 'L' : 'M'}${dX(i).toFixed(1)},${dY(v).toFixed(1)}`).join(' ');
  const ddArea = ddLine + ` L${dX(drawdown.length - 1).toFixed(1)},${ddY} L${padL},${ddY} Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 820 260" width="100%" height="260" role="img" aria-label="누적 수익률 대 벤치마크 추이">
        {[0, 10, 20, 30].map((g) => (
          <g key={g}>
            <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL + 2} y={Y(g) - 4} fill="var(--muted-foreground)" fontSize={10} className="mono">
              +{g}%
            </text>
          </g>
        ))}
        {/* 검증기간 음영 */}
        <rect x={padL} y={12} width={X(verifyEndIdx) - padL} height={topH - 12} fill="var(--accent)" opacity={0.06} />
        <text x={X(verifyEndIdx / 2)} y={26} fill="var(--accent)" fontSize={9.5} textAnchor="middle" className="mono">
          검증기간
        </text>
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={line(benchmark)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.6} strokeDasharray="4 3" />
        <path d={line(agent)} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={X(n - 1)} cy={Y(agent[n - 1])} r={4} fill="var(--accent)" stroke="var(--card)" strokeWidth={2} />
        <text x={X(n - 1) - 6} y={Y(agent[n - 1]) - 9} fill="var(--up)" fontSize={12} textAnchor="end" fontWeight={700} className="mono">
          +28.3%
        </text>
        {/* 낙폭 */}
        <text x={padL + 2} y={ddY + 11} fill="var(--muted-foreground)" fontSize={10} className="mono">
          낙폭
        </text>
        <path d={ddArea} fill="var(--down)" opacity={0.18} />
        <path d={ddLine} fill="none" stroke="var(--down)" strokeWidth={1.4} />
      </svg>
    </div>
  );
}
