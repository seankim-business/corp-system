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
  useCreatePosition,
  useUpdatePosition,
} from "../../hooks/ar";
import type { ARPosition, SkillLevel, CreatePositionInput, RequiredSkill, PositionStatus } from "../../types/ar";

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

  // Form state for create/edit
  const [formData, setFormData] = useState<CreatePositionInput>({
    title: "",
    departmentId: "",
    description: "",
    requiredSkills: [],
    minExperience: 0,
    maxCapacity: 1,
    status: "active",
  });
  const [newSkill, setNewSkill] = useState<RequiredSkill>({ name: "", level: "intermediate", weight: 50 });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: departmentsData } = useARDepartments({ status: "active" });
  const createMutation = useCreatePosition();
  const updateMutation = useUpdatePosition();
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

  const resetForm = () => {
    setFormData({
      title: "",
      departmentId: "",
      description: "",
      requiredSkills: [],
      minExperience: 0,
      maxCapacity: 1,
      status: "active",
    });
    setNewSkill({ name: "", level: "intermediate", weight: 50 });
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const openEditModal = (position: ARPosition) => {
    setFormData({
      title: position.title,
      departmentId: position.departmentId,
      description: position.description || "",
      requiredSkills: position.requiredSkills,
      minExperience: position.minExperience,
      maxCapacity: position.maxCapacity,
      status: position.status,
      reportsTo: position.reportsTo || undefined,
    });
    setEditingPosition(position);
  };

  const addSkill = () => {
    if (!newSkill.name.trim()) return;
    setFormData(prev => ({
      ...prev,
      requiredSkills: [...(prev.requiredSkills || []), newSkill],
    }));
    setNewSkill({ name: "", level: "intermediate", weight: 50 });
  };

  const removeSkill = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: (prev.requiredSkills || []).filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!formData.departmentId) {
      setFormError("Department is required");
      return;
    }

    try {
      if (editingPosition) {
        await updateMutation.mutateAsync({ id: editingPosition.id, ...formData });
        setEditingPosition(null);
      } else {
        await createMutation.mutateAsync(formData);
        setIsCreateModalOpen(false);
      }
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save position");
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
          onClick={openCreateModal}
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
                      onClick={openCreateModal}
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
                          openEditModal(position);
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
                  onClick={() => openEditModal(selectedPosition)}
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

      {/* Create/Edit Position Modal */}
      {(isCreateModalOpen || editingPosition) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingPosition ? `Edit Position: ${editingPosition.title}` : "Create Position"}
              </h2>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingPosition(null);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Senior Developer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData(prev => ({ ...prev, departmentId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select department...</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Position responsibilities..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Min Experience & Max Capacity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Experience (years)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minExperience || 0}
                    onChange={(e) => setFormData(prev => ({ ...prev, minExperience: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxCapacity || 1}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxCapacity: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status || "active"}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as PositionStatus }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Required Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>

                {/* Existing skills */}
                {formData.requiredSkills && formData.requiredSkills.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formData.requiredSkills.map((skill, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${skillLevelColors[skill.level]}`}>
                            {skill.level}
                          </span>
                          <span className="text-xs text-gray-400">({skill.weight}%)</span>
                          <button
                            type="button"
                            onClick={() => removeSkill(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new skill */}
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Skill name"
                    className="col-span-2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={newSkill.level}
                    onChange={(e) => setNewSkill(prev => ({ ...prev, level: e.target.value as SkillLevel }))}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                  <button
                    type="button"
                    onClick={addSkill}
                    className="px-2 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingPosition(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingPosition
                    ? "Update Position"
                    : "Create Position"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
