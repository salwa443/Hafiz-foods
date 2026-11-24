import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import adminCategoryRoutes from './routes/adminCategoryRoutes.js';
import adminMenuItemRoutes from './routes/adminMenuItemRoutes.js';
import adminTableRoutes from './routes/adminTableRoutes.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import kitchenOrderRoutes from './routes/kitchenOrderRoutes.js';
import publicMenuRoutes from './routes/publicMenuRoutes.js';
import publicOrderRoutes from './routes/publicOrderRoutes.js';
import publicOrderTrackingRoutes from './routes/publicOrderTrackingRoutes.js';
import publicTableRoutes from './routes/publicTableRoutes.js';
import waiterOrderRoutes from './routes/waiterOrderRoutes.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { notFoundMiddleware } from './middleware/notFoundMiddleware.js';
import { sanitizeRequestUrl } from './utils/sanitizeRequestUrl.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '..', 'uploads');

app.use(helmet());
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use('/api/public/menu', publicMenuRoutes);
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsPath));

if (env.nodeEnv === 'development') {
  app.use(
    morgan((tokens, req, res) => [
      tokens.method(req, res),
      sanitizeRequestUrl(tokens.url(req, res)),
      tokens.status(req, res),
      tokens['response-time'](req, res),
      'ms',
      '-',
      tokens.res(req, res, 'content-length') || '0',
    ].join(' '))
  );
}

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/kitchen/orders', kitchenOrderRoutes);
app.use('/api/waiter/orders', waiterOrderRoutes);
app.use('/api/public/tables', publicTableRoutes);
app.use('/api/public/tables', publicOrderRoutes);
app.use('/api/public/orders', publicOrderTrackingRoutes);
app.use('/api/admin/tables', adminTableRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);
app.use('/api/admin/menu-items', adminMenuItemRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
