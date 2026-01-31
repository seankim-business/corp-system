import { XMarkIcon } from '@heroicons/react/24/outline';

interface WorkflowContext {
  id: string;
  name: string;
}

interface ConversationContext {
  workflows: WorkflowContext[];
  integrations: string[];
}

interface ContextIndicatorProps {
  context: ConversationContext | null;
  onRemoveWorkflow?: (workflowId: string) => void;
  onRemoveIntegration?: (integration: string) => void;
}

/**
 * Session context display component
 * Shows active workflows and integrations in the conversation
 */
export function ContextIndicator({
  context,
  onRemoveWorkflow,
  onRemoveIntegration,
}: ContextIndicatorProps) {
  if (!context || (context.workflows.length === 0 && context.integrations.length === 0)) {
    return null;
  }

  return (
    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-indigo-600 font-medium">Context:</span>

      {context.workflows.map((workflow) => (
        <span
          key={workflow.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-indigo-700 border border-indigo-200"
        >
          {workflow.name}
          {onRemoveWorkflow && (
            <button
              onClick={() => onRemoveWorkflow(workflow.id)}
              className="text-indigo-500 hover:text-indigo-700"
              aria-label={`Remove ${workflow.name} from context`}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {context.integrations.map((integration) => (
        <span
          key={integration}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 rounded text-indigo-600"
        >
          {integration}
          {onRemoveIntegration && (
            <button
              onClick={() => onRemoveIntegration(integration)}
              className="text-indigo-500 hover:text-indigo-700"
              aria-label={`Remove ${integration} from context`}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
