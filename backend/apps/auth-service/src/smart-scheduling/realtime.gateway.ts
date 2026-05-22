import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtAccessPayload } from '@core/security/jwt-payload';

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
      });
      client.data.user = payload;
      client.join(`tenant:${payload.tenant_id}`);
      for (const branchId of payload.branch_ids) {
        client.join(`tenant:${payload.tenant_id}:branch:${branchId}:dashboard`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('dashboard.subscribe')
  subscribeDashboard(@ConnectedSocket() client: Socket, @MessageBody() body: { branchId: string }) {
    const user = client.data.user as JwtAccessPayload | undefined;
    if (!user || !user.branch_ids.includes(body.branchId)) return { ok: false };
    client.join(`tenant:${user.tenant_id}:branch:${body.branchId}:dashboard`);
    return { ok: true };
  }

  emitAppointmentEvent(event: string, tenantId: string, branchId: string, payload: unknown): void {
    this.server.to(`tenant:${tenantId}:branch:${branchId}:dashboard`).emit(event, payload);
    this.server.to(`tenant:${tenantId}`).emit('dashboard.updated', { branchId });
    this.logger.debug(`Emitted ${event} for tenant=${tenantId} branch=${branchId}`);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') return authToken;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}

