import { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
export declare function setupWebSocket(httpServer: HTTPServer): Server;
export declare function broadcastThreadCreated(io: Server, thread: any): void;
export declare function broadcastThreadUpdated(io: Server, thread: any): void;
export declare function broadcastMessageAdded(io: Server, message: any, thread: any): void;
export default setupWebSocket;
//# sourceMappingURL=websocket.d.ts.map