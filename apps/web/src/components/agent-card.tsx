import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AgentSummary } from '@/lib/types';
import { pct, pctPoint, dir, krw } from '@/lib/format';
import { Badge } from './ui/badge';

function Metric({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted-foreground)]">{k}</div>
      <div className={cn('mono mt-0.5 text-[15px] font-semibold', cls)}>{v}</div>
    </div>
  );
}

export function AgentCard({ a }: { a: AgentSummary }) {
  const m = a.metrics;
  const archived = a.status === 'ARCHIVED';
  const body = (
    <div
      className={cn(
        'group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border bg-[var(--card)] px-4 py-4 transition-all',
        !archived && 'hover:-translate-y-px hover:border-[var(--muted-foreground)]/40 hover:shadow-lg',
        a.isPlatformOwned && 'border-l-[3px] border-l-[var(--accent)]',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="mono w-6 text-right text-[15px] font-bold text-[var(--muted-foreground)]">
          {a.rank ?? '—'}
        </span>
        <span
          className="grid size-[46px] place-items-center rounded-xl text-lg font-bold text-white"
          style={{ background: `linear-gradient(145deg, ${a.gradient[0]}, ${a.gradient[1]})` }}
        >
          {a.initial}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[15.5px] font-semibold">
            {a.name}
            <span className="flex flex-wrap gap-1">
              {a.badges.map((b) => (
                <Badge key={b} kind={b} />
              ))}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-[var(--muted-foreground)]">{a.tagline}</span>
          <span className="mt-1.5 block text-[12px] text-[var(--muted-foreground)]">
            {a.providerName} · 운영 {m.operatingDays}일 · 구독자 {krw(m.subscribers)}명
            {!archived && ` · 유지율 ${Math.round(m.retention3m * 100)}%`}
          </span>
        </span>
      </div>

      <div className="hidden items-center gap-6 justify-self-center lg:flex">
        <Metric k="종합" v={archived ? '—' : m.signalsScore.toFixed(1)} />
        <Metric k="누적수익" v={pct(m.cumulativeReturn)} cls={dir(m.cumulativeReturn)} />
        <Metric k="알파" v={pctPoint(m.alpha)} cls={dir(m.alpha)} />
        <Metric k="MDD" v={pct(m.maxDrawdown)} cls="down" />
        <Metric k="승률" v={`${Math.round(m.winRate * 100)}%`} />
      </div>

      <div className="flex flex-col items-end gap-2 text-right">
        {archived ? (
          <span className="text-[15px] font-semibold text-[var(--muted-foreground)]">종료됨</span>
        ) : (
          <>
            <span className="mono text-[15px] font-bold">
              월 {krw(a.priceKrw)}원 <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{a.priceTier}</span>
            </span>
            <span className="text-[12.5px] font-semibold text-[var(--accent)] group-hover:underline">상세 보기 →</span>
          </>
        )}
      </div>
    </div>
  );

  return archived ? <div>{body}</div> : <Link href={`/agents/${a.id}`}>{body}</Link>;
}
