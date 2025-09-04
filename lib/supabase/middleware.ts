import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Enhance cookie security
            const secureOptions = {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax" as const,
              path: "/",
            };
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, secureOptions);
          });

          supabaseResponse = NextResponse.next({
            request,
          });
        },
      },
    }
  );

  // Get both user and session for more comprehensive checks
  const {
    data: { user, session },
    error: authError,
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Define public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/polls", // Allow public poll viewing
  ];

  // Define routes that require authentication
  const protectedRoutes = ["/create", "/admin"];

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Check for edit routes (polls/[id]/edit)
  const isEditRoute = /^\/polls\/[^\/]+\/edit/.test(pathname);

  // Handle authentication requirements
  if (!user && (isProtectedRoute || isEditRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);

    const response = NextResponse.redirect(url);

    // Clear any existing auth cookies on redirect
    response.cookies.delete("supabase-auth-token");
    response.cookies.delete("supabase.auth.token");

    return response;
  }

  // For authenticated users on login/register pages, redirect to polls
  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/polls";
    return NextResponse.redirect(url);
  }

  // Add security headers to all responses
  const response = supabaseResponse;
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: *.supabase.co; connect-src 'self' *.supabase.co; frame-ancestors 'none';"
  );

  return response;
}
