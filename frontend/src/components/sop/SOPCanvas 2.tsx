import { useState, useRef, useCallback } from "react";
import StepNode, { SOPStepData } from "./StepNode";

interface SOPCanvasProps {
  steps: SOPStepData[];
  selectedStepIndex: number | null;
  onSelectStep: (index: number | null) => void;
  onReorderSteps: (fromIndex: number, toIndex: number) => void;
  onAddStep: (type: SOPStepData["type"]) => void;
}

export default function SOPCanvas({
  steps,
  selectedStepIndex,
  onSelectStep,
  onReorderSteps,
  onAddStep,
}: SOPCanvasProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      setDraggedIndex(index);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedIndex !== null && index !== draggedIndex) {
        setDropTargetIndex(index);
      }
    },
    [draggedIndex],
  );

  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
      if (!isNaN(fromIndex) && fromIndex !== targetIndex) {
        onReorderSteps(fromIndex, targetIndex);
      }
      setDraggedIndex(null);
      setDropTargetIndex(null);
    },
    [onReorderSteps],
  );

  const renderConnectionLine = (fromIndex: number) => {
    if (fromIndex >= steps.length - 1) return null;

    return (
      <div className="flex justify-center my-2">
        <div className="w-0.5 h-8 bg-gray-300" />
        <svg
          className="absolute"
          style={{ marginTop: "20px" }}
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <polygon points="6,12 0,0 12,0" fill="#D1D5DB" />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-auto" ref={canvasRef}>
      {/* Add Step Toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Add Step:</span>
          <button
            onClick={() => onAddStep("automated")}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
          >
            <span>🤖</span>
            <span>Automated</span>
          </button>
          <button
            onClick={() => onAddStep("manual")}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm hover:bg-amber-100 transition-colors"
          >
            <span>👤</span>
            <span>Manual</span>
          </button>
          <button
            onClick={() => onAddStep("approval_required")}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100 transition-colors"
          >
            <span>✅</span>
            <span>Approval</span>
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="p-8 min-h-[400px]">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium">No steps yet</p>
            <p className="text-sm">Click the buttons above to add steps to your SOP</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {steps.map((step, index) => (
              <div key={step.id + "-" + index}>
                {/* Drop zone indicator */}
                {dropTargetIndex === index && draggedIndex !== null && (
                  <div className="h-16 w-48 border-2 border-dashed border-indigo-400 bg-indigo-50 rounded-lg mb-4 flex items-center justify-center">
                    <span className="text-sm text-indigo-600">Drop here</span>
                  </div>
                )}

                <div
                  onDragOver={handleDragOver(index)}
                  onDrop={handleDrop(index)}
                >
                  <StepNode
                    step={step}
                    index={index}
                    isSelected={selectedStepIndex === index}
                    isDragging={draggedIndex === index}
                    onSelect={() => onSelectStep(index)}
                    onDragStart={handleDragStart(index)}
                    onDragEnd={handleDragEnd}
                  />
                </div>

                {renderConnectionLine(index)}
              </div>
            ))}

            {/* End drop zone */}
            {dropTargetIndex === steps.length && draggedIndex !== null && (
              <div
                className="h-16 w-48 border-2 border-dashed border-indigo-400 bg-indigo-50 rounded-lg flex items-center justify-center"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetIndex(steps.length);
                }}
                onDrop={handleDrop(steps.length)}
              >
                <span className="text-sm text-indigo-600">Drop here</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to deselect */}
      {selectedStepIndex !== null && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => onSelectStep(null)}
          style={{ pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
