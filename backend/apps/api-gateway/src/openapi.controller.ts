import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { gatewayRoutes } from './gateway-route.config';

@ApiTags('gateway')
@Controller('gateway')
export class OpenApiController {
  @Get('routes')
  routes() {
    return {
      version: 'v1',
      routes: gatewayRoutes.map((route) => ({
        kind: route.kind,
        gatewayPrefix: route.gatewayPrefix,
        upstreamPrefix: route.upstreamPrefix,
        rateLimitPolicy: route.rateLimitPolicy,
        requiresAuth: route.requiresAuth,
        description: route.description
      }))
    };
  }

  @Get('openapi/upstreams')
  upstreams() {
    return {
      gateway: '/docs-json',
      upstreams: [
        {
          service: 'auth-service',
          openApiJson: '/internal/v1/auth-service/docs-json',
          swaggerUi: '/internal/v1/auth-service/docs'
        }
      ]
    };
  }
}
