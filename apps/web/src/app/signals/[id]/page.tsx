import Link from 'next/link';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { VerifyBox } from '@/components/verify-box';
import { HeroReveal } from '@/components/motion';
import { TextureCard } from '@/components/ui/texture-card';

/** 시그널 상세 (목업). 실제로는 /v1/signals/{id} 응답을 렌더. */
export default function SignalDetail() {
  return (
    <div>
      <Link
        href="/agents/jjanggu-value"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 짱구가치
      </Link>

      <div className="mx-auto max-w-[560px]">
        <HeroReveal>
        <TextureCard className="glow-primary overflow-hidden">
        <div className="overflow-hidden text-foreground">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <b>짱구가치</b>
            <div className="mono text-right text-xs text-muted-foreground">
              2026.07.21 · 14:32:11 KST
            </div>
          </div>

          <div className="flex items-center gap-3 px-6 pt-5">
            <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--up)_12%,transparent)] px-3 py-1 text-sm font-bold text-[var(--up)]">
              <TrendingUp className="size-4" /> 진입
            </span>
            <span className="text-lg font-bold">
              삼성전자 <span className="mono text-sm font-medium text-muted-foreground">005930 · 반도체</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-x-8 px-6 pb-5 pt-3 sm:grid-cols-2">
            {[
              ['참고가', '78,500원', ''],
              ['제안 비중', '10%', ''],
              ['목표가', '89,000원 (+13.4%)', 'up'],
              ['손절가', '73,000원 (−7.0%)', 'down'],
              ['유효기간', '~2026.07.24', ''],
              ['최대 보유', '60일', ''],
            ].map(([k, v, cls]) => (
              <div key={k} className="flex justify-between border-b py-2 text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span className={`mono font-semibold ${cls}`}>{v}</span>
              </div>
            ))}
          </div>

          <div className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">진입 근거</h4>
            HBM 수요 증가에 따른 하반기 실적 개선 기대. 2분기 실적에서 메모리 가격 반등이 확인되었고, 저PBR(0.9배) 구간에서 배당 매력이 하방을 지지. 목표가는 12M Fwd P/B 1.1배, 손절은 직전 지지선 이탈 기준.
          </div>

          <VerifyBox />

          <div className="border-t bg-secondary/60 px-6 py-4 text-[11.5px] leading-relaxed text-muted-foreground">
            본 정보는 투자 참고자료이며 투자 권유가 아닙니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 원금 손실이 발생할 수 있습니다.
            <div className="mt-1.5 text-[11px]">발행 (주)시그널스 · 유사투자자문업 신고 제2026-000000호 · 콘텐츠 제공 [짱구퀀트]</div>
          </div>
        </div>
        </TextureCard>
        </HeroReveal>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          시그널은 발행 즉시 해시체인에 기록되어 <b className="text-foreground">수정·삭제가 불가능</b>합니다.
        </p>
      </div>
    </div>
  );
}
