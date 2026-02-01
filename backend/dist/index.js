"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.app = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const config_1 = __importDefault(require("./auth/config"));
const websocket_1 = require("./websocket");
const logger_1 = require("./logger");
const db_1 = require("./db");
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const threads_1 = __importDefault(require("./routes/threads"));
const messages_1 = __importDefault(require("./routes/messages"));
const teams_1 = __importDefault(require("./routes/teams"));
const users_1 = __importDefault(require("./routes/users"));
const permissions_1 = __importDefault(require("./routes/permissions"));
const repo_urls_1 = __importDefault(require("./routes/repo-urls"));
const deployments_1 = __importDefault(require("./routes/deployments"));
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || 'localhost';
// Security middleware
app.use((0, helmet_1.default)());
// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000'
];
// Allow all localhost and chrome-extension origins in development
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin)
            return callback(null, true);
        // Allow chrome-extension origins
        if (origin.startsWith('chrome-extension://'))
            return callback(null, true);
        // Allow configured origins
        if (corsOrigins.includes(origin))
            return callback(null, true);
        // Allow all localhost in development
        if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Passport initialization
app.use(config_1.default.initialize());
// Rate limiting (relaxed in development)
const isDevelopment = process.env.NODE_ENV !== 'production';
const limiter = (0, express_rate_limit_1.default)({
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
    logger_1.logger.info('Incoming request', {
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
// API routes
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/threads', threads_1.default);
app.use('/api/v1/threads', messages_1.default);
app.use('/api/v1/teams', teams_1.default);
app.use('/api/v1/users', users_1.default);
app.use('/api/v1/permissions', permissions_1.default);
app.use('/api/v1/repo-urls', repo_urls_1.default);
app.use('/api/v1/deployments', deployments_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handler
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error', {
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
const httpServer = (0, http_1.createServer)(app);
const io = (0, websocket_1.setupWebSocket)(httpServer);
exports.io = io;
// Make io available to routes via app.locals
app.locals.io = io;
// Graceful shutdown
const shutdown = async () => {
    logger_1.logger.info('Shutting down gracefully...');
    httpServer.close(() => {
        logger_1.logger.info('HTTP server closed');
    });
    io.close(() => {
        logger_1.logger.info('WebSocket server closed');
    });
    await (0, db_1.closePool)();
    logger_1.logger.info('Database connections closed');
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Start server
httpServer.listen(PORT, HOST, () => {
    logger_1.logger.info(`Server running at http://${HOST}:${PORT}`);
    logger_1.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger_1.logger.info(`WebSocket server ready for connections`);
});
//# sourceMappingURL=index.js.map