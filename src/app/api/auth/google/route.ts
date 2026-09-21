import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth-providers";
import { handleRouteError } from "@/lib/api-handler";

export async function GET(request: NextRequest) {
  try {
    const url = await getGoogleAuthUrl(request);
    return NextResponse.redirect(url);
  } catch (error) {
    return handleRouteError(error);
  }
}
