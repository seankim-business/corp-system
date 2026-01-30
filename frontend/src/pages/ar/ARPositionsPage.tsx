/**
 * ARPositionsPage
 *
 * Position management page with table view and skill requirements.
 */

import { useState } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BriefcaseIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  useARPositions,
  useARDepartments,
  useDeletePosition,
} from "../../hooks/ar";
import type { ARPosition, SkillLevel } from "../../types/ar";

const skillLevelColors: Record<SkillLevel, string> = {
  beginner: "bg-gray-100 text-gray-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
  expert: "bg-orange-100 text-orange-700",
};

export default function ARPositionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<ARPosition | null>(null);

  const { data: departmentsData } = useARDepartments({ status: "active" });
  const { data, isLoading } = useARPositions({
    status: statusFilter === "all" ? undefined : statusFilter,
    departmentId: departmentFilter === "all" ? undefined : departmentFilter,
    search: searchQuery || undefined,
  });

  const deleteMutation = useDeletePosition();

  const positions = data?.positions ?? [];
  const departments = departmentsData?.departments ?? [];
  const selectedPosition = positions.find(p => p.id === selectedId);

  const getDepartmentName = (deptId: string) => {
    return departments.find(d => d.id === deptId)?.name ?? "Unknown";
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      console.error("Failed to delete position:", error);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Positions</h1>
          <p className="text-gray-600">Define roles and skill requirements for agents</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          Add Position
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Departments</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Positions Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Capacity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-4">
                      <div className="animate-pulse h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : positions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <BriefcaseIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No positions found</p>
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      Create your first position
                    </button>
                  </td>
                </tr>
              ) : (
                positions.map(position => (
                  <tr
                    key={position.id}
                    onClick={() => setSelectedId(position.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedId === position.id ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{position.title}</div>
                      <div className="text-sm text-gray-500">{position.requiredSkills.length} skills required</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getDepartmentName(position.departmentId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        position.currentCount >= position.maxCapacity ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {position.currentCount}/{position.maxCapacity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        position.status === 'active' ? 'bg-green-100 text-green-700' :
                        position.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {position.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPosition(position);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${position.title}?`)) {
                            handleDelete(position.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Position Details */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>

          {selectedPosition ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Title</label>
                <p className="text-gray-900 font-medium">{selectedPosition.title}</p>
              </div>

              {selectedPosition.description && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
                  <p className="text-gray-700 text-sm">{selectedPosition.description}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Department</label>
                <p className="text-gray-700">{getDepartmentName(selectedPosition.departmentId)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Min Experience</label>
                <p className="text-gray-700">{selectedPosition.minExperience} years</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Required Skills</label>
                <div className="mt-1 space-y-2">
                  {selectedPosition.requiredSkills.length === 0 ? (
                    <p className="text-gray-500 text-sm">No skills defined</p>
                  ) : (
                    selectedPosition.requiredSkills.map((skill, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${skillLevelColors[skill.level]}`}>
                            {skill.level}
                          </span>
                          <span className="text-xs text-gray-400">({skill.weight}%)</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  onClick={() => setEditingPosition(selectedPosition)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${selectedPosition.title}?`)) {
                      handleDelete(selectedPosition.id);
                    }
                  }}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <BriefcaseIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Select a position to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* TODO: Add Create/Edit Position Modals */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Create Position</h2>
            <p className="text-gray-500 text-sm mb-4">Position creation modal coming soon.</p>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {editingPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Edit Position: {editingPosition.title}</h2>
            <p className="text-gray-500 text-sm mb-4">Position editing modal coming soon.</p>
            <button
              onClick={() => setEditingPosition(null)}
              className="w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
