/**
 * AR Templates Module
 *
 * Industry templates, team composition, and recommendation engine.
 */

export {
  TemplateMatcherService,
  templateMatcherService,
  type OrganizationProfile,
  type TemplateMatchScore,
  type MatchResult,
} from './template-matcher.service';

export {
  TeamComposerService,
  teamComposerService,
  type TeamCompositionRequest,
  type AgentCandidate,
  type PositionAssignment,
  type SkillGap,
  type TeamComposition,
} from './team-composer.service';

export {
  RecommendationEngineService,
  recommendationEngineService,
  type RecommendationType,
  type Recommendation,
  type RecommendedAction,
  type RecommendationContext,
  type RecommendationResult,
} from './recommendation-engine.service';
