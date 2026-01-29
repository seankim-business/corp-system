/**
 * ExecuteWorkflowModal Component
 * 
 * 기획:
 * - 워크플로우 실행 모달
 * - Input JSON 편집기 (optional)
 * - 실행 버튼
 * - 실행 중 로딩 표시
 * - 실행 완료 후 결과 표시
 * 
 * 구조:
 * ExecuteWorkflowModal
 * ├── Overlay (클릭 시 닫기)
 * ├── Modal
 * │   ├── Header (제목 + 닫기 버튼)
 * │   ├── Body
 * │   │   ├── InputEditor (JSON textarea)
 * │   │   └── StatusMessage
 * │   └── Footer
 * │       ├── CancelButton
 * │       └── ExecuteButton
 * 
 * 상태:
 * - idle: 입력 대기
 * - executing: 실행 중
 * - success: 성공
 * - error: 실패
 */

import { useState } from "react";
import { ApiError, request } from "../api/client";

interface ExecuteWorkflowModalProps {
  workflowId: string;
  workflowName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ExecuteWorkflowModal({
  workflowId,
  workflowName,
  isOpen,
  onClose,
  onSuccess,
}: ExecuteWorkflowModalProps) {
  const [inputData, setInputData] = useState('{}');
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleExecute = async () => {
    setStatus('executing');
    setErrorMessage('');

    try {
      let parsedInput = {};
      if (inputData.trim()) {
        parsedInput = JSON.parse(inputData);
      }

      await request<{ execution: unknown }>({
        url: `/api/workflows/${workflowId}/execute`,
        method: "POST",
        data: { inputData: parsedInput },
      });

      setStatus("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setErrorMessage("Invalid JSON format");
      } else if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Execution failed");
      }
      setStatus("error");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 flex items-center justify-center z-50 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Execute: {workflowName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Data (JSON)
            </label>
            <textarea
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              disabled={status === 'executing'}
              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
              placeholder='{"key": "value"}'
            />

            {status === 'executing' && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
                <span className="text-blue-800">Executing workflow...</span>
              </div>
            )}

            {status === 'success' && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-green-800">Workflow executed successfully!</span>
              </div>
            )}

            {status === 'error' && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-red-800">{errorMessage}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={status === 'executing'}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExecute}
              disabled={status === 'executing' || status === 'success'}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'executing' ? 'Executing...' : 'Execute'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
