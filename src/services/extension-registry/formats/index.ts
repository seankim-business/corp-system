export * from './types';
export * from './skill-md-parser';
export * from './yaml-parser';
export * from './openai-action-parser';

import { SkillFormatParser } from './types';
import { SkillMdParser } from './skill-md-parser';
import { YamlSkillParser } from './yaml-parser';
import { OpenAIActionParser } from './openai-action-parser';

const parsers: SkillFormatParser[] = [
  new SkillMdParser(),
  new OpenAIActionParser(),
  new YamlSkillParser(), // Fallback - should be last
];

export function detectAndParse(content: string) {
  for (const parser of parsers) {
    if (parser.canParse(content)) {
      return { parser: parser.format, ...parser.parse(content) };
    }
  }
  return { parser: 'unknown', success: false, errors: ['Unknown skill format'] };
}

export function getParser(format: string): SkillFormatParser | undefined {
  return parsers.find(p => p.format === format);
}
