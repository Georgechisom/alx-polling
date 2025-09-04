import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes without session check
  const publicPaths = [
    "/login",
    "/register",
    "/",
    "/polls", // Allow public poll viewing
  ];

  // Protected paths that require authentication
  const protectedPaths = [
    "/create",
    "/admin",
    "/polls/[id]/edit", // Edit requires authentication
  ];

  // Admin-only paths
  const adminPaths = ["/admin"];

  // Check if path is protected
  const isProtectedPath = protectedPaths.some((path) => {
    if (path.includes("[")) {
      // Handle dynamic routes like /polls/[id]/edit
      const regex = new RegExp("^" + path.replace(/\[.*?\]/g, "[^/]+") + "$");
      return regex.test(pathname);
    }
    return pathname.startsWith(path);
  });

  const isAdminPath = adminPaths.some((path) => pathname.startsWith(path));

  // Update session and get user info
  const response = await updateSession(request);

  // For protected paths, ensure authentication
  if (isProtectedPath || isAdminPath) {
    // The updateSession function in supabase middleware already handles redirects
    // but we can add additional security headers here
    if (response.headers.get("location")) {
      // User was redirected (not authenticated)
      return response;
    }

    // Add security headers for authenticated routes
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
