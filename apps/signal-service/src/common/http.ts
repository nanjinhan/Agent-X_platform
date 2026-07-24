import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PipeTransform,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorCode, API_ERROR_HTTP_STATUS } from '@signals/contracts';
import type { ZodTypeAny, output } from 'zod';

/** SYS-024 RFC 7807. core-api와 동일 규약 (에러 코드는 @signals/contracts로 공유). */
export class ApiError extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly detail?: string,
  ) {
    super(detail ?? code, API_ERROR_HTTP_STATUS[code]);
  }
}

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
      title = exception.message;
      const body = exception.getResponse();
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

export class ZodBody<S extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: S) {}
  transform(value: unknown): output<S> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return r.data;
  }
}
