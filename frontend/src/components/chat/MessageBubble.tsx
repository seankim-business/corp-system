import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'agent' | 'system';
  timestamp: Date;
  isError?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  className?: string;
}

/**
 * Individual message display component
 * Shows message content with appropriate styling based on role
 */
export function MessageBubble({ message, className = '' }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.isError || false;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className}`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-indigo-600 text-white'
            : isSystem
              ? 'bg-gray-100 text-gray-700'
              : isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-gray-100 text-gray-900'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-indigo-200' : isError ? 'text-red-500' : 'text-gray-500'
          }`}
        >
          {formatDistanceToNow(message.timestamp, { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}
