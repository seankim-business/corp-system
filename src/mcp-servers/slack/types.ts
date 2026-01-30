/**
 * Slack MCP Types
 *
 * 기획:
 * - Slack API와 통신하기 위한 타입 정의
 * - User, Channel, Message 타입
 *
 * 구조:
 * - SlackUser: Slack 사용자 정보
 * - SlackChannel: Slack 채널 정보
 * - SlackMessage: Slack 메시지 정보
 * - MCP Tool 입출력 타입
 */

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  displayName?: string;
  email?: string;
  isBot: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  teamId: string;
  timezone?: string;
  profileImage?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isGroup: boolean;
  isIm: boolean;
  isMpim: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  topic?: string;
  purpose?: string;
  numMembers?: number;
  created: number;
}

export interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  user?: string;
  username?: string;
  botId?: string;
  ts: string;
  threadTs?: string;
  channel: string;
  team: string;
  edited?: {
    user: string;
    ts: string;
  };
  reactions?: Array<{
    name: string;
    users: string[];
    count: number;
  }>;
  attachments?: any[];
  blocks?: any[];
}

export interface SendMessageInput {
  channel: string;
  text: string;
  threadTs?: string;
  blocks?: any[];
  attachments?: any[];
}

export interface SendMessageOutput {
  ok: boolean;
  channel: string;
  ts: string;
  message: SlackMessage;
}

export interface GetUserInput {
  userId: string;
}

export interface GetUserOutput {
  user: SlackUser;
}

export interface ListChannelsInput {
  excludeArchived?: boolean;
  limit?: number;
  types?: string; // e.g., "public_channel,private_channel"
  cursor?: string;
}

export interface ListChannelsOutput {
  channels: SlackChannel[];
  nextCursor?: string;
}

export interface SearchMessagesInput {
  query: string;
  count?: number;
  page?: number;
  sort?: "score" | "timestamp";
  sortDir?: "asc" | "desc";
}

export interface SearchMessagesOutput {
  messages: Array<{
    type: string;
    text: string;
    user?: string;
    username?: string;
    ts: string;
    channel: {
      id: string;
      name: string;
    };
    permalink: string;
  }>;
  total: number;
  matches: number;
  hasMore: boolean;
}

export interface SlackConnection {
  id: string;
  organizationId: string;
  accessToken: string;
  teamId: string;
  teamName?: string;
  createdAt: Date;
  updatedAt: Date;
}
