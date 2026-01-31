import { useEffect, useState } from 'react';

interface UseTypingEffectReturn {
  displayText: string;
  isTyping: boolean;
}

/**
 * Hook for human-delay pacing of text display
 * Simulates natural typing speed with variance
 */
export function useTypingEffect(text: string, speed: number = 50): UseTypingEffectReturn {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setIsTyping(true);
    setDisplayText('');

    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        // Natural variation in typing speed (30-70ms default, adjusted by speed parameter)
        const variance = Math.random() * 40 - 20;
        const actualSpeed = Math.max(10, speed + variance);

        setDisplayText(text.slice(0, i + 1));
        i++;

        // Longer pause at punctuation (200ms)
        if ('.!?'.includes(text[i - 1])) {
          clearInterval(interval);
          setTimeout(() => {
            const newInterval = setInterval(() => {
              if (i < text.length) {
                setDisplayText(text.slice(0, i + 1));
                i++;
              } else {
                setIsTyping(false);
                clearInterval(newInterval);
              }
            }, actualSpeed);
          }, 200);
        }
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayText, isTyping };
}
