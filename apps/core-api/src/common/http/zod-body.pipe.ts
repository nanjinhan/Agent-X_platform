import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, output } from 'zod';

/**
 * zod 스키마 기반 요청 본문 검증 (SEC-012). 실패 시 400 → ProblemDetailsFilter가 포맷.
 * transform이 있는 스키마(예: birthDate string→Date)도 output 타입으로 안전하게 반환.
 * 사용: @Body(new ZodBody(RegisterSchema)) dto: RegisterDto
 */
export class ZodBody<S extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: S) {}

  transform(value: unknown): output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new BadRequestException(msg);
    }
    return result.data;
  }
}
