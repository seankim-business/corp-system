/**
 * ARDepartmentsPage
 *
 * Department management page with hierarchical tree view.
 */

import { useState } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  useARDepartments,
  useDeleteDepartment,
} from "../../hooks/ar";
import type { ARDepartment } from "../../types/ar";
import { CreateDepartmentModal } from "../../components/ar/CreateDepartmentModal";
import { EditDepartmentModal } from "../../components/ar/EditDepartmentModal";

interface TreeNodeProps {
  department: ARDepartment;
  allDepartments: ARDepartment[];
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (dept: ARDepartment) => void;
  onDelete: (id: string) => void;
}

function DepartmentTreeNode({
  department,
  allDepartments,
  level,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const children = allDepartments.filter(d => d.parentId === department.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === department.id;

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
          transition-colors group
          ${isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'}
        `}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => onSelect(department.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {isExpanded ? (
          <FolderOpenIcon className="h-5 w-5 text-indigo-500" />
        ) : (
          <FolderIcon className="h-5 w-5 text-gray-400" />
        )}

        <span className={`flex-1 font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
          {department.name}
        </span>

        <span className={`text-xs px-2 py-0.5 rounded-full ${
          department.status === 'active' ? 'bg-green-100 text-green-700' :
          department.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {department.status}
        </span>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(department);
            }}
            className="p-1 hover:bg-gray-200 rounded"
            title="Edit"
          >
            <PencilIcon className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete ${department.name}?`)) {
                onDelete(department.id);
              }
            }}
            className="p-1 hover:bg-red-100 rounded"
            title="Delete"
          >
            <TrashIcon className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {children.map(child => (
            <DepartmentTreeNode
              key={child.id}
              department={child}
              allDepartments={allDepartments}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ARDepartmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<ARDepartment | null>(null);

  const { data, isLoading, refetch } = useARDepartments({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchQuery || undefined,
  });

  const deleteMutation = useDeleteDepartment();

  const departments = data?.departments ?? [];
  const rootDepartments = departments.filter(d => !d.parentId);
  const selectedDepartment = departments.find(d => d.id === selectedId);

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      console.error("Failed to delete department:", error);
    }
  };

  const formatBudget = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Departments</h1>
          <p className="text-gray-600">Manage your organization's department structure</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          Add Department
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search departments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
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
        {/* Department Tree */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Department Tree</h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-2 p-2">
                  <div className="h-5 w-5 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : rootDepartments.length > 0 ? (
            <div className="space-y-1">
              {rootDepartments.map(dept => (
                <DepartmentTreeNode
                  key={dept.id}
                  department={dept}
                  allDepartments={departments}
                  level={0}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onEdit={setEditingDepartment}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No departments found</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm"
              >
                Create your first department
              </button>
            </div>
          )}
        </div>

        {/* Department Details */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>

          {selectedDepartment ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</label>
                <p className="text-gray-900 font-medium">{selectedDepartment.name}</p>
              </div>

              {selectedDepartment.description && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
                  <p className="text-gray-700 text-sm">{selectedDepartment.description}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</label>
                <p className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                  selectedDepartment.status === 'active' ? 'bg-green-100 text-green-700' :
                  selectedDepartment.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {selectedDepartment.status}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</label>
                <p className="text-gray-900 font-medium">{formatBudget(selectedDepartment.budgetCents)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-departments</label>
                <p className="text-gray-700">
                  {departments.filter(d => d.parentId === selectedDepartment.id).length}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Created</label>
                <p className="text-gray-700 text-sm">
                  {new Date(selectedDepartment.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  onClick={() => setEditingDepartment(selectedDepartment)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${selectedDepartment.name}?`)) {
                      handleDelete(selectedDepartment.id);
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
              <FolderIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Select a department to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateDepartmentModal
          departments={departments}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            refetch();
          }}
        />
      )}

      {editingDepartment && (
        <EditDepartmentModal
          department={editingDepartment}
          departments={departments.filter(d => d.id !== editingDepartment.id)}
          onClose={() => setEditingDepartment(null)}
          onSuccess={() => {
            setEditingDepartment(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
