import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TextureCard } from '@/components/ui/texture-card';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { Badge } from '@/components/ui/badge';
import { Kpi } from '@/components/kpi';
import { PerfChart } from '@/components/perf-chart';
import { SignalTable } from '@/components/signal-table';
import { getAgent, SIGNALS } from '@/lib/mock';
import { krw } from '@/lib/format';

export function generateStaticParams() {
  return [{ id: 'jjanggu-value' }];
}

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAgent(id);
  if (!a) notFound();
  const m = a.metrics;

  return (
    <div>
      <Link href="/rankings" className="mb-3.5 inline-block text-[13px] font-semibold text-[var(--accent)]">
        ← 랭킹
      </Link>

      {/* hero — cult-ui TextureCard */}
      <TextureCard>
        <div className="flex flex-wrap items-start gap-5 p-6">
          <span
            className="grid size-16 place-items-center rounded-2xl text-[26px] font-bold text-white"
            style={{ background: `linear-gradient(145deg, ${a.gradient[0]}, ${a.gradient[1]})` }}
          >
            {a.initial}
          </span>
          <div className="min-w-[240px] flex-1">
            <div className="mb-1.5 flex flex-wrap gap-1">
              {a.badges.map((b) => (
                <Badge key={b} kind={b} />
              ))}
            </div>
            <GradientHeading size="sm">{a.name}</GradientHeading>
            <p className="mt-1 text-[13.5px] text-[var(--muted-foreground)]">
              {a.tagline} &nbsp;·&nbsp; 공급자 <b className="text-[var(--foreground)]">{a.providerName}</b>
            </p>
          </div>
          <div className="text-right">
            <div className="mono text-[20px] font-bold">월 {krw(a.priceKrw)}원</div>
            <button className="mt-2 rounded-[10px] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-[var(--accent-foreground)]">
              7일 무료체험
            </button>
          </div>
        </div>
      </TextureCard>

      {/* KPI grid — AnimatedNumber */}
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border sm:grid-cols-3 lg:grid-cols-6 [&>*]:border-b [&>*]:border-r">
        <Kpi k="종합점수" value={m.signalsScore} precision={1} sub="중립·국내 3위" />
        <Kpi k="누적 수익률" value={m.cumulativeReturn * 100} precision={1} prefix="+" suffix="%" sub={`${m.operatingDays}일 운영`} cls="up" />
        <Kpi k="알파 (vs KOSPI200)" value={m.alpha * 100} precision={1} prefix="+" suffix="%p" sub="초과수익" cls="up" />
        <Kpi k="소르티노" value={m.sortino} precision={2} sub="하방위험 조정" />
        <Kpi k="최대낙폭" value={Math.abs(m.maxDrawdown) * 100} precision={1} prefix="−" suffix="%" sub="회복 완료" cls="down" />
        <Kpi k="승률 (Wilson)" value={m.winRate * 100} precision={0} suffix="%" sub={`하한 ${Math.round(m.winRateWilsonLb * 100)}% · n=${m.closedPositions}`} />
      </div>

      {/* 성과 추이 */}
      <section className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <h3 className="text-[15px] font-semibold">성과 추이</h3>
        <p className="mb-3.5 text-[12.5px] text-[var(--muted-foreground)]">
          가상 포트폴리오 100 기준 · 발행 익일 시가 진입 · 거래비용·슬리피지 반영
        </p>
        <div className="mb-2.5 flex flex-wrap items-center gap-4 text-[12px] text-[var(--muted-foreground)]">
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-5 rounded bg-[var(--accent)] align-middle" />
            {a.name} <b className="mono up">+28.3%</b>
          </span>
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-5 rounded bg-[var(--muted-foreground)] align-middle" />
            KOSPI200 TR <b className="mono">+16.8%</b>
          </span>
          <span className="text-[var(--muted-foreground)]">└ 음영 = 검증기간 · 아래 = 낙폭</span>
        </div>
        <PerfChart />
      </section>

      {/* 시그널 이력 */}
      <section className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <h3 className="text-[15px] font-semibold">전체 시그널 이력</h3>
        <p className="mb-3.5 text-[12.5px] text-[var(--muted-foreground)]">
          성공·실패·미결제·무효까지 전부 공개합니다. 최근 30일 시그널의 <b>근거 전문</b>은 구독자에게만 열립니다.
        </p>
        <SignalTable rows={SIGNALS} />
      </section>

      {/* 규율 지표 */}
      <section className="mt-4 rounded-2xl border bg-[var(--card)] p-5">
        <h3 className="text-[15px] font-semibold">규율 지표</h3>
        <p className="mb-3.5 text-[12.5px] text-[var(--muted-foreground)]">
          &quot;성과&quot;만이 아니라 &quot;규율&quot;을 봅니다 — 손절을 지키는지, 청산 없이 방치하는지.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['목표가 도달률', '47%'],
            ['손절 준수율', '96%'],
            ['청산 미이행률', '3%'],
            ['VOID율', '1.5%'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[10px] bg-[var(--muted)] p-3.5">
              <div className="text-[11.5px] text-[var(--muted-foreground)]">{k}</div>
              <div className="mono mt-0.5 text-[18px] font-bold">{v}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
