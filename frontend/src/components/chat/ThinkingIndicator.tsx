// Animated "thinking" indicator with bouncing dots
// Shows when AI is processing

interface ThinkingIndicatorProps {
  className?: string;
}

export function ThinkingIndicator({ className }: ThinkingIndicatorProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-sm text-gray-500">Thinking</span>
      <div className="flex gap-1">
        {/* 3 dots with staggered bounce animation */}
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
