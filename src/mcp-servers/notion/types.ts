/**
 * Notion MCP Types
 *
 * 기획:
 * - Notion API와 통신하기 위한 타입 정의
 * - Task, Database, Property 타입
 *
 * 구조:
 * - NotionTask: Notion 페이지를 Task로 표현
 * - NotionDatabase: Notion 데이터베이스 정보
 * - MCP Tool 입출력 타입
 */

export interface NotionTask {
  id: string;
  title: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  properties: Record<string, any>;
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

export interface GetTasksInput {
  databaseId?: string;
  filter?: {
    status?: string;
    assignee?: string;
  };
  limit?: number;
}

export interface GetTasksOutput {
  tasks: NotionTask[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateTaskInput {
  databaseId: string;
  title: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  properties?: Record<string, any>;
}

export interface CreateTaskOutput {
  task: NotionTask;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  properties?: Record<string, any>;
}

export interface UpdateTaskOutput {
  task: NotionTask;
}

export interface DeleteTaskInput {
  taskId: string;
}

export interface DeleteTaskOutput {
  success: boolean;
  taskId: string;
}

export interface NotionConnection {
  id: string;
  organizationId: string;
  apiKey: string;
  defaultDatabaseId?: string;
  createdAt: Date;
  updatedAt: Date;
}
