import { Eye } from 'lucide-react';
import { TRANSPARENCY } from '@/lib/mock';
import { cn } from '@/lib/utils';
import { HeroReveal, Reveal } from '@/components/motion';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { TextureCard } from '@/components/ui/texture-card';

const DIST_COLOR: Record<string, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  mark: 'var(--primary)',
  neutral: 'var(--muted-foreground)',
};

export default function TransparencyPage() {
  const t = TRANSPARENCY;
  return (
    <div>
      <HeroReveal>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <Eye className="size-4" /> 공개 페이지 · 누구나 열람
        </div>
        <GradientHeading asChild size="lg" weight="black">
          <h1>투명성 리포트</h1>
        </GradientHeading>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          잘된 것만 보여주는 플랫폼은 결국 신뢰를 잃습니다. 우리는 전부 공개합니다.
        </p>
      </div>
      </HeroReveal>

      <Reveal delay={0.08}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TextureCard>
          <div className="p-5 text-foreground">
            <div className="mono text-3xl font-extrabold tracking-tight">{t.total}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">전체 에이전트</div>
            <div className="mt-3 flex h-1.5 gap-1 overflow-hidden rounded-full">
              <span style={{ flex: t.selling, background: 'var(--good)' }} />
              <span style={{ flex: t.verifying, background: 'var(--primary)' }} />
              <span style={{ flex: t.paused, background: 'var(--muted-foreground)' }} />
              <span style={{ flex: t.archived, background: 'var(--up)' }} />
            </div>
          </div>
        </TextureCard>
        {[
          [t.selling, '판매 중'],
          [t.archived, '종료됨'],
          [`${t.avgLifespanMonths}개월`, '종료 에이전트 평균 수명'],
        ].map(([v, k]) => (
          <TextureCard key={String(k)}>
            <div className="p-5 text-foreground">
              <div className="mono text-3xl font-extrabold tracking-tight">{v}</div>
              <div className="mt-1 text-[13px] text-muted-foreground">{k}</div>
            </div>
          </TextureCard>
        ))}
      </div>
      </Reveal>

      <Reveal>
      <TextureCard className="mt-4">
      <section className="p-6 text-foreground">
        <h3 className="font-bold text-foreground">
          전체 에이전트 수익률 분포 <span className="text-[13px] font-normal text-muted-foreground">(연환산 · 종료 포함)</span>
        </h3>
        <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">살아남은 것만이 아니라 죽은 것까지 포함한 분포입니다.</p>
        <div>
          {t.distribution.map((d) => (
            <div key={d.label} className="grid grid-cols-[140px_1fr_90px] items-center gap-4 border-b py-3 last:border-b-0">
              <div className="text-[13px] text-muted-foreground">{d.label}</div>
              <div className="h-5 overflow-hidden rounded-md bg-secondary">
                <span
                  className="block h-full rounded-md"
                  style={{ width: `${d.width}%`, background: DIST_COLOR[d.kind], opacity: d.kind === 'mark' ? 0.9 : 0.65 }}
                />
              </div>
              <div className={cn('mono text-right text-sm font-bold', d.kind === 'up' && 'up', d.kind === 'down' && 'down')}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-primary/5 p-5 text-sm leading-relaxed">
          전체 에이전트 중 벤치마크(KOSPI200)를 이긴 비율은 <b className="mono text-primary">{Math.round(t.beatBenchmarkRate * 100)}%</b>입니다.
          우리는 이 숫자를 숨기지 않습니다 — &quot;61%는 시장을 못 이겼다&quot;고 정직하게 말하는 것이 장기적으로 신뢰를 만든다고 믿습니다.
        </div>
      </section>
      </TextureCard>
      </Reveal>

      <Reveal>
      <TextureCard className="mt-4">
      <section className="p-6 text-foreground">
        <h3 className="mb-3 font-bold text-foreground">종료 사유 분포</h3>
        {t.reasons.map((r) => (
          <div key={r.label} className="grid grid-cols-[140px_1fr_90px] items-center gap-4 border-b py-3 last:border-b-0">
            <div className="text-[13px] text-muted-foreground">{r.label}</div>
            <div className="h-5 overflow-hidden rounded-md bg-secondary">
              <span className="block h-full rounded-md bg-muted-foreground" style={{ width: `${r.pct * 1.8}%`, opacity: 0.55 }} />
            </div>
            <div className="mono text-right text-sm font-bold">{r.pct}%</div>
          </div>
        ))}
      </section>
      </TextureCard>
      </Reveal>
    </div>
  );
}
