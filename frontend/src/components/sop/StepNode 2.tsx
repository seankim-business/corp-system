import { useMemo } from "react";

export interface SOPStepData {
  id: string;
  name: string;
  description?: string;
  type: "automated" | "manual" | "approval_required";
  agent?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  timeout?: string;
  requires_approval?: boolean;
  approver?: string;
  assignee?: string;
  checklist?: string[];
  conditional?: { when: string };
  required_approvals?: string[];
}

interface StepNodeProps {
  step: SOPStepData;
  index: number;
  isSelected: boolean;
  isDragging?: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

const stepTypeConfig = {
  automated: {
    icon: "🤖",
    label: "Automated",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-300",
    textColor: "text-blue-700",
    selectedBorder: "border-blue-500",
  },
  manual: {
    icon: "👤",
    label: "Manual",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    textColor: "text-amber-700",
    selectedBorder: "border-amber-500",
  },
  approval_required: {
    icon: "✅",
    label: "Approval",
    bgColor: "bg-green-50",
    borderColor: "border-green-300",
    textColor: "text-green-700",
    selectedBorder: "border-green-500",
  },
};

export default function StepNode({
  step,
  index,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: StepNodeProps) {
  const config = useMemo(() => stepTypeConfig[step.type], [step.type]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`
        relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
        ${config.bgColor}
        ${isSelected ? config.selectedBorder + " ring-2 ring-offset-2 ring-indigo-300" : config.borderColor}
        ${isDragging ? "opacity-50 scale-95" : "opacity-100"}
        hover:shadow-md
        min-w-[180px] max-w-[220px]
      `}
    >
      {/* Step number badge */}
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gray-700 text-white text-xs flex items-center justify-center font-bold">
        {index + 1}
      </div>

      {/* Step type indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{config.icon}</span>
        <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
      </div>

      {/* Step name */}
      <h3 className="font-medium text-gray-900 text-sm truncate mb-1">{step.name}</h3>

      {/* Step details */}
      <div className="text-xs text-gray-500 space-y-0.5">
        {step.agent && (
          <p className="truncate">
            <span className="text-gray-400">agent:</span> {step.agent}
          </p>
        )}
        {step.tool && (
          <p className="truncate">
            <span className="text-gray-400">tool:</span> {step.tool}
          </p>
        )}
        {step.assignee && (
          <p className="truncate">
            <span className="text-gray-400">assignee:</span> {step.assignee}
          </p>
        )}
        {step.approver && (
          <p className="truncate">
            <span className="text-gray-400">approver:</span> {step.approver}
          </p>
        )}
        {step.timeout && (
          <p className="truncate">
            <span className="text-gray-400">timeout:</span> {step.timeout}
          </p>
        )}
      </div>

      {/* Conditional indicator */}
      {step.conditional && (
        <div className="mt-2 px-2 py-1 bg-purple-100 rounded text-xs text-purple-700 truncate">
          ⚡ Conditional
        </div>
      )}

      {/* Connection point */}
      <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full bg-gray-400 border-2 border-white" />
    </div>
  );
}
