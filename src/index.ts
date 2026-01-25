import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { resolveTenant } from './middleware/tenant.middleware';
import { authenticate } from './middleware/auth.middleware';
import authRoutes from './auth/auth.routes';
import workflowRoutes from './api/workflows';
import notionRoutes from './api/notion';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(resolveTenant);

app.use('/auth', authRoutes);
app.use('/api', authenticate, workflowRoutes);
app.use('/api', authenticate, notionRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/db', async (_req, res) => {
  try {
    const { db } = await import('./db/client');
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'database' });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'database', error: String(error) });
  }
});

app.get('/health/redis', async (_req, res) => {
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await redis.ping();
    await redis.quit();
    res.json({ status: 'ok', service: 'redis' });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'redis', error: String(error) });
  }
});

app.get('/api/user', authenticate, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Base URL: ${process.env.BASE_URL || 'http://localhost:3000'}`);
  console.log(`Health check: http://0.0.0.0:${port}/health`);
});

server.on('error', (error: any) => {
  console.error('❌ Server failed to start:', error);
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
