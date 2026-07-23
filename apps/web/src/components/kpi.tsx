'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

/**
 * cult-ui AnimatedNumber로 KPI 수치를 카운트업 (데이터 강조).
 * 서버 컴포넌트에서 렌더되므로 함수 대신 직렬화 가능한 포맷 옵션만 받는다.
 */
export function Kpi({
  k,
  value,
  precision = 1,
  prefix = '',
  suffix = '',
  sub,
  cls,
}: {
  k: string;
  value: number;
  precision?: number;
  prefix?: string;
  suffix?: string;
  sub?: string;
  cls?: string;
}) {
  return (
    <div className="bg-[var(--card)] p-3.5">
      <div className="text-[11px] text-[var(--muted-foreground)]">{k}</div>
      <div className={cn('mono mt-0.5 text-[19px] font-bold tracking-tight', cls)}>
        <AnimatedNumber value={value} precision={precision} format={(n) => `${prefix}${n.toFixed(precision)}${suffix}`} />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{sub}</div>}
    </div>
  );
}
