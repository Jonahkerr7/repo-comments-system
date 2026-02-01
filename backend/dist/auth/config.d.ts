import passport from 'passport';
import { JWTPayload } from '../types';
export declare function generateToken(payload: JWTPayload): string;
export declare function verifyToken(token: string): JWTPayload;
export default passport;
//# sourceMappingURL=config.d.ts.map