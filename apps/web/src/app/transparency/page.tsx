import { GradientHeading } from '@/components/ui/gradient-heading';
import { TRANSPARENCY } from '@/lib/mock';
import { cn } from '@/lib/utils';

const DIST_COLOR: Record<string, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  mark: 'var(--accent)',
  neutral: 'var(--muted-foreground)',
};

export default function TransparencyPage() {
  const t = TRANSPARENCY;
  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">공개 페이지 · 누구나 열람</div>
        <GradientHeading size="md" className="mt-1">
          투명성 리포트
        </GradientHeading>
        <p className="mt-1 text-[13.5px] text-[var(--muted-foreground)]">
          2026년 7월 기준 · 상위 몇 개만 보여주는 플랫폼은 반드시 신뢰를 잃습니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-[var(--card)] p-4">
          <div className="mono text-[28px] font-bold tracking-tight">{t.total}</div>
          <div className="mt-0.5 text-[12.5px] text-[var(--muted-foreground)]">전체 에이전트</div>
          <div className="mt-2.5 flex h-1.5 gap-1 overflow-hidden rounded">
            <span style={{ flex: t.selling, background: 'var(--good)' }} />
            <span style={{ flex: t.verifying, background: 'var(--accent)' }} />
            <span style={{ flex: t.paused, background: 'var(--muted-foreground)' }} />
            <span style={{ flex: t.archived, background: 'var(--up)' }} />
          </div>
        </div>
        {[
          [t.selling, '판매 중'],
          [t.archived, '종료됨'],
          [`${t.avgLifespanMonths}개월`, '종료 에이전트 평균 수명'],
        ].map(([v, k]) => (
          <div key={k} className="rounded-xl border bg-[var(--card)] p-4">
            <div className="mono text-[28px] font-bold tracking-tight">{v}</div>
            <div className="mt-0.5 text-[12.5px] text-[var(--muted-foreground)]">{k}</div>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <h3 className="text-[15px] font-semibold">
          전체 에이전트 수익률 분포 <span className="text-[12.5px] font-normal text-[var(--muted-foreground)]">(연환산 · 종료 포함)</span>
        </h3>
        <p className="mb-2 text-[12.5px] text-[var(--muted-foreground)]">살아남은 것만이 아니라 죽은 것까지 포함한 분포입니다.</p>
        <div className="mt-1.5">
          {t.distribution.map((d) => (
            <div key={d.label} className="grid grid-cols-[130px_1fr_88px] items-center gap-3.5 border-b py-2.5">
              <div className="text-[13px] text-[var(--muted-foreground)]">{d.label}</div>
              <div className="h-[22px] overflow-hidden rounded-md bg-[var(--muted)]">
                <span
                  className="block h-full rounded-md"
                  style={{ width: `${d.width}%`, background: DIST_COLOR[d.kind], opacity: d.kind === 'mark' ? 0.9 : 0.7 }}
                />
              </div>
              <div className={cn('mono text-right text-[14px] font-semibold', d.kind === 'up' && 'up', d.kind === 'down' && 'down')}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] p-4 text-[13.5px] leading-relaxed text-[var(--accent)]">
          전체 에이전트 중 벤치마크(KOSPI200)를 이긴 비율은 <b className="mono">{Math.round(t.beatBenchmarkRate * 100)}%</b>입니다. 우리는 이 숫자를 숨기지 않습니다 — &quot;우리 플랫폼 에이전트의 61%는 시장을 못 이겼다&quot;고 정직하게 말하는 것이 장기적으로 신뢰를 만듭니다.
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <h3 className="mb-2 text-[15px] font-semibold">종료 사유 분포</h3>
        {t.reasons.map((r) => (
          <div key={r.label} className="grid grid-cols-[130px_1fr_88px] items-center gap-3.5 border-b py-2.5">
            <div className="text-[13px] text-[var(--muted-foreground)]">{r.label}</div>
            <div className="h-[22px] overflow-hidden rounded-md bg-[var(--muted)]">
              <span className="block h-full rounded-md bg-[var(--muted-foreground)]" style={{ width: `${r.pct * 1.8}%`, opacity: 0.6 }} />
            </div>
            <div className="mono text-right text-[14px] font-semibold">{r.pct}%</div>
          </div>
        ))}
      </section>
    </div>
  );
}
