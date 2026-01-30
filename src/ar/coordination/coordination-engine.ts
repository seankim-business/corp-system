/**
 * AR Coordination Engine
 *
 * Real-time event-driven coordination system for agent collaboration.
 * Implements agent state management, negotiation protocols, and Director decision-making.
 *
 * Based on AR Management System Plan - Module 3 & Addendum B
 */

import { logger } from '../../utils/logger';
import { withQueueConnection } from '../../db/redis';
import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';
import {
  CoordinationEvent,
  ARCoordinationEventType,
  AgentCoordinationState,
  NegotiationRequest,
  NegotiationResponse,
  DirectorDecision,
} from '../types';

// =============================================================================
// Event Bus - Redis Pub/Sub for Real-Time Coordination
// =============================================================================

export type EventHandler = (event: CoordinationEvent) => void | Promise<void>;

export class ARCoordinationEventBus {
  private subscriber: Redis | Cluster | null = null;
  private publisher: Redis | Cluster | null = null;
  private handlers: Map<ARCoordinationEventType | 'all', Set<EventHandler>> = new Map();
  private started = false;

  /**
   * Start the event bus - acquire connections and begin listening
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn('[AR-EventBus] Already started');
      return;
    }

    await withQueueConnection(async (conn) => {
      // Create dedicated subscriber and publisher connections
      this.subscriber = conn.duplicate();
      this.publisher = conn.duplicate();

      // Set up message handler
      this.subscriber.on('message', (channel: string, message: string) => {
        this.handleMessage(channel, message);
      });

      // Subscribe to AR coordination channel
      await this.subscriber.subscribe('ar:coordination:events');

      this.started = true;
      logger.info('[AR-EventBus] Started and subscribed to ar:coordination:events');
    });
  }

  /**
   * Stop the event bus - clean up connections
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.subscriber) {
      await this.subscriber.unsubscribe('ar:coordination:events');
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }

    this.handlers.clear();
    this.started = false;
    logger.info('[AR-EventBus] Stopped');
  }

  /**
   * Publish a coordination event to all subscribers
   */
  async publish(event: CoordinationEvent): Promise<void> {
    if (!this.started || !this.publisher) {
      throw new Error('[AR-EventBus] Event bus not started');
    }

    try {
      const message = JSON.stringify(event);
      await this.publisher.publish('ar:coordination:events', message);

      logger.debug('[AR-EventBus] Event published', {
        type: event.type,
        agentId: event.agentId,
        taskId: event.taskId,
        priority: event.priority,
      });
    } catch (error) {
      logger.error('[AR-EventBus] Failed to publish event', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.type,
      });
      throw error;
    }
  }

  /**
   * Subscribe to specific event type or all events
   */
  subscribe(eventType: ARCoordinationEventType | 'all', handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    logger.debug('[AR-EventBus] Handler subscribed', { eventType });
  }

  /**
   * Unsubscribe from event type
   */
  unsubscribe(eventType: ARCoordinationEventType | 'all', handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }

    logger.debug('[AR-EventBus] Handler unsubscribed', { eventType });
  }

  /**
   * Internal: Handle incoming Redis pub/sub messages
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const event = JSON.parse(message) as CoordinationEvent;

      // Call specific event type handlers
      const typeHandlers = this.handlers.get(event.type);
      if (typeHandlers) {
        typeHandlers.forEach((handler) => {
          try {
            void handler(event);
          } catch (error) {
            logger.error('[AR-EventBus] Handler error', {
              error: error instanceof Error ? error.message : String(error),
              eventType: event.type,
            });
          }
        });
      }

      // Call wildcard handlers
      const allHandlers = this.handlers.get('all');
      if (allHandlers) {
        allHandlers.forEach((handler) => {
          try {
            void handler(event);
          } catch (error) {
            logger.error('[AR-EventBus] Wildcard handler error', {
              error: error instanceof Error ? error.message : String(error),
              eventType: event.type,
            });
          }
        });
      }
    } catch (error) {
      logger.error('[AR-EventBus] Failed to parse event message', {
        error: error instanceof Error ? error.message : String(error),
        channel,
      });
    }
  }
}

// =============================================================================
// Agent State Machine - Coordination State Tracking
// =============================================================================

interface StateTransition {
  event: string;
  nextState: AgentCoordinationState;
}

export interface AgentCoordinationContext {
  agentId: string;
  state: AgentCoordinationState;
  currentTask?: string;
  blockedReason?: string;
  activeNegotiations: string[];
  pendingDirectorDecisions: string[];
  lastStateChange: Date;
  metadata?: Record<string, any>;
}

export class AgentCoordinationStateMachine {
  private transitions: Record<AgentCoordinationState, StateTransition[]> = {
    IDLE: [
      { event: 'TASK_ASSIGNED', nextState: 'WORKING' },
      { event: 'NEGOTIATION_REQUEST', nextState: 'NEGOTIATING' },
    ],
    WORKING: [
      { event: 'TASK_COMPLETED', nextState: 'IDLE' },
      { event: 'TASK_BLOCKED', nextState: 'SEEKING_HELP' },
      { event: 'OVERLOAD_DETECTED', nextState: 'SEEKING_HELP' },
    ],
    SEEKING_HELP: [
      { event: 'NEGOTIATION_STARTED', nextState: 'NEGOTIATING' },
      { event: 'ESCALATED_TO_DIRECTOR', nextState: 'WAITING_DIRECTOR' },
      { event: 'BLOCKER_RESOLVED', nextState: 'WORKING' },
    ],
    NEGOTIATING: [
      { event: 'NEGOTIATION_SUCCEEDED', nextState: 'WORKING' },
      { event: 'NEGOTIATION_FAILED', nextState: 'WAITING_DIRECTOR' },
      { event: 'NEGOTIATION_TIMEOUT', nextState: 'WAITING_DIRECTOR' },
    ],
    WAITING_DIRECTOR: [
      { event: 'DIRECTOR_DECISION_RECEIVED', nextState: 'EXECUTING_DECISION' },
      { event: 'HUMAN_OVERRIDE', nextState: 'EXECUTING_DECISION' },
    ],
    EXECUTING_DECISION: [
      { event: 'EXECUTION_COMPLETE', nextState: 'WORKING' },
      { event: 'EXECUTION_FAILED', nextState: 'WAITING_DIRECTOR' },
    ],
  };

  /**
   * Get current state for an agent (from Redis cache)
   */
  async getState(agentId: string): Promise<AgentCoordinationContext> {
    return withQueueConnection(async (client) => {
      const key = `ar:coordination:agent:${agentId}:state`;
      const cached = await client.get(key);

      if (cached) {
        return JSON.parse(cached) as AgentCoordinationContext;
      }

      // Default state for new agents
      const defaultState: AgentCoordinationContext = {
        agentId,
        state: 'IDLE',
        activeNegotiations: [],
        pendingDirectorDecisions: [],
        lastStateChange: new Date(),
      };

      await this.setState(agentId, defaultState);
      return defaultState;
    });
  }

  /**
   * Update agent state in Redis
   */
  private async setState(agentId: string, context: AgentCoordinationContext): Promise<void> {
    return withQueueConnection(async (client) => {
      const key = `ar:coordination:agent:${agentId}:state`;
      await client.set(key, JSON.stringify(context), 'EX', 3600); // 1 hour TTL
    });
  }

  /**
   * Transition agent to new state based on event
   */
  async transition(agentId: string, event: string, data?: Record<string, any>): Promise<AgentCoordinationState> {
    const context = await this.getState(agentId);
    const currentState = context.state;

    if (!this.isValidTransition(currentState, event)) {
      logger.warn('[AR-StateMachine] Invalid transition', {
        agentId,
        currentState,
        event,
      });
      return currentState;
    }

    const transition = this.transitions[currentState].find((t) => t.event === event);
    if (!transition) {
      return currentState;
    }

    const newState = transition.nextState;
    const updatedContext: AgentCoordinationContext = {
      ...context,
      state: newState,
      lastStateChange: new Date(),
      ...(data || {}),
    };

    await this.setState(agentId, updatedContext);

    logger.info('[AR-StateMachine] State transition', {
      agentId,
      from: currentState,
      to: newState,
      event,
    });

    return newState;
  }

  /**
   * Check if a transition is valid for current state
   */
  isValidTransition(currentState: AgentCoordinationState, event: string): boolean {
    const validEvents = this.transitions[currentState]?.map((t) => t.event) || [];
    return validEvents.includes(event);
  }
}

// =============================================================================
// Negotiation Service - Agent-to-Agent Negotiation Protocol
// =============================================================================

interface NegotiationResult {
  success: boolean;
  agreement?: NegotiationResponse;
  escalated?: boolean;
  reason?: string;
}

interface EscalationContext {
  negotiationId: string;
  reason: 'timeout' | 'rejected' | 'conflict';
  involvedAgentIds: string[];
  originalRequest: NegotiationRequest;
  responses: NegotiationResponse[];
}

export class NegotiationService {
  private readonly NEGOTIATION_TIMEOUT_MS = 30000; // 30 seconds

  constructor(
    private eventBus: ARCoordinationEventBus,
    private stateMachine: AgentCoordinationStateMachine,
  ) {}

  /**
   * Initiate a negotiation between two agents
   */
  async initiateNegotiation(
    fromAgentId: string,
    toAgentId: string,
    request: Omit<NegotiationRequest, 'id' | 'requesterId' | 'createdAt'>,
  ): Promise<NegotiationResult> {
    const negotiationId = this.generateNegotiationId();

    const fullRequest: NegotiationRequest = {
      ...request,
      id: negotiationId,
      requesterId: fromAgentId,
      targetAgentId: toAgentId,
      createdAt: new Date(),
    };

    // Transition requesting agent state
    await this.stateMachine.transition(fromAgentId, 'NEGOTIATION_STARTED', {
      activeNegotiations: [negotiationId],
    });

    // Publish negotiation request event
    await this.eventBus.publish({
      id: negotiationId,
      type: 'NEGOTIATION_REQUEST',
      agentId: fromAgentId,
      state: 'NEGOTIATING',
      data: fullRequest,
      priority: request.urgency,
      timestamp: new Date(),
    });

    // Wait for response with timeout
    const response = await this.waitForNegotiationResponse(negotiationId, this.NEGOTIATION_TIMEOUT_MS);

    if (!response) {
      // Timeout - escalate to director
      logger.warn('[AR-Negotiation] Timeout, escalating to director', {
        negotiationId,
        fromAgentId,
        toAgentId,
      });
      return this.escalateToDirector(negotiationId, 'timeout', fullRequest, []);
    }

    // Handle response
    if (response.decision === 'accept') {
      await this.stateMachine.transition(fromAgentId, 'NEGOTIATION_SUCCEEDED');
      return { success: true, agreement: response };
    }

    if (response.decision === 'counter') {
      // Allow one counter-proposal round (simplified)
      logger.info('[AR-Negotiation] Counter-proposal received', {
        negotiationId,
        fromAgentId,
        toAgentId,
      });
      // For now, treat counter-proposal as rejection and escalate
      return this.escalateToDirector(negotiationId, 'conflict', fullRequest, [response]);
    }

    // Rejected - escalate to director
    logger.info('[AR-Negotiation] Rejected, escalating to director', {
      negotiationId,
      fromAgentId,
      toAgentId,
      reason: response.reason,
    });
    return this.escalateToDirector(negotiationId, 'rejected', fullRequest, [response]);
  }

  /**
   * Respond to a negotiation request
   */
  async respond(negotiationId: string, response: Omit<NegotiationResponse, 'respondedAt'>): Promise<void> {
    const fullResponse: NegotiationResponse = {
      ...response,
      respondedAt: new Date(),
    };

    // Store response in Redis
    await withQueueConnection(async (client) => {
      const key = `ar:negotiation:${negotiationId}:response`;
      await client.set(key, JSON.stringify(fullResponse), 'EX', 300); // 5 min TTL
    });

    // Publish response event
    await this.eventBus.publish({
      id: negotiationId,
      type: 'NEGOTIATION_RESPONSE',
      agentId: response.responderId,
      state: 'NEGOTIATING',
      data: fullResponse,
      priority: 'medium',
      timestamp: new Date(),
    });

    logger.info('[AR-Negotiation] Response submitted', {
      negotiationId,
      responderId: response.responderId,
      decision: response.decision,
    });
  }

  /**
   * Escalate negotiation to AR Director for decision
   */
  async escalateToDirector(
    negotiationId: string,
    reason: 'timeout' | 'rejected' | 'conflict',
    request: NegotiationRequest,
    responses: NegotiationResponse[],
  ): Promise<NegotiationResult> {
    const escalationContext: EscalationContext = {
      negotiationId,
      reason,
      involvedAgentIds: [request.requesterId, request.targetAgentId],
      originalRequest: request,
      responses,
    };

    // Store escalation context
    await withQueueConnection(async (client) => {
      const key = `ar:escalation:${negotiationId}`;
      await client.set(key, JSON.stringify(escalationContext), 'EX', 3600); // 1 hour
    });

    // Transition agents to waiting state
    await this.stateMachine.transition(request.requesterId, 'ESCALATED_TO_DIRECTOR', {
      pendingDirectorDecisions: [negotiationId],
    });
    await this.stateMachine.transition(request.targetAgentId, 'ESCALATED_TO_DIRECTOR', {
      pendingDirectorDecisions: [negotiationId],
    });

    logger.info('[AR-Negotiation] Escalated to director', {
      negotiationId,
      reason,
      involvedAgents: escalationContext.involvedAgentIds,
    });

    return {
      success: false,
      escalated: true,
      reason: `Escalated to AR Director due to ${reason}`,
    };
  }

  /**
   * Wait for negotiation response with timeout
   */
  private async waitForNegotiationResponse(
    negotiationId: string,
    timeoutMs: number,
  ): Promise<NegotiationResponse | null> {
    const startTime = Date.now();
    const pollInterval = 500; // 500ms

    while (Date.now() - startTime < timeoutMs) {
      const response = await withQueueConnection(async (client) => {
        const key = `ar:negotiation:${negotiationId}:response`;
        const cached = await client.get(key);
        return cached ? (JSON.parse(cached) as NegotiationResponse) : null;
      });

      if (response) {
        return response;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return null;
  }

  /**
   * Generate unique negotiation ID
   */
  private generateNegotiationId(): string {
    return `neg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

// =============================================================================
// AR Director Decision Engine - Final Decision Authority
// =============================================================================

interface DecisionContext {
  escalation: EscalationContext;
  agentStates: AgentCoordinationContext[];
  workloadData: Record<string, number>; // agentId -> utilization %
  organizationPriorities: string[];
}

export class ARDirectorDecisionEngine {
  constructor(
    private eventBus: ARCoordinationEventBus,
    private stateMachine: AgentCoordinationStateMachine,
  ) {}

  /**
   * Make a decision on an escalated negotiation
   */
  async makeDecision(negotiationId: string): Promise<DirectorDecision> {
    // Load escalation context
    const escalation = await this.loadEscalationContext(negotiationId);
    if (!escalation) {
      throw new Error(`Escalation context not found for ${negotiationId}`);
    }

    // Gather decision-making context
    const context = await this.gatherContext(escalation.involvedAgentIds);

    // Decision-making algorithm
    const decision = this.decisionAlgorithm(escalation, context);

    // Store decision
    await withQueueConnection(async (client) => {
      const key = `ar:director:decision:${negotiationId}`;
      await client.set(key, JSON.stringify(decision), 'EX', 3600);
    });

    // Publish decision event
    await this.eventBus.publish({
      id: negotiationId,
      type: 'DIRECTOR_DECISION',
      agentId: 'ar-director',
      state: 'EXECUTING_DECISION',
      data: decision,
      priority: 'high',
      timestamp: new Date(),
    });

    logger.info('[AR-Director] Decision made', {
      negotiationId,
      decision: decision.decision,
      notifyAgents: decision.notifyAgents,
    });

    return decision;
  }

  /**
   * Gather contextual data for decision-making
   */
  async gatherContext(involvedAgentIds: string[]): Promise<DecisionContext> {
    const agentStates = await Promise.all(
      involvedAgentIds.map((agentId) => this.stateMachine.getState(agentId)),
    );

    // Placeholder workload data (would query from metrics in production)
    const workloadData: Record<string, number> = {};
    for (const agentId of involvedAgentIds) {
      workloadData[agentId] = Math.random() * 100; // Mock workload %
    }

    return {
      escalation: {} as EscalationContext, // Filled by caller
      agentStates,
      workloadData,
      organizationPriorities: [], // Would load from org settings
    };
  }

  /**
   * Execute a director decision
   */
  async executeDecision(decision: DirectorDecision): Promise<void> {
    // Transition involved agents to executing state
    for (const agentId of decision.notifyAgents) {
      await this.stateMachine.transition(agentId, 'DIRECTOR_DECISION_RECEIVED', {
        pendingDirectorDecisions: [],
      });
    }

    logger.info('[AR-Director] Decision executed', {
      negotiationId: decision.negotiationId,
      notifiedAgents: decision.notifyAgents.length,
    });
  }

  /**
   * Load escalation context from Redis
   */
  private async loadEscalationContext(negotiationId: string): Promise<EscalationContext | null> {
    return withQueueConnection(async (client) => {
      const key = `ar:escalation:${negotiationId}`;
      const cached = await client.get(key);
      return cached ? (JSON.parse(cached) as EscalationContext) : null;
    });
  }

  /**
   * Decision algorithm based on weighted factors
   */
  private decisionAlgorithm(escalation: EscalationContext, _context: DecisionContext): DirectorDecision {
    const { originalRequest, reason, responses } = escalation;

    // Simple decision logic (production would be more sophisticated)
    let decision: DirectorDecision['decision'];
    let rationale: string;

    if (reason === 'timeout') {
      // Default to approving original request on timeout
      decision = 'approve_original';
      rationale = 'Approved original request due to negotiation timeout';
    } else if (reason === 'rejected' && responses.length > 0) {
      // Check rejection reason
      decision = 'approve_original';
      rationale = `Approved original request despite rejection: ${responses[0].reason || 'no reason given'}`;
    } else {
      // Default override
      decision = 'override';
      rationale = 'Director override to resolve conflict';
    }

    return {
      negotiationId: originalRequest.id,
      directorId: 'ar-director-001',
      decision,
      rationale,
      decidedAt: new Date(),
      notifyAgents: escalation.involvedAgentIds,
    };
  }
}

// =============================================================================
// Main Coordination Engine - Orchestrates All Components
// =============================================================================

export class CoordinationEngine {
  private eventBus: ARCoordinationEventBus;
  private stateMachine: AgentCoordinationStateMachine;
  private negotiation: NegotiationService;
  private director: ARDirectorDecisionEngine;
  private started = false;

  constructor() {
    this.eventBus = new ARCoordinationEventBus();
    this.stateMachine = new AgentCoordinationStateMachine();
    this.negotiation = new NegotiationService(this.eventBus, this.stateMachine);
    this.director = new ARDirectorDecisionEngine(this.eventBus, this.stateMachine);
  }

  /**
   * Start the coordination engine
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn('[AR-CoordinationEngine] Already started');
      return;
    }

    await this.eventBus.start();

    // Register event handlers
    this.registerHandlers();

    this.started = true;
    logger.info('[AR-CoordinationEngine] Started successfully');
  }

  /**
   * Stop the coordination engine
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.eventBus.stop();
    this.started = false;
    logger.info('[AR-CoordinationEngine] Stopped');
  }

  /**
   * Handle incoming coordination event
   */
  async handleEvent(event: CoordinationEvent): Promise<void> {
    logger.debug('[AR-CoordinationEngine] Handling event', {
      type: event.type,
      agentId: event.agentId,
      priority: event.priority,
    });

    // Event-specific logic would go here
    // For now, events are handled by registered handlers
  }

  /**
   * Get public API for external use
   */
  getAPI() {
    return {
      eventBus: this.eventBus,
      stateMachine: this.stateMachine,
      negotiation: this.negotiation,
      director: this.director,
    };
  }

  /**
   * Register internal event handlers
   */
  private registerHandlers(): void {
    // Example: Log all events
    this.eventBus.subscribe('all', (event) => {
      logger.debug('[AR-CoordinationEngine] Event received', {
        type: event.type,
        agentId: event.agentId,
      });
    });

    // Handle TASK_BLOCKED events
    this.eventBus.subscribe('TASK_BLOCKED', async (event) => {
      logger.info('[AR-CoordinationEngine] Task blocked', {
        agentId: event.agentId,
        taskId: event.taskId,
        data: event.data,
      });
      // Could trigger auto-negotiation here
    });

    // Handle NEGOTIATION_REQUEST events
    this.eventBus.subscribe('NEGOTIATION_REQUEST', async (event) => {
      logger.info('[AR-CoordinationEngine] Negotiation request', {
        agentId: event.agentId,
        data: event.data,
      });
    });

    // Handle DIRECTOR_DECISION events
    this.eventBus.subscribe('DIRECTOR_DECISION', async (event) => {
      logger.info('[AR-CoordinationEngine] Director decision', {
        negotiationId: event.id,
        data: event.data,
      });
      // Execute decision
      await this.director.executeDecision(event.data as DirectorDecision);
    });
  }
}
