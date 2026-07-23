import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError } from './api-error';

/**
 * 모든 예외를 RFC 7807 Problem Details로 변환한다 (SYS-024).
 * ApiError는 정의된 code를, 일반 HttpException은 상태 기반 code를 싣는다.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let title = '서버 오류가 발생했습니다';
    let detail: string | undefined;

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      code = exception.code;
      title = exception.message;
      detail = exception.detail;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      title = exception.message;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as { message: unknown }).message;
        detail = Array.isArray(msg) ? msg.join('; ') : String(msg);
      }
      code = status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`;
    } else {
      this.logger.error(exception);
    }

    res.status(status).json({
      type: `https://api.signals.kr/errors/${code.toLowerCase()}`,
      title,
      status,
      detail,
      instance: req.originalUrl,
      code,
    });
  }
}
