// OAuth 2.0 Authorization Code Flow with PKCE for MCP servers
// Uses Obsidian's registerObsidianProtocolHandler for callback handling
// Supports MCP OAuth auto-discovery via RFC 9728 (Protected Resource Metadata)

import { requestUrl } from "obsidian";

// OAuth configuration for an MCP server
export interface OAuthConfig {
  clientId: string;
  authorizationUrl: string;      // Authorization endpoint
  tokenUrl: string;              // Token endpoint
  scopes: string[];              // Required scopes
  clientSecret?: string;         // Optional client secret (not recommended for public clients)
}

// OAuth tokens stored for an MCP server
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;            // Unix timestamp in milliseconds
  tokenType?: string;            // Usually "Bearer"
}

// Protected Resource Metadata (RFC 9728)
interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
}

// OAuth Authorization Server Metadata (RFC 8414)
interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  // MCP-specific: client registration
  registration_endpoint?: string;
}

// Result of OAuth discovery
export interface OAuthDiscoveryResult {
  config: OAuthConfig;
  serverMetadata: AuthorizationServerMetadata;
  resourceMetadata: ProtectedResourceMetadata;
}

// Pending OAuth state for tracking authorization flow
interface PendingOAuthState {
  serverName: string;
  config: OAuthConfig;           // OAuth config for token exchange
  codeVerifier: string;          // PKCE code verifier
  resolve: (tokens: OAuthTokens) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// Protocol action name for OAuth callback
export const OAUTH_PROTOCOL_ACTION = "gemini-helper-oauth";

// Callback URL format: obsidian://gemini-helper-oauth?code=xxx&state=yyy
export function getOAuthRedirectUri(): string {
  return `obsidian://${OAUTH_PROTOCOL_ACTION}`;
}

// Store pending OAuth states by state parameter
const pendingStates = new Map<string, PendingOAuthState>();

// OAuth timeout (5 minutes)
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Generate a random string for state and PKCE
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Generate PKCE code challenge from verifier (SHA256 + base64url)
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build authorization URL with PKCE
 */
export async function buildAuthorizationUrl(
  config: OAuthConfig,
  state: string,
  codeVerifier: string
): Promise<string> {
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: getOAuthRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // Only add scope if scopes are provided (empty scope can cause invalid_scope error)
  if (config.scopes.length > 0) {
    params.set("scope", config.scopes.join(" "));
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  codeVerifier: string
): Promise<OAuthTokens> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: getOAuthRedirectUri(),
    code_verifier: codeVerifier,
  };

  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  const response = await requestUrl({
    url: config.tokenUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = response.json;

  if (data.error) {
    throw new Error(`OAuth token error: ${data.error} - ${data.error_description || ""}`);
  }

  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    tokenType: data.token_type || "Bearer",
  };

  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }

  if (data.expires_in) {
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
  }

  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<OAuthTokens> {
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  };

  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  const response = await requestUrl({
    url: config.tokenUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = response.json;

  if (data.error) {
    throw new Error(`OAuth refresh error: ${data.error} - ${data.error_description || ""}`);
  }

  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    tokenType: data.token_type || "Bearer",
  };

  // Some providers return a new refresh token
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  } else {
    // Keep the existing refresh token
    tokens.refreshToken = refreshToken;
  }

  if (data.expires_in) {
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
  }

  return tokens;
}

/**
 * Check if tokens are expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expiresAt) {
    return false; // No expiration info, assume valid
  }
  // Consider expired if within 5 minutes of expiration
  return Date.now() >= tokens.expiresAt - 5 * 60 * 1000;
}

/**
 * Start OAuth authorization flow
 * Returns a promise that resolves when the callback is received
 */
export function startAuthorizationFlow(
  serverName: string,
  config: OAuthConfig
): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);

    // Set timeout for OAuth flow
    const timeoutId = setTimeout(() => {
      pendingStates.delete(state);
      reject(new Error("OAuth authorization timed out"));
    }, OAUTH_TIMEOUT_MS);

    // Store pending state
    pendingStates.set(state, {
      serverName,
      config,
      codeVerifier,
      resolve,
      reject,
      timeoutId,
    });

    // Build and open authorization URL
    buildAuthorizationUrl(config, state, codeVerifier)
      .then((url) => {
        // Open in default browser
        window.open(url, "_blank");
      })
      .catch((error) => {
        pendingStates.delete(state);
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/**
 * Handle OAuth callback from protocol handler
 * Called by the plugin when receiving obsidian://gemini-helper-oauth
 * Returns tokens and config so both can be persisted
 */
export async function handleOAuthCallback(
  params: Record<string, string>
): Promise<{ serverName: string; tokens: OAuthTokens; config: OAuthConfig } | null> {
  const { code, state, error, error_description } = params;

  // Check for OAuth error response
  if (error) {
    const pendingState = state ? pendingStates.get(state) : null;
    if (pendingState) {
      clearTimeout(pendingState.timeoutId);
      pendingStates.delete(state);
      pendingState.reject(new Error(`OAuth error: ${error} - ${error_description || ""}`));
    }
    return null;
  }

  if (!state || !code) {
    console.error("OAuth callback missing state or code");
    return null;
  }

  const pendingState = pendingStates.get(state);
  if (!pendingState) {
    console.error("OAuth callback with unknown state:", state);
    return null;
  }

  // Clear timeout and remove pending state
  clearTimeout(pendingState.timeoutId);
  pendingStates.delete(state);

  try {
    // Exchange code for tokens using stored config
    const tokens = await exchangeCodeForTokens(pendingState.config, code, pendingState.codeVerifier);
    pendingState.resolve(tokens);
    // Return config along with tokens so it can be persisted for future token refresh
    return { serverName: pendingState.serverName, tokens, config: pendingState.config };
  } catch (err) {
    pendingState.reject(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/**
 * Cancel pending OAuth flow for a server
 */
export function cancelPendingOAuth(serverName: string): void {
  for (const [state, pending] of pendingStates.entries()) {
    if (pending.serverName === serverName) {
      clearTimeout(pending.timeoutId);
      pendingStates.delete(state);
      pending.reject(new Error("OAuth authorization cancelled"));
    }
  }
}

/**
 * Check if there's a pending OAuth flow for a server
 */
export function hasPendingOAuth(serverName: string): boolean {
  for (const pending of pendingStates.values()) {
    if (pending.serverName === serverName) {
      return true;
    }
  }
  return false;
}

/**
 * Get number of pending OAuth flows (for debugging)
 */
export function getPendingOAuthCount(): number {
  return pendingStates.size;
}

/**
 * Discover OAuth configuration from MCP server using RFC 9728
 * First tries to get resource_metadata URL from WWW-Authenticate header,
 * then falls back to well-known URL at origin
 */
export async function discoverOAuthFromServer(serverUrl: string): Promise<OAuthDiscoveryResult | null> {
  const baseUrl = new URL(serverUrl);
  const origin = baseUrl.origin;

  // Step 1: Try to access the server to check for WWW-Authenticate header with resource_metadata
  let resourceMetadataUrl: string | null = null;
  try {
    // Make a request to see if we get a 401 with WWW-Authenticate
    // Use throw: false to get the response even on 4xx status
    const response = await requestUrl({
      url: serverUrl,
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 0 }),
      throw: false,
    });

    // Check if we got a 401 with WWW-Authenticate header (RFC 9728)
    if (response.status === 401) {
      const wwwAuth = response.headers["www-authenticate"];
      if (wwwAuth) {
        resourceMetadataUrl = parseWwwAuthenticateHeader(wwwAuth);
      }
    }
    // For 2xx or other error statuses, fall through to well-known check
  } catch {
    // Network error or other issue - fall through to well-known check
  }

  // Step 2: Use resource_metadata from header if available, otherwise use well-known URL
  if (resourceMetadataUrl) {
    return discoverOAuthFromMetadataUrl(resourceMetadataUrl);
  }

  // Fall back to well-known URL at origin
  const wellKnownUrl = `${origin}/.well-known/oauth-protected-resource`;
  return discoverOAuthFromMetadataUrl(wellKnownUrl);
}

/**
 * Try to discover OAuth from a 401 response's WWW-Authenticate header
 * Returns the resource_metadata URL if present
 */
export function parseWwwAuthenticateHeader(header: string): string | null {
  // Parse WWW-Authenticate: Bearer resource_metadata="https://..."
  const match = header.match(/resource_metadata="([^"]+)"/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Fetch OAuth config from a resource_metadata URL
 */
export async function discoverOAuthFromMetadataUrl(resourceMetadataUrl: string): Promise<OAuthDiscoveryResult | null> {
  // Step 1: Fetch Protected Resource Metadata
  let resourceMetadata: ProtectedResourceMetadata;
  try {
    const response = await requestUrl({
      url: resourceMetadataUrl,
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    resourceMetadata = response.json as ProtectedResourceMetadata;
  } catch {
    return null;
  }

  // Step 2: Get authorization server URL
  const authServers = resourceMetadata.authorization_servers;
  if (!authServers || authServers.length === 0) {
    return null;
  }

  const authServerUrl = authServers[0];

  // Step 3: Fetch Authorization Server Metadata
  let serverMetadata: AuthorizationServerMetadata;
  try {
    const authServerOrigin = new URL(authServerUrl).origin;
    const metadataUrl = `${authServerOrigin}/.well-known/oauth-authorization-server`;
    const response = await requestUrl({
      url: metadataUrl,
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    serverMetadata = response.json as AuthorizationServerMetadata;
  } catch {
    try {
      const authServerOrigin = new URL(authServerUrl).origin;
      const oidcUrl = `${authServerOrigin}/.well-known/openid-configuration`;
      const response = await requestUrl({
        url: oidcUrl,
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });
      serverMetadata = response.json as AuthorizationServerMetadata;
    } catch {
      return null;
    }
  }

  // Step 4: Build OAuth config
  const config: OAuthConfig = {
    clientId: "obsidian-gemini-helper",
    authorizationUrl: serverMetadata.authorization_endpoint,
    tokenUrl: serverMetadata.token_endpoint,
    scopes: resourceMetadata.scopes_supported || serverMetadata.scopes_supported || [],
  };

  return {
    config,
    serverMetadata,
    resourceMetadata,
  };
}
