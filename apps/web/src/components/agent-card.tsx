import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSummary } from '@/lib/types';
import { pct, pctPoint, dir, krw } from '@/lib/format';
import { TextureCard } from '@/components/ui/texture-card';
import { AgentBadge } from './agent-badge';
import { AgentIcon } from './agent-icon';

/**
 * 랭킹 카드 — cult-ui TextureCard(질감 있는 4겹 보더)로 프리미엄 깊이.
 * 수익률이 주인공, 나머지는 보조.
 */
export function AgentCard({ a }: { a: AgentSummary }) {
  const m = a.metrics;
  const archived = a.status === 'ARCHIVED';

  const body = (
    <TextureCard
      className={cn(
        'group transition-all duration-300',
        !archived && 'hover:-translate-y-0.5 hover:shadow-[0_0_30px_var(--glow)]',
        archived && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-4 p-5 text-foreground">
      {/* 순위 + 아바타 */}
      <div className="flex items-center gap-3.5">
        <span className={cn('mono w-6 text-center text-lg font-bold', (a.rank ?? 99) <= 3 ? 'text-primary' : 'text-muted-foreground')}>
          {a.rank ?? '—'}
        </span>
        <AgentIcon icon={a.icon} />
      </div>

      {/* 이름·태그라인·배지 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[15px] font-bold">{a.name}</span>
          {a.badges.slice(0, 2).map((b) => (
            <AgentBadge key={b} kind={b} />
          ))}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{a.tagline}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {a.providerName} · {m.operatingDays}일 · 구독자 {krw(m.subscribers)}명
        </p>
      </div>

      {/* 핵심 숫자: 수익률 크게 + 보조 2개 */}
      <div className="hidden shrink-0 items-center gap-7 sm:flex">
        <div className="text-right">
          <div className={cn('mono text-[22px] font-bold leading-tight', dir(m.cumulativeReturn))}>
            {pct(m.cumulativeReturn)}
          </div>
          <div className="text-[11px] text-muted-foreground">누적 수익률</div>
        </div>
        <div className="hidden text-right md:block">
          <div className={cn('mono text-[15px] font-semibold', dir(m.alpha))}>{pctPoint(m.alpha)}</div>
          <div className="text-[11px] text-muted-foreground">시장 대비</div>
        </div>
        <div className="hidden text-right md:block">
          <div className="mono text-[15px] font-semibold">{Math.round(m.winRate * 100)}%</div>
          <div className="text-[11px] text-muted-foreground">승률 (n={m.closedPositions})</div>
        </div>
      </div>

      {/* 가격 */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          {archived ? (
            <span className="text-sm font-semibold text-muted-foreground">종료됨</span>
          ) : (
            <>
              <div className="mono text-[15px] font-bold">{krw(a.priceKrw)}원</div>
              <div className="text-[11px] text-muted-foreground">월 구독</div>
            </>
          )}
        </div>
        {!archived && <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
      </div>
      </div>
    </TextureCard>
  );

  return archived ? <div>{body}</div> : <Link href={`/agents/${a.id}`}>{body}</Link>;
}
