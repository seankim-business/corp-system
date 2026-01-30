/**
 * LinkedIdentities Settings Page
 *
 * User-facing page for managing their own linked identities.
 * Brutalist-minimalist aesthetic with high contrast and bold geometry.
 */

import { useState } from "react";
import {
  useUserIdentities,
  useUserSuggestions,
  useUnlinkIdentity,
  useAcceptSuggestion,
  useRejectSuggestion,
  ExternalIdentity,
  IdentitySuggestion,
} from "../../hooks/useIdentity";

// =============================================================================
// PROVIDER ICONS & CONFIG
// =============================================================================

const PROVIDER_CONFIG = {
  slack: {
    name: "Slack",
    color: "#4A154B",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
  google: {
    name: "Google",
    color: "#4285F4",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    ),
  },
  notion: {
    name: "Notion",
    color: "#000000",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
      </svg>
    ),
  },
};

// =============================================================================
// IDENTITY CARD
// =============================================================================

interface IdentityCardProps {
  identity: ExternalIdentity;
  onUnlink: (id: string) => void;
  isUnlinking: boolean;
}

function IdentityCard({ identity, onUnlink, isUnlinking }: IdentityCardProps) {
  const config = PROVIDER_CONFIG[identity.provider];

  return (
    <div className="border-4 border-black bg-white">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 flex items-center justify-center border-4 border-black"
              style={{ backgroundColor: config.color, color: "white" }}
            >
              {config.icon}
            </div>
            <div>
              <div className="font-mono text-lg font-bold uppercase tracking-tight">
                {config.name}
              </div>
              {identity.displayName && (
                <div className="text-sm text-gray-900">{identity.displayName}</div>
              )}
              {identity.email && <div className="text-xs font-mono text-gray-600">{identity.email}</div>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Linked
            </div>
            <div className="text-sm font-mono">
              {identity.linkedAt
                ? new Date(identity.linkedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Unknown"}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Method
            </div>
            <div className="text-sm font-mono uppercase">{identity.linkMethod || "N/A"}</div>
          </div>
        </div>
      </div>

      <div className="border-t-4 border-black bg-gray-50 px-6 py-3">
        <button
          onClick={() => onUnlink(identity.id)}
          disabled={isUnlinking}
          className="w-full font-mono text-sm font-bold uppercase tracking-wider py-2 px-4 border-2 border-black bg-white hover:bg-red-600 hover:text-white hover:border-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isUnlinking ? "UNLINKING..." : "UNLINK"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// SUGGESTION CARD
// =============================================================================

interface SuggestionCardProps {
  suggestion: IdentitySuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isProcessing: boolean;
}

function SuggestionCard({ suggestion, onAccept, onReject, isProcessing }: SuggestionCardProps) {
  const config = PROVIDER_CONFIG[suggestion.externalIdentity.provider];
  const confidence = Math.round(suggestion.confidenceScore * 100);

  return (
    <div className="border-4 border-black bg-yellow-50">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 flex items-center justify-center border-4 border-black"
              style={{ backgroundColor: config.color, color: "white" }}
            >
              {config.icon}
            </div>
            <div>
              <div className="font-mono text-lg font-bold uppercase tracking-tight">
                {config.name}
              </div>
              {suggestion.externalIdentity.displayName && (
                <div className="text-sm text-gray-900">
                  {suggestion.externalIdentity.displayName}
                </div>
              )}
              {suggestion.externalIdentity.email && (
                <div className="text-xs font-mono text-gray-600">
                  {suggestion.externalIdentity.email}
                </div>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">
              Confidence
            </div>
            <div className="text-2xl font-mono font-bold">{confidence}%</div>
          </div>
        </div>

        <div className="pt-4 border-t-2 border-black">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500 mb-1">
            Match Method
          </div>
          <div className="text-sm font-mono">{suggestion.matchMethod}</div>
        </div>
      </div>

      <div className="border-t-4 border-black bg-white px-6 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => onAccept(suggestion.id)}
            disabled={isProcessing}
            className="flex-1 font-mono text-sm font-bold uppercase tracking-wider py-2 px-4 border-2 border-black bg-green-400 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            ACCEPT
          </button>
          <button
            onClick={() => onReject(suggestion.id)}
            disabled={isProcessing}
            className="flex-1 font-mono text-sm font-bold uppercase tracking-wider py-2 px-4 border-2 border-black bg-white hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            REJECT
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function LinkedIdentitiesPage() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: identities, isLoading: isLoadingIdentities } = useUserIdentities();
  const { data: suggestions, isLoading: isLoadingSuggestions } = useUserSuggestions();

  const unlinkMutation = useUnlinkIdentity();
  const acceptMutation = useAcceptSuggestion();
  const rejectMutation = useRejectSuggestion();

  const handleUnlink = async (identityId: string) => {
    if (!confirm("Are you sure you want to unlink this identity?")) {
      return;
    }

    try {
      await unlinkMutation.mutateAsync({ identityId });
      setMessage({ type: "success", text: "Identity unlinked successfully" });
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to unlink identity" });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleAccept = async (suggestionId: string) => {
    try {
      await acceptMutation.mutateAsync({ suggestionId });
      setMessage({ type: "success", text: "Suggestion accepted and identity linked" });
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to accept suggestion" });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleReject = async (suggestionId: string) => {
    try {
      await rejectMutation.mutateAsync({ suggestionId });
      setMessage({ type: "success", text: "Suggestion rejected" });
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to reject suggestion" });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const isLoading = isLoadingIdentities || isLoadingSuggestions;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-8 border-black border-t-transparent animate-spin"></div>
          <p className="mt-4 font-mono font-bold uppercase tracking-wider">LOADING...</p>
        </div>
      </div>
    );
  }

  const linkedIdentities = identities?.filter((i) => i.linkStatus === "linked") || [];
  const pendingSuggestions = suggestions || [];

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b-4 border-black">
        <h1 className="text-5xl font-mono font-black uppercase tracking-tighter mb-2">
          Linked Identities
        </h1>
        <p className="text-lg font-mono text-gray-700">
          Manage external service connections to your account
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`mb-6 p-4 border-4 font-mono ${
            message.type === "success"
              ? "border-green-600 bg-green-50 text-green-900"
              : "border-red-600 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Pending Suggestions Section */}
      {pendingSuggestions.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-mono font-black uppercase tracking-tight mb-4 border-b-4 border-black pb-2">
            Pending Suggestions ({pendingSuggestions.length})
          </h2>
          <p className="text-sm font-mono text-gray-600 mb-6">
            We found these identities that might belong to you. Review and accept or reject them.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingSuggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
                isProcessing={acceptMutation.isPending || rejectMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Linked Identities Section */}
      <div>
        <h2 className="text-2xl font-mono font-black uppercase tracking-tight mb-4 border-b-4 border-black pb-2">
          Linked Identities ({linkedIdentities.length})
        </h2>

        {linkedIdentities.length === 0 ? (
          <div className="border-4 border-black bg-gray-50 p-12 text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 mx-auto text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <h3 className="font-mono font-bold text-lg uppercase tracking-tight text-gray-900 mb-2">
              No Linked Identities
            </h3>
            <p className="font-mono text-sm text-gray-600">
              You haven't linked any external service identities yet.
              <br />
              Check pending suggestions above or contact your administrator.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {linkedIdentities.map((identity) => (
              <IdentityCard
                key={identity.id}
                identity={identity}
                onUnlink={handleUnlink}
                isUnlinking={unlinkMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
