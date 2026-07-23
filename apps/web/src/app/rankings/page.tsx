'use client';

import { useState } from 'react';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { AgentCard } from '@/components/agent-card';
import { AGENTS, ARCHIVED_AGENTS } from '@/lib/mock';
import { cn } from '@/lib/utils';

const LEAGUES = ['국내', '미국', '혼합'];
const DIVISIONS = ['안정', '중립', '공격'];
const SORTS = ['종합점수 (SIGNALS Score)', '소르티노 지수', '누적 수익률', '초과수익 (알파)', '최대낙폭 낮은순', '구독자 유지율'];

function Segment({ items, value, onChange }: { items: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-[var(--muted)] p-0.5">
      {items.map((it, i) => (
        <button
          key={it}
          onClick={() => onChange(i)}
          aria-selected={i === value}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
            i === value ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]',
          )}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

export default function RankingsPage() {
  const [league, setLeague] = useState(0);
  const [division, setDivision] = useState(1);
  const [sort, setSort] = useState(0);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">구독자 화면</div>
          <GradientHeading size="md" className="mt-1">
            랭킹
          </GradientHeading>
          <p className="mt-1 max-w-[60ch] text-[13.5px] text-[var(--muted-foreground)]">
            조작 불가능한 트랙레코드로 정렬합니다. 단일 지표가 아닌 6개 요소 종합점수(SIGNALS Score)가 기본값.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <Segment items={LEAGUES} value={league} onChange={setLeague} />
        <Segment items={DIVISIONS} value={division} onChange={setDivision} />
        <div className="flex-1" />
        <select
          value={sort}
          onChange={(e) => setSort(Number(e.target.value))}
          className="mono rounded-lg border bg-[var(--card)] px-3 py-1.5 text-[12.5px] font-semibold"
        >
          {SORTS.map((s, i) => (
            <option key={s} value={i}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2.5">
        {AGENTS.map((a) => (
          <AgentCard key={a.id} a={a} />
        ))}
      </div>

      <div className="mb-3 mt-8 flex items-center gap-3 text-[14px] font-semibold text-[var(--muted-foreground)]">
        종료된 에이전트
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[12.5px] font-normal">실패도 지우지 않고 영구 공개합니다 — 생존편향을 없애야 랭킹이 의미를 가집니다</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {ARCHIVED_AGENTS.map((a) => (
          <AgentCard key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}
