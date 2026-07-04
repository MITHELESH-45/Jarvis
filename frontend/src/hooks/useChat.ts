import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { token } = useAuth();

  // Load full chat history from DB when the user logs in
  useEffect(() => {
    if (!token) {
      // User logged out — clear local messages
      setMessages([]);
      setHistoryLoaded(false);
      return;
    }

    const loadHistory = async () => {
      try {
        const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000').replace(/['"]/g, '');
        const res = await fetch(`${backendUrl}/api/chat/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: Array<{ id: number; sender: string; message: string; timestamp: string }> =
          await res.json();

        const restored: Message[] = data.map((m) => ({
          id: `hist-${m.id}`,
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.message,
        }));

        setMessages(restored);
      } catch (err) {
        console.error('[useChat] Failed to load history:', err);
      } finally {
        setHistoryLoaded(true);
      }
    };

    loadHistory();
  }, [token]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMessageId = Date.now().toString();
      const assistantMessageId = (Date.now() + 1).toString();

      // Immediately append user message
      setMessages((prev) => [...prev, { id: userMessageId, role: 'user', content }]);

      // Add placeholder for streaming assistant response
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true },
      ]);

      setIsLoading(true);

      try {
        const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000').replace(/['"]/g, '');
        const response = await fetch(`${backendUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: content }),
        });

        if (!response.ok) {
          throw new Error(`Server returned status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported by the browser.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let streamedContent = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedContent += chunk;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: streamedContent } : msg
            )
          );
        }

        // Finalize — mark streaming done
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
          )
        );
      } catch (error: any) {
        console.error('Chat error:', error);
        toast.error('Failed to communicate with Jarvis. Please try again.');

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: 'A network error occurred while communicating with the core systems.',
                  isStreaming: false,
                  isError: true,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const retryMessage = (failedContent: string) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      newMessages.splice(-2, 2);
      return newMessages;
    });
    sendMessage(failedContent);
  };

  const clearChat = () => setMessages([]);

  return {
    messages,
    isLoading,
    historyLoaded,
    sendMessage,
    retryMessage,
    clearChat,
  };
}
