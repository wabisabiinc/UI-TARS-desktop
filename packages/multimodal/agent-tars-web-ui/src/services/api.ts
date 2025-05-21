import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';
import { Event, EventType, SessionInfo } from '../types';

// Base URL is hardcoded as per requirements
const BASE_URL = 'http://localhost:3000';

let socket: Socket | null = null;

// Initialize socket connection
const initializeSocket = (sessionId: string, onEvent: (event: Event) => void): Socket => {
  if (socket) {
    socket.disconnect();
  }

  socket = io(BASE_URL);

  socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('join-session', sessionId);
  });

  socket.on('agent-event', ({ type, data }) => {
    if (data) {
      onEvent(data);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  return socket;
};

// Create a new session
const createSession = async (): Promise<SessionInfo> => {
  try {
    const response = await fetch(`${BASE_URL}/api/sessions/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const { sessionId } = await response.json();
    return {
      id: sessionId,
      createdAt: new Date(),
      name: `Session ${new Date().toLocaleDateString()}`,
    };
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
};

// Send a query in streaming mode
const sendStreamingQuery = async (
  sessionId: string,
  query: string,
  onEvent: (event: Event) => void,
): Promise<void> => {
  try {
    const response = await fetch(`${BASE_URL}/api/sessions/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send query: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const eventData = JSON.parse(line.substring(6));
            onEvent(eventData);
          } catch (e) {
            console.error('Error parsing event data:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in streaming query:', error);
    throw error;
  }
};

// Send a query via socket
const sendSocketQuery = (sessionId: string, query: string): void => {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('send-query', { sessionId, query });
};

// Send a non-streaming query and get response
const sendQuery = async (sessionId: string, query: string): Promise<string> => {
  try {
    const response = await fetch(`${BASE_URL}/api/sessions/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send query: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error sending query:', error);
    throw error;
  }
};

// Abort a running query
const abortQuery = async (sessionId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}/api/sessions/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to abort query: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error aborting query:', error);
    throw error;
  }
};

// Socket-based abort
const abortSocketQuery = (sessionId: string): void => {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('abort-query', { sessionId });
};

// Disconnect socket when done
const disconnect = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const ApiService = {
  initializeSocket,
  createSession,
  sendStreamingQuery,
  sendSocketQuery,
  sendQuery,
  abortQuery,
  abortSocketQuery,
  disconnect,
};
