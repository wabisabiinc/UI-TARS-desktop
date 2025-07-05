import { ChatSession } from '@renderer/components/LeftSidebar/type';
import { useAtom, atom } from 'jotai';
import { useCallback } from 'react';
import {
  createSession,
  deleteSession,
  getSessions,
  updateSession,
} from '@renderer/services/chatSessionStorage';
import { generateSessionTitle } from '@renderer/utils/sessionTitle';

const createAppAtoms = () => {
  const chatSessionsAtom = atom<ChatSession[]>([]);
  const currentSessionIdAtom = atom<string | null>(null);
  const initStateRefAtom = atom<{
    current: 'pending' | 'loading' | 'finished';
  }>({ current: 'pending' });
  return { chatSessionsAtom, currentSessionIdAtom, initStateRefAtom };
};

const appAtomsMap = new Map<string, ReturnType<typeof createAppAtoms>>();

export function useChatSessions({
  appId,
  origin,
  onSwitchSession,
}: {
  appId: string;
  origin?: string;
  onSwitchSession?: (session: ChatSession) => void | Promise<void>;
}) {
  if (!appAtomsMap.has(appId)) {
    appAtomsMap.set(appId, createAppAtoms());
  }
  const { chatSessionsAtom, currentSessionIdAtom, initStateRefAtom } =
    appAtomsMap.get(appId)!;

  const [chatSessions, setChatSessions] = useAtom(chatSessionsAtom);
  const [currentSessionId, setCurrentSessionId] = useAtom(currentSessionIdAtom);
  const [initStateRef] = useAtom(initStateRefAtom);

  const updateChatSession = useCallback(
    async (sessionId: string, data: Partial<ChatSession>) => {
      // name が空なら自動生成
      const name =
        data.name && data.name.trim()
          ? data.name.trim()
          : generateSessionTitle('');
      await updateSession(sessionId, { ...data, name });
      setChatSessions((s) =>
        s.map((sess) =>
          sess.id === sessionId ? { ...sess, ...data, name } : sess,
        ),
      );
    },
    [setChatSessions],
  );

  const updateCurrentSessionId = useCallback(
    async (id: string) => {
      setCurrentSessionId(id);
      localStorage.setItem(`${appId}-current-chat-session-id`, id);
      const sess = chatSessions.find((s) => s.id === id)!;
      await onSwitchSession?.(sess);
    },
    [appId, chatSessions, onSwitchSession],
  );

  const addNewSession = useCallback(
    async (data: Omit<ChatSession, 'id'> & { prompt?: string }) => {
      // prompt からタイトル自動生成
      let name = data.prompt?.trim()
        ? generateSessionTitle(data.prompt)
        : '新しいセッション';
      const newSess = await createSession({ ...data, name });
      setChatSessions((s) => [...s, newSess]);
      await updateCurrentSessionId(newSess.id!);
    },
    [setChatSessions, updateCurrentSessionId],
  );

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      setChatSessions((s) => s.filter((sess) => sess.id !== id));
      if (currentSessionId === id && chatSessions.length > 1) {
        const next = chatSessions.find((sess) => sess.id !== id)!;
        await updateCurrentSessionId(next.id!);
      }
    },
    [currentSessionId, chatSessions, updateCurrentSessionId],
  );

  const initializeSessions = useCallback(async () => {
    if (initStateRef.current !== 'pending') return;
    initStateRef.current = 'loading';

    const stored = localStorage.getItem(`${appId}-current-chat-session-id`);
    const list = await getSessions(appId);

    if (list.length) {
      setChatSessions(list);
      const toUse =
        stored && list.some((s) => s.id === stored) ? stored : list[0].id!;
      await updateCurrentSessionId(toUse);
    } else {
      const def = await createSession({
        appId,
        name: generateSessionTitle(''),
        messageCount: 0,
        origin,
      });
      setChatSessions([def]);
      await updateCurrentSessionId(def.id!);
    }

    initStateRef.current = 'finished';
  }, [appId, origin, setChatSessions, updateCurrentSessionId, initStateRef]);

  return {
    chatSessions,
    currentSessionId,
    updateChatSession,
    addNewSession,
    removeSession,
    initializeSessions,
  };
}
