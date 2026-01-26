import { Skill } from "./types";
import { logger } from "../utils/logger";

export interface SkillScore {
  skill: Skill;
  score: number;
  matchedKeywords: string[];
}

export interface SkillSelection {
  skills: Skill[];
  scores: SkillScore[];
  dependencies: Skill[];
  conflicts: string[];
}

const SKILL_KEYWORDS: Record<Skill, string[]> = {
  "mcp-integration": [
    "task",
    "태스크",
    "workflow",
    "워크플로우",
    "project",
    "프로젝트",
    "document",
    "문서",
    "database",
    "데이터",
    "notion",
    "노션",
    "linear",
    "리니어",
    "jira",
    "지라",
    "asana",
    "trello",
    "integration",
    "연동",
  ],
  playwright: [
    "스크린샷",
    "screenshot",
    "브라우저",
    "browser",
    "웹페이지",
    "webpage",
    "캡처",
    "capture",
    "automation",
    "자동화",
    "test",
    "테스트",
    "scrape",
    "크롤링",
  ],
  "git-master": [
    "커밋",
    "commit",
    "git",
    "push",
    "pull",
    "리베이스",
    "rebase",
    "merge",
    "머지",
    "branch",
    "브랜치",
    "conflict",
    "충돌",
    "history",
    "이력",
  ],
  "frontend-ui-ux": [
    "디자인",
    "design",
    "UI",
    "UX",
    "프론트엔드",
    "frontend",
    "컴포넌트",
    "component",
    "스타일",
    "style",
    "react",
    "리액트",
    "vue",
    "뷰",
    "css",
    "layout",
    "레이아웃",
    "responsive",
    "반응형",
  ],
};

const SKILL_DEPENDENCIES: Record<Skill, Skill[]> = {
  "frontend-ui-ux": ["playwright"],
  playwright: [],
  "git-master": [],
  "mcp-integration": [],
};

const SKILL_CONFLICTS: [Skill, Skill, string][] = [];

const SKILL_PRIORITY: Record<Skill, number> = {
  "git-master": 100,
  "mcp-integration": 80,
  "frontend-ui-ux": 60,
  playwright: 40,
};

function scoreSkill(text: string, skill: Skill): SkillScore {
  const keywords = SKILL_KEYWORDS[skill];
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      score++;
    }
  }

  return {
    skill,
    score,
    matchedKeywords,
  };
}

function resolveDependencies(skills: Skill[]): Skill[] {
  const resolved = new Set<Skill>(skills);

  for (const skill of skills) {
    const deps = SKILL_DEPENDENCIES[skill] || [];
    for (const dep of deps) {
      resolved.add(dep);
    }
  }

  return Array.from(resolved);
}

function detectConflicts(skills: Skill[]): string[] {
  const conflicts: string[] = [];
  const skillSet = new Set(skills);

  for (const [skill1, skill2, reason] of SKILL_CONFLICTS) {
    if (skillSet.has(skill1) && skillSet.has(skill2)) {
      conflicts.push(`Conflict between ${skill1} and ${skill2}: ${reason}`);
    }
  }

  return conflicts;
}

function sortByPriority(skills: Skill[]): Skill[] {
  return skills.sort((a, b) => {
    const priorityA = SKILL_PRIORITY[a] || 0;
    const priorityB = SKILL_PRIORITY[b] || 0;
    return priorityB - priorityA;
  });
}

export function selectSkillsEnhanced(
  userRequest: string,
  options: { minScore?: number; includeDependencies?: boolean } = {},
): SkillSelection {
  const { minScore = 1, includeDependencies = true } = options;
  const text = userRequest.toLowerCase();

  const scores: SkillScore[] = (Object.keys(SKILL_KEYWORDS) as Skill[])
    .map((skill) => scoreSkill(text, skill))
    .filter((score) => score.score >= minScore);

  let selectedSkills = scores.map((s) => s.skill);

  const dependencies: Skill[] = [];
  if (includeDependencies) {
    const withDeps = resolveDependencies(selectedSkills);
    const addedDeps = withDeps.filter((s) => !selectedSkills.includes(s));
    dependencies.push(...addedDeps);
    selectedSkills = withDeps;
  }

  const conflicts = detectConflicts(selectedSkills);
  if (conflicts.length > 0) {
    conflicts.forEach((conflict) => {
      logger.warn("Skill conflict detected", { conflict });
    });
  }

  selectedSkills = sortByPriority(selectedSkills);

  return {
    skills: selectedSkills,
    scores,
    dependencies,
    conflicts,
  };
}

export function selectSkills(userRequest: string): Skill[] {
  return selectSkillsEnhanced(userRequest).skills;
}
