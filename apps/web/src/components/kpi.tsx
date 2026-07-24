'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

/** KPI 타일 — cult-ui AnimatedNumber 카운트업 유지, shadcn 카드 톤. */
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
    <div className="glass rounded-2xl p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={cn('mono mt-1 text-xl font-bold tracking-tight', cls)}>
        <AnimatedNumber value={value} precision={precision} format={(n) => `${prefix}${n.toFixed(precision)}${suffix}`} />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
