/**
 * Admin Identity Management Page
 *
 * Brutalist aesthetic with strong typography and sharp contrasts.
 * Manages external identity linking, suggestions, and organization settings.
 */

import { useState } from "react";
import {
  useIdentities,
  useIdentityStats,
  useIdentitySuggestions,
  useLinkIdentity,
  useUnlinkIdentity,
  useAcceptSuggestion,
  useRejectSuggestion,
  useSyncSlackIdentities,
  type ExternalIdentity,
  type IdentitySuggestion,
} from "../../hooks/useIdentityAdmin";
import { MessageSquare, Mail, FileText, Link as LinkIcon, Unlink, Check, X, RefreshCw } from "lucide-react";

type FilterStatus = "all" | "linked" | "unlinked" | "suggested";
type FilterProvider = "all" | "slack" | "google" | "notion";

export default function IdentityManagement() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [providerFilter, setProviderFilter] = useState<FilterProvider>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIdentity, setSelectedIdentity] = useState<ExternalIdentity | null>(null);
  const [linkUserId, setLinkUserId] = useState("");

  const { data: statsData } = useIdentityStats();
  const { data: identitiesData, isLoading } = useIdentities({
    status: statusFilter === "all" ? undefined : statusFilter,
    provider: providerFilter === "all" ? undefined : providerFilter,
    page,
    limit: 20,
  });
  const { data: suggestions } = useIdentitySuggestions();

  const linkMutation = useLinkIdentity();
  const unlinkMutation = useUnlinkIdentity();
  const acceptMutation = useAcceptSuggestion();
  const rejectMutation = useRejectSuggestion();
  const syncMutation = useSyncSlackIdentities();

  const stats = statsData || {
    total: 0,
    linked: 0,
    unlinked: 0,
    suggested: 0,
    byProvider: { slack: 0, google: 0, notion: 0 },
  };

  const identities = identitiesData?.identities || [];
  const pagination = identitiesData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  };

  // Filter identities by search query
  const filteredIdentities = identities.filter((identity) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      identity.email?.toLowerCase().includes(query) ||
      identity.displayName?.toLowerCase().includes(query) ||
      identity.linkedUser?.email?.toLowerCase().includes(query) ||
      identity.linkedUser?.displayName?.toLowerCase().includes(query)
    );
  });

  const handleLink = (identityId: string) => {
    if (!linkUserId.trim()) {
      alert("Please enter a user ID");
      return;
    }

    linkMutation.mutate(
      { identityId, userId: linkUserId },
      {
        onSuccess: () => {
          setSelectedIdentity(null);
          setLinkUserId("");
        },
        onError: (error) => {
          alert(error.message);
        },
      },
    );
  };

  const handleUnlink = (identityId: string) => {
    if (!confirm("Unlink this identity?")) return;

    unlinkMutation.mutate(
      { identityId },
      {
        onError: (error) => {
          alert(error.message);
        },
      },
    );
  };

  const handleAcceptSuggestion = (suggestionId: string) => {
    acceptMutation.mutate(
      { suggestionId },
      {
        onError: (error) => {
          alert(error.message);
        },
      },
    );
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    rejectMutation.mutate(
      { suggestionId },
      {
        onError: (error) => {
          alert(error.message);
        },
      },
    );
  };

  const handleSyncSlack = () => {
    if (!confirm("Sync all Slack users to the identity system? This will create identity records and attempt auto-linking.")) {
      return;
    }

    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        alert(`Sync complete: ${data.message}\n\nAuto-linked: ${data.stats.autoLinked}\nSuggestions created: ${data.stats.suggested}`);
      },
      onError: (error) => {
        alert(error.message);
      },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Brutalist Header */}
      <div className="border-b-4 border-white bg-black">
        <div className="p-8 flex justify-between items-start">
          <div>
            <h1 className="text-6xl font-black uppercase tracking-tighter mb-2">
              Identity
            </h1>
            <p className="text-xl font-mono text-gray-400">CONTROL PANEL</p>
          </div>
          <button
            onClick={handleSyncSlack}
            disabled={syncMutation.isPending}
            className="px-6 py-3 border-2 border-white text-white font-mono font-bold uppercase hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-5 h-5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "SYNCING..." : "SYNC SLACK USERS"}
          </button>
        </div>
      </div>

      {/* Stats Grid - Sharp Boxes */}
      <div className="p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatBox label="TOTAL" value={stats.total} color="border-white" />
          <StatBox label="LINKED" value={stats.linked} color="border-green-500" />
          <StatBox label="UNLINKED" value={stats.unlinked} color="border-red-500" />
          <StatBox label="SUGGESTED" value={stats.suggested} color="border-yellow-500" />
        </div>

        {/* Provider Breakdown */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <ProviderBox
            provider="SLACK"
            count={stats.byProvider.slack}
            icon={<MessageSquare className="w-8 h-8" />}
          />
          <ProviderBox
            provider="GOOGLE"
            count={stats.byProvider.google}
            icon={<Mail className="w-8 h-8" />}
          />
          <ProviderBox
            provider="NOTION"
            count={stats.byProvider.notion}
            icon={<FileText className="w-8 h-8" />}
          />
        </div>

        {/* Suggestions Panel */}
        {suggestions && suggestions.length > 0 && (
          <SuggestionsPanel
            suggestions={suggestions}
            onAccept={handleAcceptSuggestion}
            onReject={handleRejectSuggestion}
          />
        )}

        {/* Filters */}
        <div className="border-4 border-white bg-black p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold mb-2 uppercase">
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Email or name..."
                className="w-full bg-black border-2 border-white px-4 py-3 font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold mb-2 uppercase">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as FilterStatus);
                  setPage(1);
                }}
                className="w-full bg-black border-2 border-white px-4 py-3 font-mono text-white focus:outline-none focus:border-yellow-500"
              >
                <option value="all">ALL</option>
                <option value="linked">LINKED</option>
                <option value="unlinked">UNLINKED</option>
                <option value="suggested">SUGGESTED</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold mb-2 uppercase">
                Provider
              </label>
              <select
                value={providerFilter}
                onChange={(e) => {
                  setProviderFilter(e.target.value as FilterProvider);
                  setPage(1);
                }}
                className="w-full bg-black border-2 border-white px-4 py-3 font-mono text-white focus:outline-none focus:border-yellow-500"
              >
                <option value="all">ALL</option>
                <option value="slack">SLACK</option>
                <option value="google">GOOGLE</option>
                <option value="notion">NOTION</option>
              </select>
            </div>
          </div>
        </div>

        {/* Identities Table */}
        <div className="border-4 border-white bg-black overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b-4 border-white">
                <th className="text-left p-4 font-mono text-xs font-bold uppercase">
                  Provider
                </th>
                <th className="text-left p-4 font-mono text-xs font-bold uppercase">
                  Identity
                </th>
                <th className="text-left p-4 font-mono text-xs font-bold uppercase">
                  Status
                </th>
                <th className="text-left p-4 font-mono text-xs font-bold uppercase">
                  Linked User
                </th>
                <th className="text-right p-4 font-mono text-xs font-bold uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-white border-t-transparent animate-spin" />
                  </td>
                </tr>
              ) : filteredIdentities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center font-mono text-gray-600">
                    NO IDENTITIES FOUND
                  </td>
                </tr>
              ) : (
                filteredIdentities.map((identity) => (
                  <IdentityRow
                    key={identity.id}
                    identity={identity}
                    onLink={() => setSelectedIdentity(identity)}
                    onUnlink={() => handleUnlink(identity.id)}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="border-t-4 border-white p-4 flex justify-between items-center">
              <div className="font-mono text-sm">
                PAGE {pagination.page} / {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border-2 border-white font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-black transition-colors"
                >
                  PREV
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-4 py-2 border-2 border-white font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-black transition-colors"
                >
                  NEXT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Link Identity Modal */}
      {selectedIdentity && (
        <LinkModal
          identity={selectedIdentity}
          linkUserId={linkUserId}
          setLinkUserId={setLinkUserId}
          onLink={() => handleLink(selectedIdentity.id)}
          onClose={() => {
            setSelectedIdentity(null);
            setLinkUserId("");
          }}
          isLoading={linkMutation.isPending}
        />
      )}
    </div>
  );
}

// =============================================================================
// Components
// =============================================================================

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`border-4 ${color} bg-black p-6`}>
      <div className="text-5xl font-black mb-2">{value}</div>
      <div className="text-xs font-mono font-bold">{label}</div>
    </div>
  );
}

function ProviderBox({
  provider,
  count,
  icon,
}: {
  provider: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="border-4 border-white bg-black p-6 flex items-center gap-4">
      <div className="text-white">{icon}</div>
      <div>
        <div className="text-3xl font-black">{count}</div>
        <div className="text-xs font-mono font-bold">{provider}</div>
      </div>
    </div>
  );
}

function SuggestionsPanel({
  suggestions,
  onAccept,
  onReject,
}: {
  suggestions: IdentitySuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="border-4 border-yellow-500 bg-black p-6 mb-8">
      <h2 className="text-2xl font-black uppercase mb-4 flex items-center gap-2">
        <span className="inline-block w-4 h-4 bg-yellow-500 animate-pulse" />
        PENDING SUGGESTIONS ({suggestions.length})
      </h2>

      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="border-2 border-yellow-500 bg-black p-4 flex items-center justify-between"
          >
            <div className="flex-1">
              <div className="font-mono text-sm mb-1">
                {suggestion.externalIdentity.displayName || suggestion.externalIdentity.email}
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {suggestion.externalIdentity.provider.toUpperCase()} →{" "}
                {suggestion.suggestedUser.email}
              </div>
              <div className="text-xs text-yellow-500 font-mono mt-1">
                CONFIDENCE: {Math.round(suggestion.confidenceScore * 100)}%
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onAccept(suggestion.id)}
                className="px-4 py-2 border-2 border-green-500 text-green-500 font-mono font-bold hover:bg-green-500 hover:text-black transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                ACCEPT
              </button>
              <button
                onClick={() => onReject(suggestion.id)}
                className="px-4 py-2 border-2 border-red-500 text-red-500 font-mono font-bold hover:bg-red-500 hover:text-black transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                REJECT
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IdentityRow({
  identity,
  onLink,
  onUnlink,
}: {
  identity: ExternalIdentity;
  onLink: () => void;
  onUnlink: () => void;
}) {
  const ProviderIcon = {
    slack: MessageSquare,
    google: Mail,
    notion: FileText,
  }[identity.provider];

  const statusColors = {
    linked: "border-green-500 text-green-500",
    unlinked: "border-red-500 text-red-500",
    suggested: "border-yellow-500 text-yellow-500",
  };

  return (
    <tr className="border-b-2 border-gray-800 hover:bg-gray-900 transition-colors">
      <td className="p-4">
        <div className="flex items-center gap-2">
          <ProviderIcon className="w-5 h-5" />
          <span className="font-mono text-xs uppercase">{identity.provider}</span>
        </div>
      </td>

      <td className="p-4">
        <div className="font-mono text-sm">
          {identity.displayName || identity.email || "Unknown"}
        </div>
        {identity.email && identity.displayName && (
          <div className="font-mono text-xs text-gray-500">{identity.email}</div>
        )}
      </td>

      <td className="p-4">
        <span
          className={`inline-block px-3 py-1 border-2 ${statusColors[identity.linkStatus]} font-mono text-xs font-bold uppercase`}
        >
          {identity.linkStatus}
        </span>
      </td>

      <td className="p-4">
        {identity.linkedUser ? (
          <div>
            <div className="font-mono text-sm">{identity.linkedUser.displayName}</div>
            <div className="font-mono text-xs text-gray-500">
              {identity.linkedUser.email}
            </div>
          </div>
        ) : (
          <span className="font-mono text-xs text-gray-600">NOT LINKED</span>
        )}
      </td>

      <td className="p-4 text-right">
        <div className="flex justify-end gap-2">
          {identity.linkStatus === "linked" ? (
            <button
              onClick={onUnlink}
              className="px-3 py-1.5 border-2 border-red-500 text-red-500 font-mono text-xs font-bold hover:bg-red-500 hover:text-black transition-colors flex items-center gap-1"
            >
              <Unlink className="w-3 h-3" />
              UNLINK
            </button>
          ) : (
            <button
              onClick={onLink}
              className="px-3 py-1.5 border-2 border-green-500 text-green-500 font-mono text-xs font-bold hover:bg-green-500 hover:text-black transition-colors flex items-center gap-1"
            >
              <LinkIcon className="w-3 h-3" />
              LINK
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function LinkModal({
  identity,
  linkUserId,
  setLinkUserId,
  onLink,
  onClose,
  isLoading,
}: {
  identity: ExternalIdentity;
  linkUserId: string;
  setLinkUserId: (value: string) => void;
  onLink: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
      <div className="border-4 border-white bg-black p-8 max-w-lg w-full">
        <h2 className="text-3xl font-black uppercase mb-6">LINK IDENTITY</h2>

        <div className="mb-6 p-4 border-2 border-gray-700">
          <div className="font-mono text-sm mb-2">
            {identity.displayName || identity.email || "Unknown"}
          </div>
          <div className="font-mono text-xs text-gray-500 uppercase">
            {identity.provider}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-mono font-bold mb-2 uppercase">
            User ID
          </label>
          <input
            type="text"
            value={linkUserId}
            onChange={(e) => setLinkUserId(e.target.value)}
            placeholder="Enter user ID..."
            className="w-full bg-black border-2 border-white px-4 py-3 font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
            autoFocus
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={onLink}
            disabled={isLoading}
            className="flex-1 px-6 py-3 border-2 border-green-500 text-green-500 font-mono font-bold hover:bg-green-500 hover:text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? "LINKING..." : "LINK"}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-6 py-3 border-2 border-white text-white font-mono font-bold hover:bg-white hover:text-black transition-colors disabled:opacity-30"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
