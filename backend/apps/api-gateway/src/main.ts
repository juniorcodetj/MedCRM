import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { gatewayRoutes } from './gateway-route.config';
import { createGatewayProxy } from './proxy.factory';
import { createRateLimitMiddleware } from './rate-limit.middleware';
import { requestCorrelationMiddleware } from './request-correlation.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:3002').split(',');

  app.use(requestCorrelationMiddleware);
  app.use(
    createRateLimitMiddleware({
      windowMs: Number(config.get<string>('GATEWAY_RATE_LIMIT_WINDOW_MS', '60000')),
      maxByPolicy: {
        auth: Number(config.get<string>('GATEWAY_RATE_LIMIT_AUTH_MAX', '20')),
        public: Number(config.get<string>('GATEWAY_RATE_LIMIT_PUBLIC_MAX', '300')),
        internal: Number(config.get<string>('GATEWAY_RATE_LIMIT_INTERNAL_MAX', '1000')),
        websocket: Number(config.get<string>('GATEWAY_RATE_LIMIT_WEBSOCKET_MAX', '120'))
      }
    })
  );
  app.use(helmet());
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Tenant-Code', 'X-Branch-Id', 'X-Request-Id']
  });

  for (const route of gatewayRoutes) {
    app.use(route.gatewayPrefix, createGatewayProxy(config, route));
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MedCRM API Gateway')
    .setDescription('Gateway for MedCRM public and internal APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json'
  });

  const port = config.get<number>('PORT', config.get<number>('API_GATEWAY_PORT', 3000));
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
