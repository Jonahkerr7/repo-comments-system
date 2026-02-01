"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocket = setupWebSocket;
exports.broadcastThreadCreated = broadcastThreadCreated;
exports.broadcastThreadUpdated = broadcastThreadUpdated;
exports.broadcastMessageAdded = broadcastMessageAdded;
const socket_io_1 = require("socket.io");
const config_1 = require("./auth/config");
const db_1 = require("./db");
const logger_1 = require("./logger");
function setupWebSocket(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN?.split(',') || '*',
            credentials: true,
        },
        pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000'),
        pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000'),
    });
    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token ||
                socket.handshake.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return next(new Error('Authentication required'));
            }
            const payload = (0, config_1.verifyToken)(token);
            const result = await (0, db_1.query)('SELECT * FROM users WHERE id = $1', [
                payload.id,
            ]);
            if (result.rows.length === 0) {
                return next(new Error('Invalid token'));
            }
            socket.user = result.rows[0];
            socket.subscribedRepos = new Set();
            next();
        }
        catch (error) {
            logger_1.logger.error('WebSocket authentication error', error);
            next(new Error('Authentication failed'));
        }
    });
    io.on('connection', (socket) => {
        logger_1.logger.info('WebSocket client connected', {
            socketId: socket.id,
            userId: socket.user?.id,
        });
        // Subscribe to a repository
        socket.on('subscribe', async (data) => {
            try {
                const { repo, branch } = data;
                // Verify user has access to this repo
                const permissions = await (0, db_1.query)('SELECT role FROM user_permissions WHERE user_id = $1 AND repo = $2', [socket.user.id, repo]);
                if (permissions.rows.length === 0) {
                    socket.emit('error', { message: 'Access denied to repository' });
                    return;
                }
                const room = branch ? `${repo}:${branch}` : repo;
                socket.join(room);
                socket.subscribedRepos?.add(repo);
                logger_1.logger.info('Client subscribed to repository', {
                    socketId: socket.id,
                    userId: socket.user?.id,
                    repo,
                    branch,
                });
                socket.emit('subscribed', { repo, branch });
            }
            catch (error) {
                logger_1.logger.error('Subscribe error', error);
                socket.emit('error', { message: 'Failed to subscribe' });
            }
        });
        // Unsubscribe from a repository
        socket.on('unsubscribe', (data) => {
            const { repo, branch } = data;
            const room = branch ? `${repo}:${branch}` : repo;
            socket.leave(room);
            socket.subscribedRepos?.delete(repo);
            logger_1.logger.info('Client unsubscribed from repository', {
                socketId: socket.id,
                repo,
                branch,
            });
            socket.emit('unsubscribed', { repo, branch });
        });
        socket.on('disconnect', () => {
            logger_1.logger.info('WebSocket client disconnected', {
                socketId: socket.id,
                userId: socket.user?.id,
            });
        });
        socket.on('error', (error) => {
            logger_1.logger.error('WebSocket error', { socketId: socket.id, error });
        });
    });
    return io;
}
// Helper functions to broadcast events
function broadcastThreadCreated(io, thread) {
    const room = `${thread.repo}:${thread.branch}`;
    const repoRoom = thread.repo;
    io.to(room).to(repoRoom).emit('thread:created', thread);
    logger_1.logger.debug('Broadcasted thread:created', {
        threadId: thread.id,
        repo: thread.repo,
        branch: thread.branch,
    });
}
function broadcastThreadUpdated(io, thread) {
    const room = `${thread.repo}:${thread.branch}`;
    const repoRoom = thread.repo;
    io.to(room).to(repoRoom).emit('thread:updated', thread);
    logger_1.logger.debug('Broadcasted thread:updated', {
        threadId: thread.id,
        repo: thread.repo,
    });
}
function broadcastMessageAdded(io, message, thread) {
    const room = `${thread.repo}:${thread.branch}`;
    const repoRoom = thread.repo;
    io.to(room).to(repoRoom).emit('message:added', {
        threadId: thread.id,
        message,
    });
    logger_1.logger.debug('Broadcasted message:added', {
        messageId: message.id,
        threadId: thread.id,
    });
}
exports.default = setupWebSocket;
//# sourceMappingURL=websocket.js.map