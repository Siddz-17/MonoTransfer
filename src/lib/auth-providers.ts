import { NextRequest } from "next/server";

export function getAppBaseUrl(request?: NextRequest): string {
  if (request) {
    const proto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }
  return (
    process.env.RENDER_EXTERNAL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function generateRandomState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function getSpotifyAuthUrl(request?: NextRequest): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const redirectUri = `${getAppBaseUrl(request)}/api/auth/spotify/callback`;
  const state = generateRandomState();

  const cookieStore = await cookies();
  cookieStore.set("spotify_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const scope = "playlist-read-private playlist-read-collaborative user-read-email user-read-private";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function getGoogleAuthUrl(request?: NextRequest): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri = `${getAppBaseUrl(request)}/api/auth/google/callback`;
  const state = generateRandomState();

  const cookieStore = await cookies();
  cookieStore.set("google_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const scope = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges Spotify code for access/refresh tokens and links to user.
 */
export async function handleSpotifyCallback(code: string, state: string, request?: NextRequest): Promise<string> {
  const cookieStore = await cookies();
  const savedState = cookieStore.get("spotify_auth_state")?.value;
  cookieStore.delete("spotify_auth_state");

  if (!savedState || savedState !== state) {
    throw new Error("Invalid OAuth state. Possible CSRF attack.");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
  const redirectUri = `${getAppBaseUrl(request)}/api/auth/spotify/callback`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`Spotify token exchange failed: ${errorBody}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Fetch user profile from Spotify
  const userRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const spotifyUser = userRes.ok ? await userRes.json() : { id: "spotify_user", email: null, display_name: null };

  const currentSession = await getSession();
  let userId = currentSession?.userId;

  if (!userId) {
    // If user already exists by email
    let user = spotifyUser.email
      ? await prisma.user.findUnique({ where: { email: spotifyUser.email } })
      : null;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: spotifyUser.email || null,
          name: spotifyUser.display_name || "Spotify User",
          preference: {
            create: {},
          },
        },
      });
    }
    userId = user.id;
  }

  const encAccess = encryptToken(accessToken);
  const encRefresh = refreshToken ? encryptToken(refreshToken) : null;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.connection.upsert({
    where: {
      userId_provider: {
        userId,
        provider: Provider.SPOTIFY,
      },
    },
    update: {
      providerUserId: spotifyUser.id,
      accessTokenEnc: encAccess.ciphertext,
      refreshTokenEnc: encRefresh?.ciphertext ?? undefined,
      iv: encAccess.iv,
      authTag: encAccess.authTag,
      expiresAt,
    },
    create: {
      userId,
      provider: Provider.SPOTIFY,
      providerUserId: spotifyUser.id,
      accessTokenEnc: encAccess.ciphertext,
      refreshTokenEnc: encRefresh?.ciphertext ?? "",
      iv: encAccess.iv,
      authTag: encAccess.authTag,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: AuditAction.CONNECT,
      metadata: JSON.stringify({ provider: "SPOTIFY", spotifyId: spotifyUser.id }),
    },
  });

  await setSessionCookie({ userId, email: spotifyUser.email, name: spotifyUser.display_name });
  return userId;
}

/**
 * Exchanges Google code for access/refresh tokens and links to user.
 */
export async function handleGoogleCallback(code: string, state: string, request?: NextRequest): Promise<string> {
  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_auth_state")?.value;
  cookieStore.delete("google_auth_state");

  if (!savedState || savedState !== state) {
    throw new Error("Invalid Google OAuth state. Possible CSRF attack.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = `${getAppBaseUrl(request)}/api/auth/google/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${errorBody}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Fetch Google userinfo
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const googleUser = userRes.ok ? await userRes.json() : { id: "google_user", email: null, name: null };

  const currentSession = await getSession();
  let userId = currentSession?.userId;

  if (!userId) {
    let user = googleUser.email
      ? await prisma.user.findUnique({ where: { email: googleUser.email } })
      : null;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: googleUser.email || null,
          name: googleUser.name || "Google User",
          preference: {
            create: {},
          },
        },
      });
    }
    userId = user.id;
  }

  const encAccess = encryptToken(accessToken);
  const encRefresh = refreshToken ? encryptToken(refreshToken) : null;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.connection.upsert({
    where: {
      userId_provider: {
        userId,
        provider: Provider.GOOGLE,
      },
    },
    update: {
      providerUserId: googleUser.id,
      accessTokenEnc: encAccess.ciphertext,
      refreshTokenEnc: encRefresh ? encRefresh.ciphertext : undefined,
      iv: encAccess.iv,
      authTag: encAccess.authTag,
      expiresAt,
    },
    create: {
      userId,
      provider: Provider.GOOGLE,
      providerUserId: googleUser.id,
      accessTokenEnc: encAccess.ciphertext,
      refreshTokenEnc: encRefresh ? encRefresh.ciphertext : "",
      iv: encAccess.iv,
      authTag: encAccess.authTag,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: AuditAction.CONNECT,
      metadata: JSON.stringify({ provider: "GOOGLE", googleId: googleUser.id }),
    },
  });

  await setSessionCookie({ userId, email: googleUser.email, name: googleUser.name });
  return userId;
}
