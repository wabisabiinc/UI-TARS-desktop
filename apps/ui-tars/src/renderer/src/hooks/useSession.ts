import { useState, useCallback, useEffect } from 'react';
import {
  sessionManager,
  type SessionItem,
  type SessionType,
  type SessionMetaInfo,
} from '@renderer/db/session';
import { chatManager } from '@renderer/db/chat';
import { Message } from '@ui-tars/shared/types';
import { api } from '@renderer/api';

export const useSession = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);

  /** ------- */
  /** 消息相关 */
  /** ------- */

  // 添加消息
  const addMessage = useCallback(async (message: Message) => {
    try {
      const newMessages = await chatManager.createSessionMessages(
        currentSessionId,
        message,
      );
      setChatMessages(newMessages);

      return newMessages;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to add message'));
      return null;
    }
  }, []);

  // 获取消息
  const getMessages = useCallback(async (sessionId: string) => {
    try {
      const messages = await chatManager.getSessionMessages(sessionId);
      setChatMessages(messages || []);

      return messages;
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch messages'),
      );

      return null;
    }
  }, []);

  // 更新消息
  const updateMessages = useCallback(async (messages: Message[]) => {
    try {
      const newMessages = await chatManager.updateSessionMessages(
        currentSessionId,
        messages,
      );
      setChatMessages(newMessages);

      return newMessages;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to add message'));
      return null;
    }
  }, []);

  // 删除消息
  const deleteMessages = useCallback(async () => {
    try {
      await chatManager.deleteSessionMessages(currentSessionId);
      setChatMessages([]);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to add message'));
      return false;
    }
  }, []);

  /** ---------- */
  /** 消息列表相关 */
  /** ---------- */

  // 获取所有会话
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const allSessions = await sessionManager.getAllSessions();
      setSessions(allSessions);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch sessions'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // 创建会话
  const createSession = useCallback(
    async (name: string, type: SessionType, meta: SessionMetaInfo = {}) => {
      try {
        const newSession = await sessionManager.createSession(name, type, meta);
        await api.clearHistory();

        setSessions((prev) => [...prev, newSession]);
        setCurrentSessionId(newSession.id);
        return newSession;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to create session'),
        );
        return null;
      }
    },
    [],
  );

  // 更新会话
  const updateSession = useCallback(
    async (
      id: string,
      updates: Partial<Pick<SessionItem, 'name' | 'meta'>>,
    ) => {
      try {
        const updatedSession = await sessionManager.updateSession(id, updates);
        if (updatedSession) {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === id ? updatedSession : session,
            ),
          );
        }
        return updatedSession;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to update session'),
        );
        return null;
      }
    },
    [],
  );

  // 删除会话
  const deleteSession = useCallback(async (id: string) => {
    try {
      await chatManager.deleteSessionMessages(id);
      const success = await sessionManager.deleteSession(id);
      if (success) {
        setSessions((prev) => prev.filter((session) => session.id !== id));

        if (currentSessionId === id) {
          setCurrentSessionId('');
          setChatMessages([]);
        }
      }
      return success;
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to delete session'),
      );
      return false;
    }
  }, []);

  const setActiveSession = useCallback(
    async (sessionId: string) => {
      setCurrentSessionId(sessionId);
      await getMessages(sessionId);
    },
    [getMessages],
  );

  // 初始加载
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    loading,
    error,
    currentSessionId,
    sessions,
    chatMessages,

    addMessage,
    updateMessages,
    deleteMessages, // 会话内删除记录

    setActiveSession,
    createSession,
    updateSession,
    deleteSession,
    refreshSessions: fetchSessions,
  };
};
