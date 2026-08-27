import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MockPgProvider } from '../infra/mock-pg.provider';
import { RefundRepository } from '../infra/refund.repository';
import { RefundReason, computeRefund } from '../domain/refund';

const DAY_MS = 24 * 3600 * 1000;

export interface RefundResult {
  refundId: string;
  refundKrw: number;
  signalsDeducted: number;
  status: 'COMPLETED' | 'PENDING';
  auto: boolean;
  note: string;
}

/**
 * 환불 처리 (REG-014~016, SUB-022/023).
 * 자동 승인 케이스(청약철회·미발행·정지·장애)는 즉시 PG 환불 실행,
 * 그 외(중도해지·규정위반)는 PENDING으로 수동 검토(3영업일) 대기.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger('Refund');

  constructor(
    private readonly repo: RefundRepository,
    private readonly pg: MockPgProvider,
  ) {}

  async requestRefund(
    userId: string,
    subscriptionId: string,
    reason: RefundReason,
    detail: string | null,
  ): Promise<RefundResult> {
    const payment = await this.repo.findLatestPaidPayment(subscriptionId, userId);
    if (!payment) throw new NotFoundException('환불 가능한 결제 내역이 없습니다');
    // 이중 환불 방지: 이 결제에 이미 진행/완료된 환불이 있으면 거절 (수동 PENDING 중복 차단)
    if (await this.repo.hasActiveRefund(payment.id)) {
      throw new BadRequestException('이미 환불이 진행 중이거나 완료된 결제입니다');
    }
    const sub = await this.repo.getSubInfo(subscriptionId, userId);
    if (!sub) throw new NotFoundException('구독을 찾을 수 없습니다');

    const now = new Date();
    const outcome = computeRefund(reason, {
      amountKrw: payment.amountKrw,
      elapsedDays: (now.getTime() - payment.periodStart.getTime()) / DAY_MS,
      totalDays: (payment.periodEnd.getTime() - payment.periodStart.getTime()) / DAY_MS,
      signalsReceived: sub.signalsReceived,
      monthlyAvgSignals: await this.repo.monthlyAvgSignals(sub.agentId),
    });

    if (!outcome.eligible) {
      throw new BadRequestException(outcome.note);
    }

    // SUB-023: 자동 승인 → 즉시 PG 환불 실행
    if (outcome.auto) {
      const pgRes = this.pg.refund(payment.pgTid, outcome.refundKrw);
      const refundId = await this.repo.createRefund({
        paymentId: payment.id, amountKrw: outcome.refundKrw, reasonCode: reason,
        reasonDetail: detail, signalsDeducted: outcome.signalsDeducted,
        status: 'COMPLETED', approvedBy: null, pgRefundTid: pgRes.refundTid,
      });
      if (outcome.refundKrw > 0) {
        await this.repo.markPaymentRefunded(payment.id, outcome.refundKrw >= payment.amountKrw);
      }
      this.logger.log(`환불 자동승인 sub=${subscriptionId} ${outcome.refundKrw}원 (${reason})`);
      return { refundId, refundKrw: outcome.refundKrw, signalsDeducted: outcome.signalsDeducted, status: 'COMPLETED', auto: true, note: outcome.note };
    }

    // 수동 검토 대기
    const refundId = await this.repo.createRefund({
      paymentId: payment.id, amountKrw: outcome.refundKrw, reasonCode: reason,
      reasonDetail: detail, signalsDeducted: outcome.signalsDeducted,
      status: 'PENDING', approvedBy: null, pgRefundTid: null,
    });
    this.logger.log(`환불 수동검토 대기 sub=${subscriptionId} ${outcome.refundKrw}원 (${reason})`);
    return { refundId, refundKrw: outcome.refundKrw, signalsDeducted: outcome.signalsDeducted, status: 'PENDING', auto: false, note: outcome.note };
  }

  /** 관리자 수동 승인 → PG 환불 실행 (SUB-023). */
  async approveRefund(adminId: string, refundId: string): Promise<{ refundKrw: number; status: 'COMPLETED' }> {
    const pending = await this.repo.findPending(refundId);
    if (!pending) throw new NotFoundException('대기 중인 환불을 찾을 수 없습니다');
    const pgRes = this.pg.refund(pending.pgTid, pending.amountKrw);
    await this.repo.completeRefund(refundId, adminId, pgRes.refundTid);
    if (pending.amountKrw > 0) {
      await this.repo.markPaymentRefunded(pending.paymentId, pending.amountKrw >= pending.paymentAmountKrw);
    }
    this.logger.log(`환불 승인 refund=${refundId} ${pending.amountKrw}원 by ${adminId}`);
    return { refundKrw: pending.amountKrw, status: 'COMPLETED' };
  }
}
