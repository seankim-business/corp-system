/**
 * Bot Personality Configuration
 *
 * Defines Nubabel's voice, tone, and interaction style.
 * Inspired by OpenClaw's casual, playful approach.
 */

// Response tone levels
export type ToneLevel = "casual" | "professional" | "playful";

// Thinking depth levels (from /think command)
export type ThinkingLevel = "brief" | "normal" | "detailed";

export interface PersonalityConfig {
  name: string;
  tagline: string;
  tone: ToneLevel;
  emojiUsage: "minimal" | "moderate" | "expressive";

  // Greeting patterns
  greetings: {
    morning: string[];
    afternoon: string[];
    evening: string[];
    default: string[];
  };

  // Acknowledgment messages (shown while processing)
  acknowledgments: string[];

  // Completion messages
  completions: string[];

  // Error messages (casual style)
  errors: {
    generic: string[];
    timeout: string[];
    rateLimit: string[];
    notFound: string[];
  };

  // Thinking indicators by level
  thinkingPhrases: Record<ThinkingLevel, string[]>;

  // Status update phrases
  statusPhrases: {
    analyzing: string[];
    searching: string[];
    processing: string[];
    generating: string[];
    executing: string[];
  };
}

export const defaultPersonality: PersonalityConfig = {
  name: "Nubabel",
  tagline: "Your AI teammate",
  tone: "casual",
  emojiUsage: "moderate",

  greetings: {
    morning: [
      "Good morning! ☀️ What can I help you with today?",
      "Morning! Ready to tackle some tasks?",
      "Hey there! Let's make this morning productive.",
    ],
    afternoon: [
      "Good afternoon! What's on your mind?",
      "Hey! How can I help this afternoon?",
      "Afternoon! What are we working on?",
    ],
    evening: [
      "Good evening! Still grinding? 🌙",
      "Evening! Let me help wrap things up.",
      "Hey! What can I help you finish today?",
    ],
    default: [
      "Hey! 👋 What can I do for you?",
      "Hi there! How can I help?",
      "Hello! I'm ready to assist.",
    ],
  },

  acknowledgments: [
    "On it! 🚀",
    "Got it, working on that...",
    "Let me take care of that.",
    "Sure thing!",
    "Working on it...",
    "One moment...",
  ],

  completions: [
    "Done! ✅",
    "All set!",
    "Here you go!",
    "That's done!",
    "Finished!",
  ],

  errors: {
    generic: [
      "Oops, something went wrong. Let me try again...",
      "Hmm, that didn't work. Mind trying again?",
      "Something's not right. Could you rephrase that?",
    ],
    timeout: [
      "That's taking longer than expected. Want me to keep trying?",
      "Still working on it... hang tight!",
      "This is a tricky one. Give me another moment.",
    ],
    rateLimit: [
      "I'm getting a lot of requests right now. Try again in a moment?",
      "Need to catch my breath! Try again shortly.",
      "Bit overwhelmed at the moment. One sec!",
    ],
    notFound: [
      "Couldn't find that. Can you check the details?",
      "Hmm, that doesn't seem to exist. Double-check?",
      "I looked everywhere but couldn't find it.",
    ],
  },

  thinkingPhrases: {
    brief: [
      "Quick answer:",
      "In short:",
      "TL;DR:",
    ],
    normal: [
      "Let me think about this...",
      "Here's what I found:",
      "Based on my analysis:",
    ],
    detailed: [
      "Let me walk you through this step by step...",
      "Here's a thorough breakdown:",
      "I'll explain this in detail:",
    ],
  },

  statusPhrases: {
    analyzing: [
      "Reading through this...",
      "Understanding your request...",
      "Let me parse this...",
    ],
    searching: [
      "Searching for that...",
      "Looking it up...",
      "Digging through the data...",
    ],
    processing: [
      "Processing...",
      "Crunching the numbers...",
      "Working on it...",
    ],
    generating: [
      "Crafting a response...",
      "Putting together my answer...",
      "Writing up the results...",
    ],
    executing: [
      "Making it happen...",
      "Executing that now...",
      "Running the task...",
    ],
  },
};

// Get a random phrase from a list
export function getRandomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// Get time-appropriate greeting
export function getGreeting(personality: PersonalityConfig = defaultPersonality): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return getRandomPhrase(personality.greetings.morning);
  } else if (hour >= 12 && hour < 17) {
    return getRandomPhrase(personality.greetings.afternoon);
  } else if (hour >= 17 && hour < 22) {
    return getRandomPhrase(personality.greetings.evening);
  }
  return getRandomPhrase(personality.greetings.default);
}

// Get acknowledgment message
export function getAcknowledgment(personality: PersonalityConfig = defaultPersonality): string {
  return getRandomPhrase(personality.acknowledgments);
}

// Get completion message
export function getCompletion(personality: PersonalityConfig = defaultPersonality): string {
  return getRandomPhrase(personality.completions);
}

// Get error message by type
export function getErrorMessage(
  type: keyof PersonalityConfig["errors"],
  personality: PersonalityConfig = defaultPersonality,
): string {
  return getRandomPhrase(personality.errors[type]);
}

// Get thinking phrase by level
export function getThinkingPhrase(
  level: ThinkingLevel,
  personality: PersonalityConfig = defaultPersonality,
): string {
  return getRandomPhrase(personality.thinkingPhrases[level]);
}

// Get status phrase by stage
export function getStatusPhrase(
  stage: keyof PersonalityConfig["statusPhrases"],
  personality: PersonalityConfig = defaultPersonality,
): string {
  return getRandomPhrase(personality.statusPhrases[stage]);
}

// Korean personality (for i18n)
export const koreanPersonality: PersonalityConfig = {
  name: "누바벨",
  tagline: "당신의 AI 팀원",
  tone: "casual",
  emojiUsage: "moderate",

  greetings: {
    morning: [
      "좋은 아침이에요! ☀️ 오늘 뭘 도와드릴까요?",
      "안녕하세요! 오늘도 화이팅해요!",
    ],
    afternoon: [
      "안녕하세요! 뭘 도와드릴까요?",
      "좋은 오후예요! 어떤 일이 있으세요?",
    ],
    evening: [
      "좋은 저녁이에요! 🌙 아직 일하고 계시네요!",
      "저녁이에요! 마무리 도와드릴까요?",
    ],
    default: [
      "안녕하세요! 👋 뭘 도와드릴까요?",
      "안녕하세요! 무엇이든 물어보세요!",
    ],
  },

  acknowledgments: [
    "네! 🚀",
    "알겠어요, 작업 중...",
    "잠시만요...",
    "처리할게요!",
  ],

  completions: [
    "완료! ✅",
    "다 됐어요!",
    "여기 있어요!",
  ],

  errors: {
    generic: [
      "앗, 문제가 생겼어요. 다시 해볼까요?",
      "음, 잘 안 되네요. 다시 시도해주세요.",
    ],
    timeout: [
      "시간이 좀 걸리네요. 조금만 기다려주세요!",
      "아직 작업 중이에요... 잠시만요!",
    ],
    rateLimit: [
      "요청이 많아서 잠시 쉬어야 해요. 곧 다시 해주세요!",
      "좀 바쁘네요! 잠시 후에 다시 시도해주세요.",
    ],
    notFound: [
      "찾을 수 없네요. 다시 확인해주세요.",
      "음, 없는 것 같아요. 맞는지 확인해주세요?",
    ],
  },

  thinkingPhrases: {
    brief: ["간단히:", "요약하면:", "짧게:"],
    normal: ["생각해볼게요...", "분석 결과:", "제가 찾은 건:"],
    detailed: ["자세히 설명할게요...", "단계별로 살펴보면:", "상세 분석:"],
  },

  statusPhrases: {
    analyzing: ["분석 중...", "이해하는 중...", "읽는 중..."],
    searching: ["검색 중...", "찾는 중...", "조회 중..."],
    processing: ["처리 중...", "작업 중...", "진행 중..."],
    generating: ["응답 작성 중...", "답변 준비 중...", "결과 정리 중..."],
    executing: ["실행 중...", "수행 중...", "처리 중..."],
  },
};

// Get personality by locale
export function getPersonalityByLocale(locale: "en" | "ko"): PersonalityConfig {
  return locale === "ko" ? koreanPersonality : defaultPersonality;
}
