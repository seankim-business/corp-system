/**
 * EditDepartmentModal Component
 *
 * Modal for editing an existing department.
 */

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useUpdateDepartment, useUpdateDepartmentBudget } from "../../hooks/ar";
import type { ARDepartment, DepartmentStatus } from "../../types/ar";

interface EditDepartmentModalProps {
  department: ARDepartment;
  departments: ARDepartment[];
  onClose: () => void;
  onSuccess: () => void;
}

export function EditDepartmentModal({ department, departments, onClose, onSuccess }: EditDepartmentModalProps) {
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description || "");
  const [parentId, setParentId] = useState<string>(department.parentId || "");
  const [status, setStatus] = useState<DepartmentStatus>(department.status);
  const [budgetCents, setBudgetCents] = useState(department.budgetCents);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateDepartment();
  const updateBudgetMutation = useUpdateDepartmentBudget();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Department name is required");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: department.id,
        name: name.trim(),
        description: description.trim() || null,
        parentId: parentId || null,
        status,
      });

      if (budgetCents !== department.budgetCents) {
        await updateBudgetMutation.mutateAsync({
          id: department.id,
          budgetCents,
        });
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department");
    }
  };

  // Filter out self and descendants from parent options
  const getDescendantIds = (id: string): string[] => {
    const children = departments.filter(d => d.parentId === id);
    return [id, ...children.flatMap(c => getDescendantIds(c.id))];
  };
  const excludeIds = new Set(getDescendantIds(department.id));
  const availableParents = departments.filter(d => !excludeIds.has(d.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Department</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Department
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">None (Top Level)</option>
              {availableParents.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DepartmentStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Budget
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={budgetCents / 100}
                onChange={(e) => setBudgetCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending || updateBudgetMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateMutation.isPending || updateBudgetMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
