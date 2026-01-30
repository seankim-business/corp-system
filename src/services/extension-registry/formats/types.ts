import { ExtensionDefinition } from '../types';

export interface ParseResult {
  success: boolean;
  definition?: Partial<ExtensionDefinition>;
  errors?: string[];
}

export interface SkillFormatParser {
  readonly format: string;
  canParse(content: string): boolean;
  parse(content: string): ParseResult;
}
