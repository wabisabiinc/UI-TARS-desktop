/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { EventStream as EventStreamImpl } from '../stream/event-stream';
import { ConsoleLogger } from '@agent-infra/logger';
import { AgentRunOptions, AgentRunObjectOptions, isAgentRunObjectOptions } from '../types';

/**
 * Status of an agent execution session
 */
export enum SessionStatus {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  FAILED = 'failed',
}

/**
 * Represents an agent execution session with its own isolated state
 */
export interface Session {
  /**
   * Unique ID for this execution session
   */
  id: string;

  /**
   * Current status of the session
   */
  status: SessionStatus;

  /**
   * Timestamp when the session was created
   */
  createdAt: number;

  /**
   * Timestamp when the session was last updated
   */
  updatedAt: number;

  /**
   * Run options for this session
   */
  runOptions: AgentRunObjectOptions;

  /**
   * Dedicated event stream for this session
   */
  eventStream: EventStreamImpl;

  /**
   * AbortController for this session
   */
  abortController: AbortController;
}

/**
 * Session result containing the outcome or error of a session
 */
export interface SessionResult<T> {
  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Session status
   */
  status: SessionStatus;

  /**
   * Session result value (if successful)
   */
  value?: T;

  /**
   * Error (if failed)
   */
  error?: Error;
}

/**
 * Manages concurrent agent execution sessions
 *
 * This class is responsible for:
 * 1. Creating new isolated sessions for each agent run
 * 2. Managing the lifecycle of sessions
 * 3. Providing abort capability for running sessions
 * 4. Tracking sessions and their status
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private logger: ConsoleLogger;

  constructor(logger: ConsoleLogger) {
    this.logger = logger;
  }

  /**
   * Creates a new session with a dedicated event stream
   *
   * @param options Run options for the session
   * @returns The created session
   */
  createSession(options: AgentRunOptions): Session {
    // Normalize options to object form
    const normalizedOptions = isAgentRunObjectOptions(options) ? options : { input: options };

    // Generate session ID
    const sessionId = normalizedOptions.sessionId || uuidv4();

    // Create dedicated event stream for this session
    const eventStream = new EventStreamImpl();

    // Create abort controller
    const abortController = new AbortController();

    const session: Session = {
      id: sessionId,
      status: SessionStatus.CREATED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runOptions: {
        ...normalizedOptions,
        sessionId,
      },
      eventStream,
      abortController,
    };

    this.sessions.set(sessionId, session);
    this.logger.info(`[SessionManager] Created session ${sessionId}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update a session's status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.updatedAt = Date.now();
      this.logger.info(`[SessionManager] Updated session ${sessionId} status to ${status}`);
    }
  }

  /**
   * Abort a running session
   *
   * @param sessionId ID of the session to abort
   * @returns true if session was aborted, false if not found or already completed
   */
  abortSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[SessionManager] Cannot abort session ${sessionId}: not found`);
      return false;
    }

    if (session.status !== SessionStatus.RUNNING) {
      this.logger.warn(
        `[SessionManager] Cannot abort session ${sessionId}: status is ${session.status}`,
      );
      return false;
    }

    try {
      // Signal abort to all listeners
      session.abortController.abort(new Error('Session aborted by user'));
      this.updateSessionStatus(sessionId, SessionStatus.ABORTED);
      this.logger.info(`[SessionManager] Aborted session ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`[SessionManager] Error aborting session ${sessionId}: ${error}`);
      return false;
    }
  }

  /**
   * Cleanup completed sessions to prevent memory leaks
   *
   * @param maxAge Maximum age in milliseconds to keep completed sessions
   */
  cleanupSessions(maxAge: number = 30 * 60 * 1000): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // Only clean up completed, aborted or failed sessions
      if (
        session.status === SessionStatus.COMPLETED ||
        session.status === SessionStatus.ABORTED ||
        session.status === SessionStatus.FAILED
      ) {
        if (now - session.updatedAt > maxAge) {
          this.sessions.delete(sessionId);
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      this.logger.info(`[SessionManager] Cleaned up ${removedCount} completed sessions`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.status === SessionStatus.RUNNING,
    );
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.getActiveSessions().length;
  }
}
