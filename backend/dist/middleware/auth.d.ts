import { Request, Response, NextFunction } from 'express';
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function authorize(requiredRole: 'admin' | 'write' | 'read'): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map