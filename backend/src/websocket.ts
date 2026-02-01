import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './auth/config';
import { query } from './db';
import { User, WebSocketMessage } from './types';
import { logger } from './logger';

interface AuthenticatedSocket extends Socket {
  user?: User;
  subscribedRepos?: Set<string>;
}

export function setupWebSocket(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
    },
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000'),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000'),
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);
      const result = await query<User>('SELECT * FROM users WHERE id = $1', [
        payload.id,
      ]);

      if (result.rows.length === 0) {
        return next(new Error('Invalid token'));
      }

      socket.user = result.rows[0];
      socket.subscribedRepos = new Set();
      next();
    } catch (error) {
      logger.error('WebSocket authentication error', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId: socket.user?.id,
    });

    // Subscribe to a repository
    socket.on('subscribe', async (data: { repo: string; branch?: string }) => {
      try {
        const { repo, branch } = data;

        // Verify user has access to this repo
        const permissions = await query(
          'SELECT role FROM user_permissions WHERE user_id = $1 AND repo = $2',
          [socket.user!.id, repo]
        );

        if (permissions.rows.length === 0) {
          socket.emit('error', { message: 'Access denied to repository' });
          return;
        }

        const room = branch ? `${repo}:${branch}` : repo;
        socket.join(room);
        socket.subscribedRepos?.add(repo);

        logger.info('Client subscribed to repository', {
          socketId: socket.id,
          userId: socket.user?.id,
          repo,
          branch,
        });

        socket.emit('subscribed', { repo, branch });
      } catch (error) {
        logger.error('Subscribe error', error);
        socket.emit('error', { message: 'Failed to subscribe' });
      }
    });

    // Unsubscribe from a repository
    socket.on('unsubscribe', (data: { repo: string; branch?: string }) => {
      const { repo, branch } = data;
      const room = branch ? `${repo}:${branch}` : repo;
      socket.leave(room);
      socket.subscribedRepos?.delete(repo);

      logger.info('Client unsubscribed from repository', {
        socketId: socket.id,
        repo,
        branch,
      });

      socket.emit('unsubscribed', { repo, branch });
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: socket.user?.id,
      });
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', { socketId: socket.id, error });
    });
  });

  return io;
}

// Helper functions to broadcast events

export function broadcastThreadCreated(io: Server, thread: any): void {
  const room = `${thread.repo}:${thread.branch}`;
  const repoRoom = thread.repo;

  io.to(room).to(repoRoom).emit('thread:created', thread);

  logger.debug('Broadcasted thread:created', {
    threadId: thread.id,
    repo: thread.repo,
    branch: thread.branch,
  });
}

export function broadcastThreadUpdated(io: Server, thread: any): void {
  const room = `${thread.repo}:${thread.branch}`;
  const repoRoom = thread.repo;

  io.to(room).to(repoRoom).emit('thread:updated', thread);

  logger.debug('Broadcasted thread:updated', {
    threadId: thread.id,
    repo: thread.repo,
  });
}

export function broadcastMessageAdded(
  io: Server,
  message: any,
  thread: any
): void {
  const room = `${thread.repo}:${thread.branch}`;
  const repoRoom = thread.repo;

  io.to(room).to(repoRoom).emit('message:added', {
    threadId: thread.id,
    message,
  });

  logger.debug('Broadcasted message:added', {
    messageId: message.id,
    threadId: thread.id,
  });
}

export default setupWebSocket;
