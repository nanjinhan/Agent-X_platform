import { HttpException } from '@nestjs/common';
import { ApiErrorCode, API_ERROR_HTTP_STATUS } from '@signals/contracts';

/**
 * 도메인 에러 → RFC 7807 (SYS-024). ApiErrorCode가 HTTP 상태로 매핑된다.
 * throw new ApiError(ApiErrorCode.AGE_RESTRICTED, '만 19세 미만은 가입할 수 없습니다')
 */
export class ApiError extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly detail?: string,
  ) {
    super(detail ?? code, API_ERROR_HTTP_STATUS[code]);
  }
}
