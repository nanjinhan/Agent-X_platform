/**
 * 환불 계산 (REG-014~016, SUB-022/023) — 순수 로직.
 *
 * 케이스별 환불액과 자동/수동 승인 여부를 결정한다. 손실보전 환불은 금지(REG-002)이며,
 * 여기서 다루는 건 전부 "서비스 품질/상거래" 환불이다(투자손실 무관).
 */

export enum RefundReason {
  WITHDRAWAL = 'WITHDRAWAL', // 청약철회 (REG-014): 7일 이내 & 시그널 0건 → 전액
  CANCELLATION = 'CANCELLATION', // 중도 해지 (일반): REG-016 공식
  NO_SIGNALS = 'NO_SIGNALS', // 에이전트 30일+ 미발행 → 해당 기간 전액
  AGENT_SUSPENDED = 'AGENT_SUSPENDED', // 플랫폼 귀책 정지 → 잔여 기간 전액
  PROVIDER_VIOLATION = 'PROVIDER_VIOLATION', // 공급자 귀책 삭제 → 잔여 기간 전액
  SYSTEM_OUTAGE = 'SYSTEM_OUTAGE', // 24h+ 장애 → 잔여(해당) 기간 전액
}

/** SUB-023: 자동 승인 케이스. 그 외는 수동 검토(3영업일). */
export const AUTO_APPROVE = new Set<RefundReason>([
  RefundReason.WITHDRAWAL,
  RefundReason.NO_SIGNALS,
  RefundReason.AGENT_SUSPENDED,
  RefundReason.SYSTEM_OUTAGE,
]);

export interface RefundInput {
  amountKrw: number; // 결제금액
  elapsedDays: number; // 경과일 (period_start ~ now)
  totalDays: number; // 총일수 (period_start ~ period_end)
  signalsReceived: number; // 이 구독으로 수신한 시그널 수
  monthlyAvgSignals: number; // 에이전트 월평균 시그널 수 (>=1)
}

export interface RefundOutcome {
  refundKrw: number;
  signalsDeducted: number;
  auto: boolean;
  eligible: boolean;
  note: string;
}

/** REG-016: 수신 시그널 가치비율 = min(0.5, 수신/월평균 × 0.5). 최대 차감 50%. */
export function signalValueRatio(signalsReceived: number, monthlyAvgSignals: number): number {
  const avg = Math.max(1, monthlyAvgSignals);
  return Math.min(0.5, (signalsReceived / avg) * 0.5);
}

/** 잔여 기간 일할 비율 (0~1). */
function remainingRatio(elapsedDays: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  return Math.max(0, 1 - elapsedDays / totalDays);
}

export function computeRefund(reason: RefundReason, i: RefundInput): RefundOutcome {
  const auto = AUTO_APPROVE.has(reason);
  const won = (r: number) => Math.round(i.amountKrw * r);

  switch (reason) {
    case RefundReason.WITHDRAWAL:
      // 청약철회: 7일 이내 & 시그널 0건이어야 전액 (아니면 자격 없음 → 중도해지로 처리 유도)
      if (i.elapsedDays > 7 || i.signalsReceived > 0) {
        return { refundKrw: 0, signalsDeducted: 0, auto, eligible: false, note: '청약철회 요건(7일·미수신) 미충족' };
      }
      return { refundKrw: i.amountKrw, signalsDeducted: 0, auto, eligible: true, note: '청약철회 전액' };

    case RefundReason.CANCELLATION: {
      // REG-016: 환불액 = 결제금액 × max(0, 잔여비율 - 시그널가치비율)
      const ratio = Math.max(0, remainingRatio(i.elapsedDays, i.totalDays) - signalValueRatio(i.signalsReceived, i.monthlyAvgSignals));
      return { refundKrw: won(ratio), signalsDeducted: i.signalsReceived, auto, eligible: true, note: '중도해지 일할(REG-016)' };
    }

    case RefundReason.NO_SIGNALS:
    case RefundReason.AGENT_SUSPENDED:
    case RefundReason.PROVIDER_VIOLATION:
    case RefundReason.SYSTEM_OUTAGE: {
      // 잔여/해당 기간 전액 (플랫폼·공급자 귀책 or 미발행 → 시그널 가치 차감 없음)
      const r = remainingRatio(i.elapsedDays, i.totalDays);
      return { refundKrw: won(r), signalsDeducted: 0, auto, eligible: true, note: '잔여 기간 전액' };
    }
  }
}
