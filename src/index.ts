import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { resolveTenant } from './middleware/tenant.middleware';
import { authenticate } from './middleware/auth.middleware';
import authRoutes from './auth/auth.routes';

const app = express();
const port = process.env.PORT || 3000;

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Base URL: ${process.env.BASE_URL || 'http://localhost:3000'}`);
});
