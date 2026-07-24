'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';
import { AgentCard } from '@/components/agent-card';
import { HeroReveal, Reveal } from '@/components/motion';
import { AGENTS, ARCHIVED_AGENTS } from '@/lib/mock';
import { cn } from '@/lib/utils';

const LEAGUES = ['국내', '미국', '혼합'];
const DIVISIONS = ['안정', '중립', '공격'];
const SORTS = ['종합점수', '소르티노', '누적 수익률', '시장 대비 초과수익', '최대낙폭 낮은순', '유지율'];

function Segment({ items, value, onChange }: { items: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="inline-flex rounded-full bg-secondary/70 p-1">
      {items.map((it, i) => (
        <button
          key={it}
          onClick={() => onChange(i)}
          aria-selected={i === value}
          className={cn(
            'rounded-full px-4 py-1.5 text-[13px] font-semibold transition-all',
            i === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
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
      <div className="mb-8">
        <HeroReveal>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
            누가 진짜인지, <span className="text-primary">숫자로</span> 확인하세요
          </h1>
        </HeroReveal>
        <HeroReveal delay={0.1}>
          <p className="mt-2 text-[15px] text-muted-foreground">
            모든 성과는 시스템이 계산합니다. 공급자는 숫자를 만질 수 없습니다.
          </p>
        </HeroReveal>
      </div>

      <HeroReveal delay={0.18}>
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <Segment items={LEAGUES} value={league} onChange={setLeague} />
          <Segment items={DIVISIONS} value={division} onChange={setDivision} />
          <div className="flex-1" />
          <select
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
            className="rounded-full border bg-card px-4 py-2 text-[13px] font-semibold"
          >
            {SORTS.map((s, i) => (
              <option key={s} value={i}>
                {s} 순
              </option>
            ))}
          </select>
        </div>
      </HeroReveal>

      <div className="flex flex-col gap-3.5">
        {AGENTS.map((a, i) => (
          <Reveal key={a.id} delay={i * 0.08}>
            <AgentCard a={a} />
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="mt-12 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Archive className="size-4" />
          종료된 에이전트
          <span className="h-px flex-1 bg-border" />
        </div>
        <p className="mb-3.5 mt-1 text-[13px] text-muted-foreground">
          실패한 에이전트도 지우지 않습니다. 전부 남아 있어야 위의 랭킹을 믿을 수 있으니까요.
        </p>
      </Reveal>
      <div className="flex flex-col gap-3.5">
        {ARCHIVED_AGENTS.map((a, i) => (
          <Reveal key={a.id} delay={i * 0.08}>
            <AgentCard a={a} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
