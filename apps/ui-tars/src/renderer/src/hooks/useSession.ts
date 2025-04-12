import { useState, useCallback, useEffect } from 'react';
import {
  sessionManager,
  type SessionItem,
  type SessionType,
  type SessionMetaInfo,
} from '../db/session';

export const useSession = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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
    async (
      name: string,
      type: SessionType,
      conversationId: string,
      meta: SessionMetaInfo = {},
    ) => {
      try {
        const newSession = await sessionManager.createSession(
          name,
          type,
          conversationId,
          meta,
        );
        setSessions((prev) => [...prev, newSession]);
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
      const success = await sessionManager.deleteSession(id);
      if (success) {
        setSessions((prev) => prev.filter((session) => session.id !== id));
      }
      return success;
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to delete session'),
      );
      return false;
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    createSession,
    updateSession,
    deleteSession,
    refreshSessions: fetchSessions,
  };
};
