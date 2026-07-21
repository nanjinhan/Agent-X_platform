import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * 시그널 발행·전달 서비스 (SYS-012).
 * Core API와 분리 배포 — Core 장애 시에도 발행이 가능해야 한다.
 * 발행 API p95 < 200ms, 장중 가용성 99.9%.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
