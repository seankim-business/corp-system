/**
 * OKRPage
 *
 * OKR (Objectives and Key Results) dashboard
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface KeyResult {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  unit: string;
}

interface Objective {
  id: string;
  title: string;
  description?: string;
  progress: number;
  keyResults: KeyResult[];
  owner: string;
  dueDate?: string;
}

export default function OKRPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOKRs = async () => {
      try {
        const data = await request<{ objectives: Objective[] }>({
          url: "/api/okrs",
          method: "GET",
        });
        setObjectives(data.objectives || []);
      } catch (error) {
        console.error("Failed to fetch OKRs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOKRs();
  }, []);

  const getProgressColor = (progress: number) => {
    if (progress >= 70) return "bg-green-500";
    if (progress >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading OKRs...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OKRs</h1>
          <p className="text-gray-600">Track objectives and key results</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
          New Objective
        </button>
      </div>

      {objectives.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No OKRs yet
            </h2>
            <p className="text-gray-600">
              Create your first objective to start tracking progress
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {objectives.map((objective) => (
            <div key={objective.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {objective.title}
                  </h3>
                  {objective.description && (
                    <p className="text-gray-600 mt-1">{objective.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    Owner: {objective.owner}
                    {objective.dueDate &&
                      ` | Due: ${new Date(objective.dueDate).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-gray-900">
                    {objective.progress}%
                  </span>
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full ${getProgressColor(
                    objective.progress
                  )}`}
                  style={{ width: `${objective.progress}%` }}
                />
              </div>

              {objective.keyResults.length > 0 && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-gray-500 uppercase">
                    Key Results
                  </h4>
                  {objective.keyResults.map((kr) => {
                    const krProgress =
                      kr.targetValue > 0
                        ? Math.round((kr.currentValue / kr.targetValue) * 100)
                        : 0;
                    return (
                      <div key={kr.id} className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-gray-700">{kr.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${getProgressColor(
                                  krProgress
                                )}`}
                                style={{ width: `${Math.min(krProgress, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {kr.currentValue}/{kr.targetValue} {kr.unit}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
