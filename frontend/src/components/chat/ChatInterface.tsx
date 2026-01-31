import { useState, useEffect, useRef } from 'react';
import { useSSE } from '../../hooks/useSSE';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ContextIndicator } from './ContextIndicator';
import { StreamingMessage } from './StreamingMessage';
import { ThinkingIndicator } from './ThinkingIndicator';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'agent' | 'system';
  timestamp: Date;
  isError?: boolean;
}

interface ConversationContext {
  workflows: Array<{ id: string; name: string }>;
  integrations: string[];
}

interface ChatInterfaceProps {
  conversationId?: string;
  onNewConversation?: () => void;
  onSendMessage?: (message: string) => Promise<void>;
}

/**
 * Full chat component with SSE integration
 * Handles message display, streaming, and user input
 */
export function ChatInterface({
  conversationId,
  onSendMessage,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [context] = useState<ConversationContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAgentTyping, streamingContent]);

  // SSE subscription with correct backend event names
  useSSE({
    onEvent: (sseEvent) => {
      const eventData = sseEvent.data as {
        sessionId: string;
        content?: string;
        isComplete?: boolean;
        error?: string;
        conversationId?: string;
      };

      // Filter by conversation ID if specified
      if (conversationId && eventData.conversationId !== conversationId) {
        return;
      }

      switch (sseEvent.type) {
        case 'orchestration:started':
          setIsAgentTyping(true);
          setStreamingContent('');
          break;

        case 'orchestration:message':
          // Append streaming content
          if (eventData.content) {
            setStreamingContent((prev) => prev + eventData.content);
          }
          break;

        case 'orchestration:completed':
          setIsAgentTyping(false);
          // Add completed message to history
          if (streamingContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: eventData.sessionId,
                content: streamingContent,
                role: 'agent',
                timestamp: new Date(),
              },
            ]);
            setStreamingContent('');
          }
          break;

        case 'orchestration:error':
          setIsAgentTyping(false);
          // Show error as message
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              content: eventData.error || 'An error occurred',
              role: 'system',
              timestamp: new Date(),
              isError: true,
            },
          ]);
          setStreamingContent('');
          break;
      }
    },
  });

  const handleSend = async () => {
    if (!input.trim() || isAgentTyping) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: input.trim(),
      role: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Call the onSendMessage callback if provided
    if (onSendMessage) {
      try {
        await onSendMessage(userMessage.content);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            content: 'Failed to send message. Please try again.',
            role: 'system',
            timestamp: new Date(),
            isError: true,
          },
        ]);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Context indicator */}
      <ContextIndicator context={context} />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isAgentTyping && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg font-medium mb-2">Start a conversation</p>
            <p className="text-sm">Send a message to begin</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Show streaming content */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-lg px-4 py-2 bg-gray-100 text-gray-900">
              <StreamingMessage content={streamingContent} isStreaming={true} />
            </div>
          </div>
        )}

        {isAgentTyping && !streamingContent && (
          <div className="flex justify-start">
            <ThinkingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <MessageInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isAgentTyping}
      />
    </div>
  );
}
