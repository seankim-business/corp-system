import { Skill } from "./types";

export function selectSkills(userRequest: string): Skill[] {
  const text = userRequest.toLowerCase();
  const skills: Skill[] = [];

  if (
    text.includes("task") ||
    text.includes("태스크") ||
    text.includes("workflow") ||
    text.includes("워크플로우") ||
    text.includes("project") ||
    text.includes("프로젝트") ||
    text.includes("document") ||
    text.includes("문서") ||
    text.includes("database") ||
    text.includes("데이터")
  ) {
    skills.push("mcp-integration");
  }

  if (
    text.includes("스크린샷") ||
    text.includes("screenshot") ||
    text.includes("브라우저") ||
    text.includes("browser") ||
    text.includes("웹페이지") ||
    text.includes("webpage") ||
    text.includes("캡처") ||
    text.includes("capture")
  ) {
    skills.push("playwright");
  }

  if (
    text.includes("커밋") ||
    text.includes("commit") ||
    text.includes("git") ||
    text.includes("push") ||
    text.includes("pull") ||
    text.includes("리베이스") ||
    text.includes("rebase") ||
    text.includes("merge")
  ) {
    skills.push("git-master");
  }

  if (
    text.includes("디자인") ||
    text.includes("design") ||
    text.includes("UI") ||
    text.includes("UX") ||
    text.includes("프론트엔드") ||
    text.includes("frontend") ||
    text.includes("컴포넌트") ||
    text.includes("component") ||
    text.includes("스타일") ||
    text.includes("style")
  ) {
    skills.push("frontend-ui-ux");
  }

  return Array.from(new Set(skills));
}
