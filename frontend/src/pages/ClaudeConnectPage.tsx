import { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Bookmark,
  Terminal,
  CheckCircle,
} from "lucide-react";
import { api } from "../api/client";

type ConnectionStep = "init" | "instructions" | "waiting" | "naming" | "success" | "error";

interface SessionInfo {
  code: string;
  expiresIn: number;
  pollUrl: string;
}

export default function ClaudeConnectPage() {
  const [step, setStep] = useState<ConnectionStep>("init");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [bookmarkletCode, setBookmarkletCode] = useState<string>("");
  const [consoleScript, setConsoleScript] = useState<string>("");
  const [copied, setCopied] = useState<"bookmarklet" | "script" | null>(null);
  const [nickname, setNickname] = useState("");
  const [priority, setPriority] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.post<SessionInfo>("/api/claude-connect/init");
      setSession(data);

      // Get bookmarklet code
      const { data: bookmarkletData } = await api.get<{ bookmarkletCode: string }>(
        `/api/claude-connect/bookmarklet/${data.code}`,
      );
      setBookmarkletCode(bookmarkletData.bookmarkletCode);

      // Generate console script
      const baseUrl = window.location.origin;
      const script = `(async()=>{const sk=document.cookie.match(/sessionKey=([^;]+)/);if(!sk){console.error('Not logged in');return;}const r=await fetch('${baseUrl}/api/claude-connect/receive-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:sk[1],code:'${data.code}'})});const d=await r.json();console.log(d.success?'Success! Return to Nubabel.':'Error: '+d.error);})();`;
      setConsoleScript(script);

      setStep("instructions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize connection");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  // Poll for token
  const pollForToken = useCallback(async () => {
    if (!session) return false;

    try {
      const { data } = await api.get<{ status: string; message: string }>(
        `/api/claude-connect/poll/${session.code}`,
      );

      if (data.status === "received") {
        setStep("naming");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [session]);

  // Auto-poll when in waiting step
  useEffect(() => {
    if (step !== "waiting" || !session) return;

    const interval = setInterval(async () => {
      setPollCount((c) => c + 1);
      const received = await pollForToken();
      if (received) {
        clearInterval(interval);
      }
    }, 2000);

    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (step === "waiting") {
        setError("Connection timed out. Please try again.");
        setStep("error");
      }
    }, 300000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [step, session, pollForToken]);

  const handleCopy = async (type: "bookmarklet" | "script") => {
    const text = type === "bookmarklet" ? bookmarkletCode : consoleScript;
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleStartWaiting = () => {
    setPollCount(0);
    setStep("waiting");
  };

  const handleComplete = async () => {
    if (!session || !nickname.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const { data } = await api.post<{ id: string }>("/api/claude-connect/complete", {
        code: session.code,
        nickname: nickname.trim(),
        priority,
      });

      setStep("success");

      // Notify parent window if in popup
      if (window.opener) {
        window.opener.postMessage({ type: "claude-connect-success", accountId: data.id }, "*");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = "/admin/claude-max-accounts";
    }
  };

  // Loading state
  if (loading && step === "init") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Initializing connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect Claude Account</h1>
          <p className="text-gray-600">
            Link your Claude Max subscription to Nubabel for AI-powered workflows
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {["Login", "Extract", "Connect"].map((label, idx) => {
            const stepIdx =
              step === "init" || step === "instructions"
                ? 0
                : step === "waiting"
                  ? 1
                  : step === "naming" || step === "success"
                    ? 2
                    : 0;
            const isActive = idx <= stepIdx;
            const isCurrent = idx === stepIdx;

            return (
              <div key={label} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isActive
                      ? isCurrent
                        ? "bg-indigo-600 text-white"
                        : "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isActive && !isCurrent ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`ml-2 text-sm ${isCurrent ? "text-indigo-600 font-medium" : "text-gray-500"}`}
                >
                  {label}
                </span>
                {idx < 2 && <ChevronRight className="w-4 h-4 text-gray-400 mx-4" />}
              </div>
            );
          })}
        </div>

        {/* Error State */}
        {step === "error" && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Connection Failed</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={initializeSession}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Instructions Step */}
        {step === "instructions" && (
          <div className="space-y-6">
            {/* Step 1: Open Claude */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">
                  1
                </span>
                Open Claude and Log In
              </h3>
              <p className="text-gray-600 mb-4">
                Open claude.ai in a new tab and make sure you're logged in to your Claude Max
                account.
              </p>
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Open claude.ai
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Step 2: Extract Token */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">
                  2
                </span>
                Extract Your Session (Choose One Method)
              </h3>

              {/* Method A: Bookmarklet */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Bookmark className="w-4 h-4" />
                  Option A: Bookmarklet (Recommended)
                </h4>
                <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-3">
                  <li>Copy the code below</li>
                  <li>Create a new bookmark in your browser</li>
                  <li>Paste the code as the URL</li>
                  <li>While on claude.ai, click the bookmark</li>
                </ol>
                <div className="relative">
                  <textarea
                    readOnly
                    value={bookmarkletCode}
                    className="w-full h-20 p-2 text-xs font-mono bg-gray-100 border rounded resize-none"
                  />
                  <button
                    onClick={() => handleCopy("bookmarklet")}
                    className="absolute top-2 right-2 p-1.5 bg-white border rounded hover:bg-gray-50"
                    title="Copy to clipboard"
                  >
                    {copied === "bookmarklet" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* Method B: Console */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Option B: Browser Console
                </h4>
                <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-3">
                  <li>On claude.ai, open DevTools (F12 or Cmd+Option+I)</li>
                  <li>Go to the Console tab</li>
                  <li>Paste the code below and press Enter</li>
                </ol>
                <div className="relative">
                  <textarea
                    readOnly
                    value={consoleScript}
                    className="w-full h-16 p-2 text-xs font-mono bg-gray-100 border rounded resize-none"
                  />
                  <button
                    onClick={() => handleCopy("script")}
                    className="absolute top-2 right-2 p-1.5 bg-white border rounded hover:bg-gray-50"
                    title="Copy to clipboard"
                  >
                    {copied === "script" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <div className="text-center">
              <button
                onClick={handleStartWaiting}
                className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
              >
                I've Extracted My Session - Continue
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Click after running the bookmarklet or console script
              </p>
            </div>
          </div>
        )}

        {/* Waiting Step */}
        {step === "waiting" && (
          <div className="bg-white rounded-lg shadow-sm border p-8">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Waiting for Token...</h2>
              <p className="text-gray-600 mb-4">
                Run the bookmarklet or console script on claude.ai.
                <br />
                This page will update automatically when we receive your session.
              </p>
              <p className="text-sm text-gray-400">Checking... ({pollCount} attempts)</p>
            </div>
          </div>
        )}

        {/* Naming Step */}
        {step === "naming" && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="text-center mb-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900">Token Received!</h2>
              <p className="text-gray-600">Now give your account a nickname to identify it.</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Nickname
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g., work-account, personal, team-shared"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority (higher = preferred)
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
                  min={1}
                  max={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                onClick={handleComplete}
                disabled={loading || !nickname.trim()}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating Account..." : "Complete Connection"}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="bg-white rounded-lg shadow-sm border p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Successfully Connected!</h2>
              <p className="text-gray-600 mb-6">
                Your Claude Max account "{nickname}" has been linked to Nubabel.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {window.opener ? "Close Window" : "Go to Accounts"}
              </button>
            </div>
          </div>
        )}

        {/* Security Note */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-800 mb-1">Security Note</h4>
          <p className="text-sm text-blue-700">
            Your session token is encrypted and stored securely. Nubabel never sees your Claude
            password. The token is only used to make API calls on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
