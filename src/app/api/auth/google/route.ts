import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth-providers";
import { handleRouteError } from "@/lib/api-handler";

export async function GET() {
  try {
    const url = await getGoogleAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    return handleRouteError(error);
  }
}
