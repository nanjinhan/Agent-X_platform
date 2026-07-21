import { Module } from '@nestjs/common';

/**
 * 결제·환불·PG 연동 — 의존: subscription
 * 내부 구조: api(컨트롤러) / application(공개 서비스) / domain / infra(자기 테이블만) / events
 * 타 모듈은 application의 exports로만 접근한다 (SYS-003).
 */
@Module({})
export class BillingModule {}
