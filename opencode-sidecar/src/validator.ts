import { DelegateTaskRequest, ValidationError } from "./types";
import { VALID_CATEGORIES, VALID_SKILLS, REQUEST_LIMITS } from "./constants";

export function validateRequest(
  body: unknown,
): { valid: true; data: DelegateTaskRequest } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== "object") {
    return {
      valid: false,
      errors: [{ field: "body", message: "Request body must be a JSON object" }],
    };
  }

  const req = body as Partial<DelegateTaskRequest>;

  if (!req.category) {
    errors.push({ field: "category", message: "Category is required" });
  } else if (!VALID_CATEGORIES.includes(req.category as any)) {
    errors.push({
      field: "category",
      message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
    });
  }

  if (!Array.isArray(req.load_skills)) {
    errors.push({ field: "load_skills", message: "load_skills must be an array" });
  } else {
    if (req.load_skills.length > REQUEST_LIMITS.MAX_SKILLS) {
      errors.push({
        field: "load_skills",
        message: `Too many skills. Maximum ${REQUEST_LIMITS.MAX_SKILLS} allowed`,
      });
    }

    const invalidSkills = req.load_skills.filter((skill) => !VALID_SKILLS.includes(skill as any));
    if (invalidSkills.length > 0) {
      errors.push({
        field: "load_skills",
        message: `Invalid skills: ${invalidSkills.join(", ")}. Valid skills: ${VALID_SKILLS.join(", ")}`,
      });
    }
  }

  if (!req.prompt) {
    errors.push({ field: "prompt", message: "Prompt is required" });
  } else if (typeof req.prompt !== "string") {
    errors.push({ field: "prompt", message: "Prompt must be a string" });
  } else if (req.prompt.length === 0) {
    errors.push({ field: "prompt", message: "Prompt cannot be empty" });
  } else if (req.prompt.length > REQUEST_LIMITS.MAX_PROMPT_LENGTH) {
    errors.push({
      field: "prompt",
      message: `Prompt too long. Maximum ${REQUEST_LIMITS.MAX_PROMPT_LENGTH} characters`,
    });
  }

  if (!req.session_id) {
    errors.push({ field: "session_id", message: "Session ID is required" });
  } else if (typeof req.session_id !== "string") {
    errors.push({ field: "session_id", message: "Session ID must be a string" });
  } else if (!/^ses_[a-zA-Z0-9_]+$/.test(req.session_id)) {
    errors.push({
      field: "session_id",
      message: "Session ID must match pattern: ses_<timestamp>_<random>",
    });
  }

  if (req.context !== undefined) {
    if (typeof req.context !== "object" || req.context === null) {
      errors.push({ field: "context", message: "Context must be an object" });
    } else {
      const contextSize = JSON.stringify(req.context).length;
      if (contextSize > REQUEST_LIMITS.MAX_CONTEXT_SIZE) {
        errors.push({
          field: "context",
          message: `Context too large. Maximum ${REQUEST_LIMITS.MAX_CONTEXT_SIZE} bytes`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: req as DelegateTaskRequest };
}
