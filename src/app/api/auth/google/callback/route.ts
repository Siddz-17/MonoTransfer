import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback } from "@/lib/auth-providers";
import { handleRouteError } from "@/lib/api-handler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/?error=missing_oauth_params", request.url));
    }

    await handleGoogleCallback(code, state);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (err: any) {
    console.error("[Google Callback Error]", err);
    return handleRouteError(err);
  }
}
