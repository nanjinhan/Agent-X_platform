import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { TextureCard } from '@/components/ui/texture-card';
import { TextureButton } from '@/components/ui/texture-button';
import { AgentBadge } from '@/components/agent-badge';
import { AgentIcon } from '@/components/agent-icon';
import { Kpi } from '@/components/kpi';
import { PerfChart } from '@/components/perf-chart';
import { SignalTable } from '@/components/signal-table';
import { getAgent, SIGNALS } from '@/lib/mock';
import { krw } from '@/lib/format';
import { HeroReveal, Reveal } from '@/components/motion';

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
      <Link
        href="/rankings"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 랭킹
      </Link>

      {/* 헤더 */}
      <HeroReveal>
      <TextureCard className="glow-primary">
      <div className="flex flex-wrap items-start gap-5 p-6 text-foreground">
        <AgentIcon icon={a.icon} size="lg" />
        <div className="min-w-[240px] flex-1">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {a.badges.map((b) => (
              <AgentBadge key={b} kind={b} />
            ))}
          </div>
          <GradientHeading asChild size="md" weight="black">
            <h1>{a.name}</h1>
          </GradientHeading>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.tagline} · 공급자 <b className="text-foreground">{a.providerName}</b>
          </p>
        </div>
        <div className="text-right">
          <div className="mono text-xl font-bold">
            월 {krw(a.priceKrw)}원
          </div>
          <TextureButton variant="accent" size="lg" className="mt-2 w-auto px-2 font-bold">
            <span className="px-4">7일 무료체험</span>
          </TextureButton>
          <p className="mt-1.5 text-[11px] text-muted-foreground">체험 중 해지 시 과금 없음</p>
        </div>
      </div>
      </TextureCard>
      </HeroReveal>

      {/* KPI */}
      <Reveal delay={0.08}>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi k="종합점수" value={m.signalsScore} precision={1} sub="중립·국내 3위" />
        <Kpi k="누적 수익률" value={m.cumulativeReturn * 100} precision={1} prefix="+" suffix="%" sub={`${m.operatingDays}일 운영`} cls="up" />
        <Kpi k="시장 대비" value={m.alpha * 100} precision={1} prefix="+" suffix="%p" sub="KOSPI200 초과" cls="up" />
        <Kpi k="소르티노" value={m.sortino} precision={2} sub="하방위험 조정" />
        <Kpi k="최대낙폭" value={Math.abs(m.maxDrawdown) * 100} precision={1} prefix="−" suffix="%" sub="회복 완료" cls="down" />
        <Kpi k="승률" value={m.winRate * 100} precision={0} suffix="%" sub={`Wilson 하한 ${Math.round(m.winRateWilsonLb * 100)}% · n=${m.closedPositions}`} />
      </div>
      </Reveal>

      {/* 성과 추이 */}
      <Reveal>
      <TextureCard className="mt-4">
      <section className="p-6 text-foreground">
        <h3 className="font-bold text-foreground">성과 추이</h3>
        <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
          가상 포트폴리오 100 기준 · 발행 익일 시가 진입 · 거래비용·슬리피지 반영
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-5 rounded bg-primary align-middle" />
            {a.name} <b className="mono up">+28.3%</b>
          </span>
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-5 rounded bg-muted-foreground align-middle" />
            KOSPI200 TR <b className="mono">+16.8%</b>
          </span>
        </div>
        <PerfChart />
      </section>
      </TextureCard>
      </Reveal>

      {/* 시그널 이력 */}
      <Reveal>
      <TextureCard className="mt-4">
      <section className="p-6 text-foreground">
        <h3 className="font-bold text-foreground">전체 시그널 이력</h3>
        <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
          성공·실패·미결제·무효까지 전부 공개합니다. 최근 30일 시그널의 근거 전문은 구독자에게만 열립니다.
        </p>
        <SignalTable rows={SIGNALS} />
      </section>
      </TextureCard>
      </Reveal>

      {/* 규율 지표 */}
      <Reveal>
      <TextureCard className="mt-4">
      <section className="p-6 text-foreground">
        <h3 className="font-bold text-foreground">규율 지표</h3>
        <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
          성과만이 아니라 규율을 봅니다 — 손절을 지키는지, 청산 없이 방치하는지.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['목표가 도달률', '47%'],
            ['손절 준수율', '96%'],
            ['청산 미이행률', '3%'],
            ['무효(VOID)율', '1.5%'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-secondary p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mono mt-1 text-lg font-bold">{v}</div>
            </div>
          ))}
        </div>
      </section>
      </TextureCard>
      </Reveal>
    </div>
  );
}
