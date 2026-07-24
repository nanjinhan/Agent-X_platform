/**
 * 시그널 정규 직렬화 (ADR-0002 결정 1·2).
 *
 * ⚠️ 이 파일의 규칙은 **첫 시그널 발행 시점에 영구 고정**된다.
 *    한 글자라도 바꾸면 과거 시그널의 해시를 재현할 수 없다 (TR-4).
 *
 * SRS 템플릿(SIG-005 / SYS-027):
 *   agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|rationale|published_at|prev_hash
 *
 * SRS는 구분자 `|`만 정하고 이스케이프를 정하지 않았다. rationale은 자유 텍스트라 `|`를 포함할 수 있어
 * 필드 경계가 모호해지고 서로 다른 시그널이 같은 입력을 만들 수 있다 → 각 필드를 이스케이프 후 join한다.
 */

/**
 * SRS 원문 대비 확장: suggested_weight·max_holding_days·valid_until 추가 (ADR-0002 결정 1).
 * 이 값들은 성과 계산을 좌우하므로 봉인 밖에 두면 체인이 VALID인 채로 수익률 조작이 가능하다.
 */
export const HASH_INPUT_TEMPLATE =
  'agent_id|sequence_no|market|ticker|action|target_price|stop_loss_price|suggested_weight|max_holding_days|valid_until|rationale|published_at|prev_hash';

/** 백슬래시를 먼저 이스케이프해야 역변환이 유일해진다. */
export function escapeField(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/** NUMERIC(18,4)와 동일하게 소수점 4자리 고정. null/undefined는 빈 문자열. */
export function formatPrice(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toFixed(4);
}

/** ISO 8601 UTC, 밀리초 3자리. DB 저장값과 반드시 동일해야 한다. */
export function formatTimestamp(d: Date): string {
  return new Date(Math.floor(d.getTime())).toISOString(); // toISOString은 항상 .mmmZ
}

/** 정수 필드. NULL은 빈 문자열. */
export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

/** 선택적 시각 필드. NULL은 빈 문자열. */
export function formatOptionalTimestamp(d: Date | null | undefined): string {
  return d ? formatTimestamp(d) : '';
}

/** 해시·서명 대상이 되는 필드 묶음. */
export interface CanonicalInput {
  agentId: string;
  sequenceNo: number;
  market: string;
  ticker: string;
  action: string;
  targetPrice: string | number | null;
  stopLossPrice: string | number | null;
  suggestedWeight: string | number | null;
  maxHoldingDays: number | null;
  validUntil: Date | null;
  rationale: string;
  publishedAt: Date;
  prevHash: string;
}

/** 정규 직렬화 문자열 생성. 이 문자열이 해시·서명의 유일한 입력이다. */
export function canonicalize(i: CanonicalInput): string {
  return [
    i.agentId,
    String(i.sequenceNo),
    i.market,
    i.ticker,
    i.action,
    formatPrice(i.targetPrice),
    formatPrice(i.stopLossPrice),
    formatPrice(i.suggestedWeight),
    formatInt(i.maxHoldingDays),
    formatOptionalTimestamp(i.validUntil),
    i.rationale,
    formatTimestamp(i.publishedAt),
    i.prevHash,
  ]
    .map(escapeField)
    .join('|');
}
