/**
 * Admin N8n Instances Management Page
 *
 * Lists all n8n instances with management actions:
 * - View all instances with status
 * - Provision new instances
 * - Health checks
 * - Stop/Delete instances
 */

import { useState, useEffect } from "react";
import { useN8nInstancesStore } from "../../stores/n8nInstancesStore";

export default function N8nInstancesPage() {
  const {
    instances,
    availableOrgs,
    isLoading,
    error,
    fetchInstances,
    fetchAvailableOrgs,
    provisionInstance,
    performHealthCheck,
    stopInstance,
    deleteInstance,
  } = useN8nInstancesStore();

  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isProvisioning, setIsProvisioning] = useState(false);

  useEffect(() => {
    fetchInstances();
    fetchAvailableOrgs();
  }, [fetchInstances, fetchAvailableOrgs]);

  const handleProvision = async () => {
    if (!selectedOrgId) return;

    setIsProvisioning(true);
    const success = await provisionInstance(selectedOrgId);
    setIsProvisioning(false);

    if (success) {
      setShowProvisionModal(false);
      setSelectedOrgId("");
    }
  };

  const handleHealthCheck = async (instanceId: string, orgName: string) => {
    const healthy = await performHealthCheck(instanceId);
    if (healthy) {
      alert(`Health check passed for ${orgName}`);
    } else {
      alert(`Health check failed for ${orgName}`);
    }
  };

  const handleStop = async (instanceId: string, orgName: string) => {
    if (!confirm(`Are you sure you want to stop the n8n instance for ${orgName}?`)) return;

    const success = await stopInstance(instanceId);
    if (success) {
      alert(`Successfully stopped instance for ${orgName}`);
    }
  };

  const handleDelete = async (instanceId: string, orgName: string) => {
    if (
      !confirm(
        `Are you sure you want to DELETE the n8n instance for ${orgName}? This will remove all workflows and cannot be undone.`
      )
    )
      return;

    const success = await deleteInstance(instanceId);
    if (success) {
      alert(`Successfully deleted instance for ${orgName}`);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
      case "running":
        return "bg-green-100 text-green-800";
      case "stopped":
        return "bg-gray-100 text-gray-800";
      case "failed":
      case "error":
        return "bg-red-100 text-red-800";
      case "provisioning":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 text-lg mb-4">Error</div>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={fetchInstances}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">N8n Instances</h1>
          <p className="text-sm text-gray-500">Manage n8n workflow automation instances</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{instances.length} instances</span>
          <button
            onClick={() => setShowProvisionModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
          >
            Provision New Instance
          </button>
        </div>
      </div>

      {/* Instances Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Container URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workflows
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Health Check
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No n8n instances found. Provision a new instance to get started.
                  </td>
                </tr>
              ) : (
                instances.map((instance) => (
                  <tr key={instance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-gray-900">
                          {instance.organization.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {instance.organization.slug}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={instance.containerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-900 hover:underline text-sm break-all"
                      >
                        {instance.containerUrl}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusBadgeColor(
                          instance.status
                        )}`}
                      >
                        {instance.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {instance._count.workflows}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(instance.lastHealthCheck)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() =>
                            handleHealthCheck(instance.id, instance.organization.name)
                          }
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          Health Check
                        </button>
                        <button
                          onClick={() => handleStop(instance.id, instance.organization.name)}
                          className="text-yellow-600 hover:text-yellow-900 font-medium"
                        >
                          Stop
                        </button>
                        <button
                          onClick={() => handleDelete(instance.id, instance.organization.name)}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Provision New N8n Instance</h2>

            {availableOrgs.length === 0 ? (
              <div className="text-gray-600 mb-6">
                All organizations already have n8n instances provisioned.
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <label htmlFor="org-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Organization
                  </label>
                  <select
                    id="org-select"
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Choose an organization...</option>
                    {availableOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowProvisionModal(false);
                      setSelectedOrgId("");
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    disabled={isProvisioning}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProvision}
                    disabled={!selectedOrgId || isProvisioning}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProvisioning ? "Provisioning..." : "Provision"}
                  </button>
                </div>
              </>
            )}

            {availableOrgs.length === 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
