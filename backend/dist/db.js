"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closePool = exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const logger_1 = require("./logger");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
pool.on('error', (err) => {
    logger_1.logger.error('Unexpected error on idle database client', err);
    process.exit(-1);
});
pool.on('connect', () => {
    logger_1.logger.info('Database connection established');
});
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger_1.logger.debug('Executed query', { text, duration, rows: result.rowCount });
        return result;
    }
    catch (error) {
        logger_1.logger.error('Database query error', { text, error });
        throw error;
    }
};
exports.query = query;
const getClient = () => pool.connect();
exports.getClient = getClient;
const closePool = () => pool.end();
exports.closePool = closePool;
exports.default = { query: exports.query, getClient: exports.getClient, closePool: exports.closePool };
//# sourceMappingURL=db.js.map