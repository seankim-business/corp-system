import { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  Bookmark,
  Terminal,
  CheckCircle,
} from "lucide-react";
import { api } from "../api/client";

type ConnectionStep = "init" | "instructions" | "waiting" | "naming" | "success" | "error";
type TabType = "quick" | "manual";

interface SessionInfo {
  code: string;
  expiresIn: number;
  pollUrl: string;
}

export default function ClaudeConnectPage() {
  const [step, setStep] = useState<ConnectionStep>("init");
  const [activeTab, setActiveTab] = useState<TabType>("quick");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [bookmarkletCode, setBookmarkletCode] = useState<string>("");
  const [consoleScript, setConsoleScript] = useState<string>("");
  const [copied, setCopied] = useState<"bookmarklet" | "script" | "command" | null>(null);
  const [nickname, setNickname] = useState("");
  const [priority, setPriority] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Quick Connect state
  const [tokenInput, setTokenInput] = useState("");
  const [tokenValidation, setTokenValidation] = useState<{
    status: "idle" | "validating" | "valid" | "invalid";
    type: "oauth" | "session" | null;
    error: string | null;
  }>({ status: "idle", type: null, error: null });

  // Initialize session on mount (lazy init for manual tab)
  useEffect(() => {
    if (activeTab === "manual" && !session) {
      initializeSession();
    }
  }, [activeTab]);

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

  // Token validation function with debounce
  const validateToken = useCallback(async (token: string) => {
    if (!token.trim()) {
      setTokenValidation({ status: "idle", type: null, error: null });
      return;
    }

    // Quick format check before API call
    const isOAuth = token.startsWith("sk-ant-oat01-");
    const isSession = token.startsWith("sk-ant-sid");

    if (!isOAuth && !isSession) {
      setTokenValidation({
        status: "invalid",
        type: null,
        error: "This doesn't look like a Claude token. Run `claude get-token` to get a valid token.",
      });
      return;
    }

    setTokenValidation({ status: "validating", type: null, error: null });

    try {
      const { data } = await api.post<{ valid: boolean; type: "oauth" | "session" | null; error?: string }>(
        "/api/claude-connect/validate-token",
        { token }
      );

      if (data.valid) {
        setTokenValidation({ status: "valid", type: data.type, error: null });
      } else {
        setTokenValidation({ status: "invalid", type: null, error: data.error || "Invalid token" });
      }
    } catch (err: any) {
      setTokenValidation({
        status: "invalid",
        type: null,
        error: err.response?.data?.error || "Validation failed. Please try again.",
      });
    }
  }, []);

  // Debounced effect for auto-validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tokenInput.length > 20) {
        validateToken(tokenInput);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [tokenInput, validateToken]);

  // Quick Connect handler for direct token submission
  const handleQuickConnect = async () => {
    if (!tokenInput || tokenValidation.status !== "valid" || !nickname.trim()) return;

    try {
      setLoading(true);
      setError(null);

      // Initialize session if not exists
      let currentCode = session?.code;
      if (!currentCode) {
        const { data } = await api.post<SessionInfo>("/api/claude-connect/init");
        currentCode = data.code;
        setSession(data);
      }

      // Send token directly
      await api.post("/api/claude-connect/receive-token", {
        token: tokenInput,
        code: currentCode,
      });

      // Complete connection
      const { data } = await api.post<{ id: string }>("/api/claude-connect/complete", {
        code: currentCode,
        nickname: nickname.trim(),
        priority,
      });

      setStep("success");

      if (window.opener) {
        window.opener.postMessage({ type: "claude-connect-success", accountId: data.id }, "*");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Connection failed. Please try again.");
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Connect Claude Account</h1>
          <p className="text-gray-600">
            Link your Claude subscription to Nubabel for AI-powered workflows
          </p>
        </div>

        {/* Tabs - only show if not in success/error state */}
        {step !== "success" && step !== "error" && (
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab("quick")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "quick"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Quick Connect
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "manual"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Manual
            </button>
          </div>
        )}

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

        {/* Quick Connect Tab */}
        {activeTab === "quick" && step !== "success" && step !== "error" && (
          <div className="space-y-6">
            {/* Step 1: Get Token */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                  1
                </span>
                Get Your Token
              </h3>
              <p className="text-gray-600 mb-4">Run this command in your terminal:</p>
              <div className="relative group">
                <div className="flex items-center bg-gray-900 text-gray-100 rounded-lg px-4 py-3 font-mono text-sm shadow-inner">
                  <span className="text-gray-500 mr-2 select-none">$</span>
                  <span className="flex-1">claude get-token</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("claude get-token");
                      setCopied("command");
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                    title="Copy command"
                  >
                    {copied === "command" ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Don't have Claude Code?{" "}
                <a
                  href="https://claude.ai/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Install it first
                </a>
                , or use the Manual tab.
              </p>
            </div>

            {/* Step 2: Paste Token */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                  2
                </span>
                Paste Your Token
              </h3>
              <div className="relative">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="sk-ant-oat01-..."
                  className={`w-full px-4 py-3 pr-12 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 transition-all ${
                    tokenValidation.status === "valid"
                      ? "border-green-500 focus:ring-green-500 bg-green-50/50"
                      : tokenValidation.status === "invalid"
                        ? "border-red-500 focus:ring-red-500 bg-red-50/50"
                        : "border-gray-300 focus:ring-indigo-500 bg-white"
                  }`}
                  autoComplete="off"
                />
                {tokenValidation.status === "validating" && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
                )}
                {tokenValidation.status === "valid" && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                )}
                {tokenValidation.status === "invalid" && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                )}
              </div>
              {tokenValidation.status === "valid" && (
                <p className="text-sm text-green-600 mt-2 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Check className="w-4 h-4" />
                  Valid {tokenValidation.type === "oauth" ? "OAuth" : "session"} token detected
                </p>
              )}
              {tokenValidation.status === "invalid" && tokenValidation.error && (
                <p className="text-sm text-red-600 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {tokenValidation.error}
                </p>
              )}
            </div>

            {/* Step 3: Name Account - only shows after valid token */}
            {tokenValidation.status === "valid" && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    3
                  </span>
                  Name Your Account
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nickname
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g., work-account"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
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
                </div>
                <button
                  onClick={handleQuickConnect}
                  disabled={loading || !nickname.trim() || tokenValidation.status !== "valid"}
                  className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-sm hover:shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Connect Account"
                  )}
                </button>
                {error && (
                  <p className="text-sm text-red-600 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual Tab */}
        {activeTab === "manual" && step !== "success" && step !== "error" && (
          <div className="space-y-6">
            {/* Hint to try Quick Connect */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-700">
              <strong>Tip:</strong> The Quick Connect tab is faster if you have Claude Code CLI installed.
            </div>

            {/* Instructions Step */}
            {step === "instructions" && (
              <>
                {/* Step 1: Open Claude */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                      1
                    </span>
                    Open Claude and Log In
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Open claude.ai in a new tab and make sure you're logged in to your Claude account.
                  </p>
                  <a
                    href="https://claude.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Open claude.ai
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {/* Step 2: Extract Token */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                      2
                    </span>
                    Extract Your Session (Choose One Method)
                  </h3>

                  {/* Method A: Bookmarklet */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
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
                        className="w-full h-20 p-2 text-xs font-mono bg-white border border-gray-300 rounded resize-none"
                      />
                      <button
                        onClick={() => handleCopy("bookmarklet")}
                        className="absolute top-2 right-2 p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
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
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
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
                        className="w-full h-16 p-2 text-xs font-mono bg-white border border-gray-300 rounded resize-none"
                      />
                      <button
                        onClick={() => handleCopy("script")}
                        className="absolute top-2 right-2 p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
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
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 font-medium shadow-sm hover:shadow-md transition-all"
                  >
                    I've Extracted My Session - Continue
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    Click after running the bookmarklet or console script
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Waiting Step - only in manual tab */}
        {step === "waiting" && activeTab === "manual" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
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

        {/* Naming Step - only in manual tab */}
        {step === "naming" && activeTab === "manual" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-300">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Token Received!</h2>
              <p className="text-gray-600">Now give your account a nickname to identify it.</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
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
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating Account...
                  </span>
                ) : (
                  "Complete Connection"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-500 shadow-lg">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                Connected Successfully!
              </h2>
              <p className="text-gray-600 mb-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100">
                Your Claude account "{nickname}" is now linked to Nubabel.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 shadow-sm hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
              >
                {window.opener ? "Close Window" : "Go to Accounts"}
              </button>
            </div>
          </div>
        )}

        {/* Security Note */}
        {step !== "success" && (
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-1">Security Note</h4>
            <p className="text-sm text-blue-700">
              Your session token is encrypted and stored securely. Nubabel never sees your Claude
              password. The token is only used to make API calls on your behalf.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
