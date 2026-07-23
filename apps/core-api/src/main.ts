import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/http/problem-details.filter';

// 저장소 루트의 .env 로드. cwd(루트) 우선, 없으면 dist 기준 상대경로.
loadDotenv({ path: resolve(process.cwd(), '.env') });
loadDotenv({ path: resolve(__dirname, '../../../../.env') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1'); // SYS-024: URL 경로 버저닝
  app.use(cookieParser()); // Refresh Token 쿠키 파싱 (SYS-025)
  app.useGlobalFilters(new ProblemDetailsFilter()); // RFC 7807 (SYS-024)
  await app.listen(process.env.PORT_CORE_API ?? 3000);
}

void bootstrap();
