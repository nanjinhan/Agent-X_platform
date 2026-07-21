import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1'); // SYS-024: URL 경로 버저닝
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
