/**
 * Admin Support Ticket Service
 *
 * Manages support tickets and customer issues for platform admins.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { logAdminAction } from "../middleware/admin-auth";

export interface SupportTicket {
  id: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  userEmail: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  messages: TicketMessage[];
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorType: "user" | "admin";
  content: string;
  createdAt: Date;
}

export interface TicketFilters {
  status?: SupportTicket["status"];
  priority?: SupportTicket["priority"];
  category?: string;
  assignedTo?: string;
  organizationId?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "priority";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  avgResolutionTime: number;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
}

// In-memory ticket storage (would be in database in production)
const tickets = new Map<string, SupportTicket>();
let ticketCounter = 0;

export class AdminSupportService {
  /**
   * List support tickets with filters
   */
  async listTickets(filters: TicketFilters = {}): Promise<{
    tickets: SupportTicket[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      status,
      priority,
      category,
      assignedTo,
      organizationId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    let filteredTickets = Array.from(tickets.values());

    // Apply filters
    if (status) {
      filteredTickets = filteredTickets.filter((t) => t.status === status);
    }
    if (priority) {
      filteredTickets = filteredTickets.filter((t) => t.priority === priority);
    }
    if (category) {
      filteredTickets = filteredTickets.filter((t) => t.category === category);
    }
    if (assignedTo) {
      filteredTickets = filteredTickets.filter((t) => t.assignedTo === assignedTo);
    }
    if (organizationId) {
      filteredTickets = filteredTickets.filter((t) => t.organizationId === organizationId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filteredTickets = filteredTickets.filter(
        (t) =>
          t.subject.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower),
      );
    }

    // Sort
    filteredTickets.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === "asc"
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      return 0;
    });

    const total = filteredTickets.length;
    const start = (page - 1) * limit;
    const paged = filteredTickets.slice(start, start + limit);

    return {
      tickets: paged,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single ticket by ID
   */
  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    return tickets.get(ticketId) || null;
  }

  /**
   * Create a new support ticket
   */
  async createTicket(data: {
    organizationId: string;
    userId: string;
    subject: string;
    description: string;
    priority?: SupportTicket["priority"];
    category?: string;
  }): Promise<SupportTicket> {
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: data.userId },
        select: { email: true },
      }),
    ]);

    const ticket: SupportTicket = {
      id: `ticket_${++ticketCounter}`,
      organizationId: data.organizationId,
      organizationName: org?.name || "Unknown",
      userId: data.userId,
      userEmail: user?.email || "unknown@example.com",
      subject: data.subject,
      description: data.description,
      status: "open",
      priority: data.priority || "medium",
      category: data.category || "general",
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    };

    tickets.set(ticket.id, ticket);
    logger.info("Support ticket created", { ticketId: ticket.id });

    return ticket;
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: SupportTicket["status"],
    adminId: string,
  ): Promise<SupportTicket> {
    const ticket = tickets.get(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    ticket.status = status;
    ticket.updatedAt = new Date();

    if (status === "resolved" || status === "closed") {
      ticket.resolvedAt = new Date();
    }

    await logAdminAction(adminId, "update_ticket_status", {
      ticketId,
      newStatus: status,
    });

    return ticket;
  }

  /**
   * Assign ticket to admin
   */
  async assignTicket(
    ticketId: string,
    assigneeId: string,
    adminId: string,
  ): Promise<SupportTicket> {
    const ticket = tickets.get(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    ticket.assignedTo = assigneeId;
    ticket.updatedAt = new Date();

    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await logAdminAction(adminId, "assign_ticket", {
      ticketId,
      assigneeId,
    });

    return ticket;
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    ticketId: string,
    authorId: string,
    authorName: string,
    authorType: "user" | "admin",
    content: string,
  ): Promise<TicketMessage> {
    const ticket = tickets.get(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const message: TicketMessage = {
      id: `msg_${Date.now()}`,
      ticketId,
      authorId,
      authorName,
      authorType,
      content,
      createdAt: new Date(),
    };

    ticket.messages.push(message);
    ticket.updatedAt = new Date();

    return message;
  }

  /**
   * Get ticket statistics
   */
  async getStats(): Promise<TicketStats> {
    const allTickets = Array.from(tickets.values());

    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const ticket of allTickets) {
      byPriority[ticket.priority] = (byPriority[ticket.priority] || 0) + 1;
      byCategory[ticket.category] = (byCategory[ticket.category] || 0) + 1;

      if (ticket.resolvedAt) {
        totalResolutionTime += ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
        resolvedCount++;
      }
    }

    return {
      total: allTickets.length,
      open: allTickets.filter((t) => t.status === "open").length,
      inProgress: allTickets.filter((t) => t.status === "in_progress").length,
      waiting: allTickets.filter((t) => t.status === "waiting").length,
      resolved: allTickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
      avgResolutionTime:
        resolvedCount > 0 ? totalResolutionTime / resolvedCount / 1000 / 60 / 60 : 0, // hours
      byPriority,
      byCategory,
    };
  }
}

export const adminSupportService = new AdminSupportService();
