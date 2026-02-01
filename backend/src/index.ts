import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import passport from './auth/config';
import { setupWebSocket } from './websocket';
import { logger } from './logger';
import { closePool } from './db';

// Import routes
import authRoutes from './routes/auth';
import threadRoutes from './routes/threads';
import messageRoutes from './routes/messages';
import teamRoutes from './routes/teams';
import userRoutes from './routes/users';
import permissionRoutes from './routes/permissions';
import repoUrlRoutes from './routes/repo-urls';
import deploymentsRoutes from './routes/deployments';
import githubRoutes from './routes/github';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || 'localhost';

// Security middleware - disable CSP for widget files
app.use('/widget', (req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to allow widget embedding
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'https://jonahkerr7.github.io'
];

// Allow all localhost and chrome-extension origins in development
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Allow chrome-extension origins
    if (origin.startsWith('chrome-extension://')) return callback(null, true);

    // Allow configured origins
    if (corsOrigins.includes(origin)) return callback(null, true);

    // Allow all localhost in development
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Passport initialization
app.use(passport.initialize());

// Rate limiting (relaxed in development)
const isDevelopment = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: isDevelopment ? 10000 : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (isDevelopment && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip?.includes('localhost'))) {
      return true;
    }
    return false;
  },
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve widget files
// In production (Docker): /app/widget, in dev: relative to dist folder
const widgetPath = process.env.NODE_ENV === 'production'
  ? path.join(process.cwd(), 'widget')
  : path.join(__dirname, '../widget');
app.use('/widget', express.static(widgetPath));

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/threads', threadRoutes);
app.use('/api/v1/threads', messageRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/repo-urls', repoUrlRoutes);
app.use('/api/v1/deployments', deploymentsRoutes);
app.use('/api/v1/github', githubRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// Create HTTP server and WebSocket server
const httpServer = createServer(app);
const io = setupWebSocket(httpServer);

// Make io available to routes via app.locals
app.locals.io = io;

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  io.close(() => {
    logger.info('WebSocket server closed');
  });

  await closePool();
  logger.info('Database connections closed');

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
httpServer.listen(PORT, HOST, () => {
  logger.info(`Server running at http://${HOST}:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`WebSocket server ready for connections`);
});

export { app, io };
