import { KeyboardEvent, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Message input component with send button
 * Supports Enter to send, Shift+Enter for new line
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="p-4 border-t bg-white">
      <div className="flex items-end gap-2 bg-gray-50 rounded-lg p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 focus:ring-0 text-gray-900 placeholder-gray-400 max-h-32 overflow-y-auto"
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-1 px-1">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
