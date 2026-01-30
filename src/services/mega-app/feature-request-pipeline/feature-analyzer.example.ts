/**
 * Feature Analyzer Agent - Usage Example
 *
 * This file demonstrates how to use the FeatureAnalyzerAgent.
 */

import { FeatureAnalyzerAgent } from './feature-analyzer.agent';

async function analyzeFeatureRequestExample() {
  // Initialize agent for an organization
  const organizationId = 'example-org-uuid';
  const analyzer = new FeatureAnalyzerAgent(organizationId);

  // Example 1: Analyze a Slack message request
  const slackAnalysis = await analyzer.analyze({
    rawContent: '우리 팀에서 새 상품 기획할 때 시즌별 트렌드 분석이 너무 오래 걸려요. 자동으로 시장 데이터 보여주면 좋을 것 같아요.',
    source: 'slack',
    requesterId: 'user-uuid',
    organizationId,
    moduleContext: 'fashion-research',
    sourceMetadata: {
      channelId: 'C1234567890',
      messageTs: '1234567890.123456',
      threadContext: [],
    },
  });

  console.log('Analysis Result:', {
    coreIntent: slackAnalysis.coreIntent,
    specificFeature: slackAnalysis.specificFeature,
    confidence: slackAnalysis.confidence,
    suggestedPriority: slackAnalysis.suggestedPriority,
    relatedModules: slackAnalysis.relatedModules,
  });

  // Example 2: Map to relevant modules
  const moduleMappings = await analyzer.mapToModules(slackAnalysis);

  console.log('Module Mappings:', moduleMappings);

  // Example 3: Assess priority
  const priorityCalc = await analyzer.assessPriority(
    slackAnalysis,
    5, // 5 duplicate requests
    'Manager', // Requester role
  );

  console.log('Priority Calculation:', {
    priority: priorityCalc.priority,
    businessImpact: priorityCalc.businessImpact,
    score: priorityCalc.score,
    factors: priorityCalc.factors.map((f) => ({
      name: f.name,
      contribution: f.contribution,
      reason: f.reason,
    })),
  });

  // Example 4: Generate clarification questions if needed
  if (slackAnalysis.clarificationNeeded) {
    const questions = analyzer.generateClarificationQuestions(slackAnalysis);
    console.log('Clarification Questions:', questions);
  }
}

// Example usage in a pipeline service
async function fullPipelineExample() {
  const organizationId = 'example-org-uuid';
  const analyzer = new FeatureAnalyzerAgent(organizationId);

  // Step 1: Analyze the request
  const analysis = await analyzer.analyze({
    rawContent: 'We need a feature to automatically tag products based on their images.',
    source: 'web',
    requesterId: 'user-uuid',
    organizationId,
  });

  // Step 2: Map to modules
  const modules = await analyzer.mapToModules(analysis);

  // Step 3: Assess priority
  const priority = await analyzer.assessPriority(analysis, 1);

  // Step 4: Save to database (would be done by intake service)
  console.log('Ready to save:', {
    rawContent: 'We need a feature to automatically tag products based on their images.',
    analyzedIntent: analysis.coreIntent,
    relatedModules: modules.map((m) => m.moduleId),
    priority: priority.priority,
    businessImpact: priority.businessImpact,
    status: analysis.clarificationNeeded ? 'analyzing' : 'backlog',
  });
}

// Export examples for documentation
export { analyzeFeatureRequestExample, fullPipelineExample };
