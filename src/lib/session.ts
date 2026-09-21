import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { decryptToken, encryptToken } from "./crypto";
import { Provider, AuditAction } from "@prisma/client";

const SESSION_COOKIE = "mono_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "monotransfer-production-super-secret-session-key-min32chars!";

export interface SessionPayload {
  userId: string;
  email?: string | null;
  name?: string | null;
}

export interface WsTokenPayload {
  userId: string;
  transferId?: string;
  purpose: "websocket";
}

/**
 * Creates and signs a session JWT (30-day expiry).
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: "30d" });
}

/**
 * Creates a narrow-purpose 2-minute token specifically for WebSocket connection authentication.
 */
export function signWsToken(userId: string, transferId?: string): string {
  const payload: WsTokenPayload = {
    userId,
    transferId,
    purpose: "websocket",
  };
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: "2m" });
}

/**
 * Verifies a WebSocket token.
 */
export function verifyWsToken(token: string): WsTokenPayload | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET) as WsTokenPayload;
    if (decoded.purpose !== "websocket" || !decoded.userId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verifies a session token string.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SESSION_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Reads and verifies the current session from incoming request cookies.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Shared session guard for route handlers. Throws or returns session.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    const error: any = new Error("Unauthorized: Active session required");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

/**
 * Sets session cookie in response headers.
 */
export async function setSessionCookie(payload: SessionPayload): Promise<string> {
  const token = signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  return token;
}

/**
 * Clears session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * The single source of truth for reading external access tokens.
 * Checks expiry with 5-minute safety margin, transparently refreshes if expired,
 * encrypts and updates in DB, and writes an audit log.
 */
export async function getValidAccessToken(
  userId: string,
  provider: Provider,
  forceRefresh = false
): Promise<string> {
  const connection = await prisma.connection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
  });

  if (!connection) {
    const err: any = new Error(`No ${provider} connection found for user ${userId}`);
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const safetyMarginMs = 5 * 60 * 1000; // 5 minutes safety margin
  const isExpiringSoon = connection.expiresAt.getTime() - now.getTime() < safetyMarginMs;

  if (!forceRefresh && !isExpiringSoon) {
    return decryptToken(connection.accessTokenEnc, connection.iv, connection.authTag);
  }

  // Token needs refresh
  if (!connection.refreshTokenEnc) {
    const err: any = new Error(`${provider} token expired and no refresh token is stored`);
    err.statusCode = 401;
    throw err;
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc, connection.iv, connection.authTag);

  let newAccessToken = "";
  let newExpiresInSec = 3600;
  let newRefreshToken = refreshToken;

  if (provider === Provider.SPOTIFY) {
    const clientId = process.env.SPOTIFY_CLIENT_ID || "";
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to refresh Spotify token: ${resp.statusText}`);
    }

    const data = await resp.json();
    newAccessToken = data.access_token;
    newExpiresInSec = data.expires_in || 3600;
    if (data.refresh_token) {
      newRefreshToken = data.refresh_token;
    }
  } else if (provider === Provider.GOOGLE) {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to refresh Google token: ${resp.statusText}`);
    }

    const data = await resp.json();
    newAccessToken = data.access_token;
    newExpiresInSec = data.expires_in || 3600;
  }

  // Encrypt new tokens
  const encAccess = encryptToken(newAccessToken);
  const encRefresh = encryptToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + newExpiresInSec * 1000);

  // Update in DB with new IV and authTag
  await prisma.connection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encAccess.ciphertext,
      refreshTokenEnc: encRefresh.ciphertext,
      iv: encAccess.iv,
      authTag: encAccess.authTag,
      expiresAt,
    },
  });

  // Log token refresh in AuditLog
  await prisma.auditLog.create({
    data: {
      userId,
      action: AuditAction.TOKEN_REFRESHED,
      metadata: JSON.stringify({ provider, expiresAt }),
    },
  });

  return newAccessToken;
}
