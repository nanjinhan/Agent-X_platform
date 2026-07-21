/**
 * SRS 17.1 [SYS-024] — API 에러 코드 체계.
 * 응답 본문은 RFC 7807 Problem Details 형식을 따른다.
 */

export enum ApiErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  AGE_RESTRICTED = 'AGE_RESTRICTED',
  AGENT_NOT_ACTIVE = 'AGENT_NOT_ACTIVE',
  TRIAL_ALREADY_USED = 'TRIAL_ALREADY_USED',
  PUBLISH_WINDOW_CLOSED = 'PUBLISH_WINDOW_CLOSED',
  INSTRUMENT_NOT_TRADABLE = 'INSTRUMENT_NOT_TRADABLE',
  PROHIBITED_TERM = 'PROHIBITED_TERM',
  DAILY_LIMIT_EXCEEDED = 'DAILY_LIMIT_EXCEEDED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  [ApiErrorCode.UNAUTHENTICATED]: 401,
  [ApiErrorCode.SUBSCRIPTION_REQUIRED]: 403,
  [ApiErrorCode.VERIFICATION_REQUIRED]: 403,
  [ApiErrorCode.AGE_RESTRICTED]: 403,
  [ApiErrorCode.AGENT_NOT_ACTIVE]: 409,
  [ApiErrorCode.TRIAL_ALREADY_USED]: 409,
  [ApiErrorCode.PUBLISH_WINDOW_CLOSED]: 422,
  [ApiErrorCode.INSTRUMENT_NOT_TRADABLE]: 422,
  [ApiErrorCode.PROHIBITED_TERM]: 422,
  [ApiErrorCode.DAILY_LIMIT_EXCEEDED]: 429,
  [ApiErrorCode.RATE_LIMITED]: 429,
};

/** RFC 7807 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ApiErrorCode;
}

/**
 * [SYS-026] 성과 데이터를 포함하는 모든 응답에 disclaimer가 강제된다.
 * 성과 응답 DTO는 반드시 이 인터페이스를 확장할 것.
 */
export interface WithDisclaimer {
  disclaimer: string;
}
