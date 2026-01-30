/**
 * Git Tools for Code Worker
 *
 * Provides safe git operations with:
 * - No force push allowed
 * - Branch naming conventions enforced
 * - Agent metadata in commits
 * - Working directory restrictions
 */

import simpleGit, { SimpleGit, StatusResult, LogResult, DefaultLogFields } from "simple-git";

// ============================================================================
// Types
// ============================================================================

export interface GitStatus {
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitLogEntry {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export interface PRInfo {
  number: number;
  url: string;
  title: string;
}

export interface GitToolsConfig {
  /** GitHub token for API operations (PR creation) */
  githubToken?: string;
  /** Working directory - must be under /workspace/repos/ */
  workDir: string;
  /** Agent identifier for commit attribution */
  agentId?: string;
  /** GitHub repository owner */
  owner?: string;
  /** GitHub repository name */
  repo?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ALLOWED_WORKSPACE_PREFIX = "/workspace/repos/";
const AGENT_CO_AUTHOR = "Co-Authored-By: Nubabel Agent <nubabel@kyndof.com>";
const BRANCH_PREFIX = "agent/";

// ============================================================================
// Errors
// ============================================================================

export class GitToolsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GitToolsError";
  }
}

// ============================================================================
// Implementation
// ============================================================================

export class GitTools {
  private git: SimpleGit;
  private config: GitToolsConfig;

  constructor(config: GitToolsConfig) {
    this.validateWorkDir(config.workDir);
    this.config = config;
    this.git = simpleGit({
      baseDir: config.workDir,
      binary: "git",
      maxConcurrentProcesses: 1,
      trimmed: true,
    });
  }

  // --------------------------------------------------------------------------
  // Validation Helpers
  // --------------------------------------------------------------------------

  private validateWorkDir(workDir: string): void {
    const normalizedPath = workDir.endsWith("/") ? workDir : `${workDir}/`;
    if (!normalizedPath.startsWith(ALLOWED_WORKSPACE_PREFIX)) {
      throw new GitToolsError(
        `Working directory must be under ${ALLOWED_WORKSPACE_PREFIX}`,
        "INVALID_WORKDIR",
        { workDir, allowedPrefix: ALLOWED_WORKSPACE_PREFIX }
      );
    }
  }

  private validateBranchName(name: string): void {
    // Agent branches must follow naming convention: agent/{ticket-id}-{description}
    if (!name.startsWith(BRANCH_PREFIX)) {
      throw new GitToolsError(
        `Branch name must start with '${BRANCH_PREFIX}'. Use format: agent/{ticket-id}-{description}`,
        "INVALID_BRANCH_NAME",
        { name, requiredPrefix: BRANCH_PREFIX }
      );
    }

    // Validate ticket-id pattern (alphanumeric with optional dashes)
    const branchSuffix = name.slice(BRANCH_PREFIX.length);
    if (!/^[a-zA-Z0-9]+-[a-zA-Z0-9-]+$/.test(branchSuffix)) {
      throw new GitToolsError(
        "Branch name must follow format: agent/{ticket-id}-{description}",
        "INVALID_BRANCH_FORMAT",
        { name, expectedFormat: "agent/{ticket-id}-{description}" }
      );
    }
  }

  private blockForcePush(args: string[]): void {
    const forceFlags = ["--force", "-f", "--force-with-lease"];
    const hasForceFlag = args.some((arg) =>
      forceFlags.some((flag) => arg === flag || arg.startsWith(`${flag}=`))
    );

    if (hasForceFlag) {
      throw new GitToolsError(
        "Force push is not allowed for safety reasons",
        "FORCE_PUSH_BLOCKED",
        { args }
      );
    }
  }

  private formatCommitMessage(message: string): string {
    // Add agent attribution if not already present
    if (!message.includes(AGENT_CO_AUTHOR)) {
      return `${message}\n\n${AGENT_CO_AUTHOR}`;
    }
    return message;
  }

  // --------------------------------------------------------------------------
  // Status Operations
  // --------------------------------------------------------------------------

  async status(): Promise<GitStatus> {
    const result: StatusResult = await this.git.status();

    return {
      branch: result.current || "HEAD",
      clean: result.isClean(),
      staged: [...result.staged, ...result.renamed.map((r) => r.to)],
      unstaged: [...result.modified, ...result.deleted],
      untracked: result.not_added,
    };
  }

  async diff(staged: boolean = false): Promise<string> {
    if (staged) {
      return this.git.diff(["--cached"]);
    }
    return this.git.diff();
  }

  async log(limit: number = 10): Promise<GitLogEntry[]> {
    const result: LogResult<DefaultLogFields> = await this.git.log({
      maxCount: limit,
    });

    return result.all.map((entry) => ({
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: new Date(entry.date),
    }));
  }

  // --------------------------------------------------------------------------
  // Branch Operations
  // --------------------------------------------------------------------------

  async createBranch(name: string, base?: string): Promise<void> {
    this.validateBranchName(name);

    const args = ["checkout", "-b", name];
    if (base) {
      args.push(base);
    }

    await this.git.raw(args);
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(["--abbrev-ref", "HEAD"]);
    return result.trim();
  }

  async branchExists(branch: string): Promise<boolean> {
    try {
      await this.git.raw(["rev-parse", "--verify", branch]);
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Staging & Commit Operations
  // --------------------------------------------------------------------------

  async add(files: string[]): Promise<void> {
    if (files.length === 0) {
      throw new GitToolsError(
        "No files specified for staging",
        "NO_FILES_SPECIFIED"
      );
    }
    await this.git.add(files);
  }

  async commit(message: string): Promise<string> {
    const formattedMessage = this.formatCommitMessage(message);
    const result = await this.git.commit(formattedMessage);

    // Extract SHA from commit result
    const sha = result.commit;
    if (!sha) {
      throw new GitToolsError(
        "Commit succeeded but no SHA returned",
        "COMMIT_SHA_MISSING"
      );
    }

    return sha;
  }

  async resetFile(path: string): Promise<void> {
    await this.git.checkout(["--", path]);
  }

  async stash(message?: string): Promise<void> {
    const args = ["stash", "push"];
    if (message) {
      args.push("-m", message);
    }
    await this.git.raw(args);
  }

  async stashPop(): Promise<void> {
    await this.git.stash(["pop"]);
  }

  // --------------------------------------------------------------------------
  // Remote Operations
  // --------------------------------------------------------------------------

  async push(branch?: string): Promise<void> {
    const currentBranch = branch || (await this.getCurrentBranch());

    // Ensure no force push
    this.blockForcePush([]);

    // Push with upstream tracking
    await this.git.push(["--set-upstream", "origin", currentBranch]);
  }

  async pull(branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull("origin", branch);
    } else {
      await this.git.pull();
    }
  }

  async fetch(remote: string = "origin"): Promise<void> {
    await this.git.fetch(remote);
  }

  async clone(repoUrl: string, targetDir: string): Promise<void> {
    // Validate target directory is under allowed workspace
    this.validateWorkDir(targetDir);

    await simpleGit().clone(repoUrl, targetDir);
  }

  // --------------------------------------------------------------------------
  // GitHub API Operations
  // --------------------------------------------------------------------------

  async createPR(
    title: string,
    body: string,
    base: string,
    head: string
  ): Promise<PRInfo> {
    if (!this.config.githubToken) {
      throw new GitToolsError(
        "GitHub token is required for PR creation",
        "GITHUB_TOKEN_MISSING"
      );
    }

    if (!this.config.owner || !this.config.repo) {
      throw new GitToolsError(
        "GitHub owner and repo are required for PR creation",
        "GITHUB_REPO_MISSING"
      );
    }

    const agentAttribution = this.config.agentId
      ? `\n\n---\nCreated by: Nubabel Agent (${this.config.agentId})`
      : "\n\n---\nCreated by: Nubabel Agent";

    const fullBody = body + agentAttribution;

    const response = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/pulls`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.config.githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body: fullBody,
          head,
          base,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new GitToolsError(
        `Failed to create PR: ${response.status} ${errorText}`,
        "PR_CREATION_FAILED",
        {
          status: response.status,
          error: errorText,
          owner: this.config.owner,
          repo: this.config.repo,
        }
      );
    }

    const data = (await response.json()) as {
      number: number;
      html_url: string;
      title: string;
    };

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
    };
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  async getRemoteUrl(remote: string = "origin"): Promise<string | null> {
    try {
      const result = await this.git.raw(["remote", "get-url", remote]);
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.revparse(["--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  async getRoot(): Promise<string> {
    const result = await this.git.revparse(["--show-toplevel"]);
    return result.trim();
  }

  /**
   * Parse owner and repo from remote URL
   */
  async parseRemoteInfo(): Promise<{ owner: string; repo: string } | null> {
    const remoteUrl = await this.getRemoteUrl();
    if (!remoteUrl) return null;

    // Handle SSH format: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^.]+)(\.git)?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // Handle HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(
      /https?:\/\/github\.com\/([^/]+)\/([^.]+)(\.git)?$/
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  }

  /**
   * Get a summary of recent changes for context
   */
  async getChangeSummary(): Promise<{
    status: GitStatus;
    recentCommits: GitLogEntry[];
    diff: string;
  }> {
    const [status, recentCommits, diff] = await Promise.all([
      this.status(),
      this.log(5),
      this.diff(),
    ]);

    return { status, recentCommits, diff };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a GitTools instance for a repository
 */
export function createGitTools(config: GitToolsConfig): GitTools {
  return new GitTools(config);
}

/**
 * Create GitTools with auto-detected GitHub info from remote
 */
export async function createGitToolsWithAutoConfig(
  workDir: string,
  githubToken?: string,
  agentId?: string
): Promise<GitTools> {
  const tools = new GitTools({ workDir, githubToken, agentId });

  // Try to auto-detect owner/repo from remote
  const remoteInfo = await tools.parseRemoteInfo();

  if (remoteInfo) {
    return new GitTools({
      workDir,
      githubToken,
      agentId,
      owner: remoteInfo.owner,
      repo: remoteInfo.repo,
    });
  }

  return tools;
}

// ============================================================================
// Exports
// ============================================================================

export default GitTools;
