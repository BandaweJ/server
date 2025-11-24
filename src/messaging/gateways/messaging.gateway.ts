import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from '../services/messaging.service';
import { CreateMessageDto } from '../services/messaging.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure based on your frontend URL
    credentials: true,
  },
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private readonly messagingService: MessagingService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        this.logger.warn('No token provided, disconnecting client');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const accountId = payload.id; // Assuming JWT payload has accountId
      client.userId = accountId;

      // Track user's socket connections
      if (!this.userSockets.has(accountId)) {
        this.userSockets.set(accountId, new Set());
      }
      this.userSockets.get(accountId)!.add(client.id);

      // Join user's personal room
      client.join(`user:${accountId}`);

      this.logger.log(`Client connected: ${client.id} (User: ${accountId})`);
    } catch (error) {
      this.logger.error('Authentication failed', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.logger.log(`Client disconnected: ${client.id} (User: ${client.userId})`);
    }
  }

  private extractTokenFromSocket(client: Socket): string | null {
    // Try to get token from handshake auth
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
    return token || null;
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    try {
      // Verify user is participant
      await this.messagingService.getConversationById(data.conversationId, client.userId);
      
      // Join conversation room
      client.join(`conversation:${data.conversationId}`);
      
      this.logger.log(`User ${client.userId} joined conversation ${data.conversationId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to join conversation', error);
      return { error: 'Failed to join conversation' };
    }
  }

  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    this.logger.log(`User ${client.userId} left conversation ${data.conversationId}`);
    return { success: true };
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; content: string; replyToId?: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    try {
      const message = await this.messagingService.sendMessage(
        data.conversationId,
        {
          content: data.content,
          replyToId: data.replyToId,
        },
        client.userId,
      );

      // Emit to all participants in the conversation
      this.server.to(`conversation:${data.conversationId}`).emit('new-message', message);

      return { success: true, message };
    } catch (error) {
      this.logger.error('Failed to send message', error);
      return { error: error.message || 'Failed to send message' };
    }
  }

  @SubscribeMessage('typing-start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return;
    }

    // Notify others in the conversation (except sender)
    client.to(`conversation:${data.conversationId}`).emit('user-typing', {
      userId: client.userId,
      conversationId: data.conversationId,
    });
  }

  @SubscribeMessage('typing-stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return;
    }

    client.to(`conversation:${data.conversationId}`).emit('user-stopped-typing', {
      userId: client.userId,
      conversationId: data.conversationId,
    });
  }

  // Method to emit message updates (called from service)
  emitMessageUpdate(conversationId: string, message: any) {
    this.server.to(`conversation:${conversationId}`).emit('message-updated', message);
  }

  // Method to emit message deletion
  emitMessageDeleted(conversationId: string, messageId: string) {
    this.server.to(`conversation:${conversationId}`).emit('message-deleted', { messageId });
  }

  // Method to emit conversation updates
  emitConversationUpdate(userId: string, conversation: any) {
    this.server.to(`user:${userId}`).emit('conversation-updated', conversation);
  }
}

