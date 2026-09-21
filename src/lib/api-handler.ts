import { NextResponse } from "next/server";

export function handleRouteError(error: any): NextResponse {
  console.error("[API Error]", error);

  if (error?.name === "YouTubeQuotaError" || error?.message?.includes("quotaExceeded")) {
    return NextResponse.json(
      {
        error: "YouTubeQuotaError",
        message: "YouTube Data API quota exceeded. Please wait or try again later.",
      },
      { status: 429 }
    );
  }

  if (error?.statusCode === 401 || error?.message?.includes("Unauthorized")) {
    return NextResponse.json(
      { error: "Unauthorized", message: error.message || "Active session required" },
      { status: 401 }
    );
  }

  if (error?.statusCode === 404 || error?.message?.includes("not found")) {
    return NextResponse.json(
      { error: "NotFound", message: error.message || "Requested resource not found" },
      { status: 404 }
    );
  }

  if (error?.name === "ValidationError" || error?.statusCode === 400) {
    return NextResponse.json(
      { error: "BadRequest", message: error.message || "Invalid request parameters" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "InternalServerError", message: error?.message || "An unexpected error occurred" },
    { status: 500 }
  );
}
