import { QueryResult } from 'pg';
export declare const query: <T = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
export declare const getClient: () => Promise<import("pg").PoolClient>;
export declare const closePool: () => Promise<void>;
declare const _default: {
    query: <T = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
    getClient: () => Promise<import("pg").PoolClient>;
    closePool: () => Promise<void>;
};
export default _default;
//# sourceMappingURL=db.d.ts.map