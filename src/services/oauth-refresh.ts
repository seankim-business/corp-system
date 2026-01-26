export interface OAuthRefreshConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface OAuthRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class OAuthRefreshError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const parseOAuthPayload = (text: string): Record<string, string> => {
  if (!text) return {};

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {});
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
};

const getOptionalNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const requestRefreshToken = async (
  refreshToken: string,
  config: OAuthRefreshConfig,
  provider: string,
): Promise<OAuthRefreshResult> => {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  });

  const rawText = await response.text();
  const payload = parseOAuthPayload(rawText);

  if (!response.ok) {
    const errorCode = payload.error || "refresh_failed";
    const description =
      payload.error_description || payload.error || rawText || response.statusText;
    throw new OAuthRefreshError(
      `${provider} OAuth refresh failed: ${description}`,
      errorCode,
      response.status,
    );
  }

  const accessToken = payload.access_token;
  if (!accessToken) {
    throw new OAuthRefreshError(
      `${provider} OAuth refresh response missing access_token`,
      "invalid_response",
      response.status,
    );
  }

  return {
    accessToken,
    refreshToken: payload.refresh_token,
    expiresIn: getOptionalNumber(payload.expires_in),
  };
};

export async function refreshNotionToken(
  refreshToken: string,
  config: OAuthRefreshConfig,
): Promise<OAuthRefreshResult> {
  return requestRefreshToken(refreshToken, config, "notion");
}

export async function refreshLinearToken(
  refreshToken: string,
  config: OAuthRefreshConfig,
): Promise<OAuthRefreshResult> {
  return requestRefreshToken(refreshToken, config, "linear");
}

export async function refreshGitHubToken(
  refreshToken: string,
  config: OAuthRefreshConfig,
): Promise<OAuthRefreshResult> {
  return requestRefreshToken(refreshToken, config, "github");
}
