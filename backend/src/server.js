import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { initializeSocketServer } from './realtime/socketServer.js';

const server = http.createServer(app);
initializeSocketServer(server);

server.listen(env.port, () => {
  console.log(`Backend server running on http://localhost:${env.port}`);
});
