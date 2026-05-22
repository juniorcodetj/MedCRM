import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:3002').split(',');
  const authTarget = config.get<string>('AUTH_SERVICE_URL', 'http://localhost:3001');

  app.use(helmet());
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Tenant-Code', 'X-Branch-Id', 'X-Request-Id']
  });

  app.use(
    '/auth',
    createProxyMiddleware({
      target: authTarget,
      changeOrigin: true,
      xfwd: true,
      pathRewrite: (path) => `/auth${path}`
    })
  );

  const proxiedPrefixes = ['/patients', '/appointments', '/availability', '/slots', '/services', '/doctors', '/reception'];
  for (const prefix of proxiedPrefixes) {
    app.use(
      prefix,
      createProxyMiddleware({
        target: authTarget,
        changeOrigin: true,
        xfwd: true,
        pathRewrite: (path) => `${prefix}${path}`
      })
    );
  }

  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: authTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: (path) => `/socket.io${path}`
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MedCRM API Gateway')
    .setDescription('Gateway for MedCRM public and internal APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT', config.get<number>('API_GATEWAY_PORT', 3000));
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
