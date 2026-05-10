import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

const ADMIN_ROOM = 'admin:mail';

@Injectable()
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/mail',
  transports: ['websocket', 'polling'],
})
export class MailGateway implements OnGatewayConnection {
  private readonly logger = new Logger('MailGateway');

  @WebSocketServer()
  server!: Server;

  constructor(@Inject(forwardRef(() => JwtService)) private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const auth = (client.handshake.auth ?? {}) as { token?: string };
    const headerToken = (client.handshake.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
    const token = auth.token || headerToken;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string; role?: string }>(token);
      if (payload.role !== 'admin') {
        client.disconnect();
        return;
      }
      await client.join(ADMIN_ROOM);
    } catch {
      client.disconnect();
    }
  }

  emitNewMessage(accountId: string, messageId: string): void {
    this.server?.to(ADMIN_ROOM).emit('mail:new', { accountId, messageId });
  }

  emitSuggestionReady(messageId: string, suggestionId: string): void {
    this.server?.to(ADMIN_ROOM).emit('mail:suggestion', { messageId, suggestionId });
  }

  emitAccountStatus(accountId: string, lastError: string | null): void {
    this.server?.to(ADMIN_ROOM).emit('mail:account', { accountId, lastError });
  }
}
