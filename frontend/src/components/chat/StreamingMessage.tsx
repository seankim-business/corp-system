import { useEffect, useState } from 'react';

// Displays message content with character-by-character streaming effect
// With cursor animation during streaming (matches plan section 8)

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  typingSpeed?: number; // ms between characters
  className?: string;
}

export function StreamingMessage({
  content,
  isStreaming,
  typingSpeed = 30,
  className
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);

  // Display content with typing effect
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      return;
    }

    let index = 0;
    const timer = setInterval(() => {
      if (index < content.length) {
        setDisplayedContent(content.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, typingSpeed);

    return () => clearInterval(timer);
  }, [content, isStreaming, typingSpeed]);

  // Cursor blink effect (530ms interval per plan)
  useEffect(() => {
    if (!isStreaming) {
      setCursorVisible(false);
      return;
    }

    const blink = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);

    return () => clearInterval(blink);
  }, [isStreaming]);

  return (
    <div className={`relative ${className || ''}`}>
      <span className="whitespace-pre-wrap">{displayedContent}</span>
      {isStreaming && cursorVisible && (
        <span className="inline-block w-0.5 h-5 bg-gray-800 ml-0.5 animate-pulse" />
      )}
    </div>
  );
}
