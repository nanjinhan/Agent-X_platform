import { Module } from '@nestjs/common';

/**
 * 에이전트·룰·상태머신(AGT-003) — 의존: provider
 * 내부 구조: api(컨트롤러) / application(공개 서비스) / domain / infra(자기 테이블만) / events
 * 타 모듈은 application의 exports로만 접근한다 (SYS-003).
 */
@Module({})
export class AgentModule {}
