/**
 * Notion Settings API Routes
 * 
 * 기획:
 * - Organization별 Notion API Key 관리
 * - Notion 데이터베이스 목록 조회
 * - 연결 테스트
 * 
 * 엔드포인트:
 * - POST   /api/notion/connection
 * - GET    /api/notion/connection
 * - PUT    /api/notion/connection
 * - DELETE /api/notion/connection
 * - GET    /api/notion/databases
 * - POST   /api/notion/test
 */

import { Router, Request, Response } from 'express';
import { db as prisma } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { NotionClient } from '../mcp-servers/notion/client';

const router = Router();

router.post('/notion/connection', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { apiKey, defaultDatabaseId } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const existingConnection = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });

    if (existingConnection) {
      return res.status(409).json({ error: 'Notion connection already exists. Use PUT to update.' });
    }

    const connection = await prisma.notionConnection.create({
      data: {
        organizationId,
        apiKey,
        defaultDatabaseId: defaultDatabaseId || null,
      },
    });

    return res.status(201).json({
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        defaultDatabaseId: connection.defaultDatabaseId,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error('Create Notion connection error:', error);
    return res.status(500).json({ error: 'Failed to create Notion connection' });
  }
});

router.get('/notion/connection', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const connection = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: 'Notion connection not found' });
    }

    return res.json({
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        defaultDatabaseId: connection.defaultDatabaseId,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get Notion connection error:', error);
    return res.status(500).json({ error: 'Failed to fetch Notion connection' });
  }
});

router.put('/notion/connection', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { apiKey, defaultDatabaseId } = req.body;

    const existing = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Notion connection not found' });
    }

    const connection = await prisma.notionConnection.update({
      where: { organizationId },
      data: {
        ...(apiKey !== undefined && { apiKey }),
        ...(defaultDatabaseId !== undefined && { defaultDatabaseId }),
      },
    });

    return res.json({
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        defaultDatabaseId: connection.defaultDatabaseId,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update Notion connection error:', error);
    return res.status(500).json({ error: 'Failed to update Notion connection' });
  }
});

router.delete('/notion/connection', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const existing = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Notion connection not found' });
    }

    await prisma.notionConnection.delete({
      where: { organizationId },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete Notion connection error:', error);
    return res.status(500).json({ error: 'Failed to delete Notion connection' });
  }
});

router.get('/notion/databases', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const connection = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: 'Notion connection not found' });
    }

    const client = new NotionClient(connection.apiKey);
    const databases = await client.getDatabases();

    return res.json({ databases });
  } catch (error) {
    console.error('Get Notion databases error:', error);
    return res.status(500).json({ error: 'Failed to fetch Notion databases' });
  }
});

router.post('/notion/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required for testing' });
    }

    const client = new NotionClient(apiKey);
    const databases = await client.getDatabases();

    return res.json({
      success: true,
      databaseCount: databases.length,
      message: 'Notion API key is valid',
    });
  } catch (error: any) {
    console.error('Test Notion connection error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Invalid Notion API key',
    });
  }
});

export default router;
