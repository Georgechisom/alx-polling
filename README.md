# ALX Polly Security Audit Report

## Overview

This document presents the results of a security audit conducted on the ALX Polly polling application. The audit focused on identifying vulnerabilities, assessing their potential impact, and recommending mitigations to improve the application's security posture.

## Summary

ALX Polly is a modern polling application built with Next.js, TypeScript, and Supabase. While the application demonstrates solid use of contemporary web technologies, several security vulnerabilities were identified during the audit. Addressing these issues is critical to protect user data, maintain application integrity, and prevent unauthorized actions.

## Discovered Vulnerabilities

### 1. Insecure Direct Object References (IDOR)

- **Impact:** Unauthorized users may access, modify, or delete polls or votes belonging to other users by manipulating resource identifiers.
- **Affected Components:** API endpoints and server actions handling poll and vote management (e.g., `/app/lib/actions/`, `/app/(dashboard)/`).
- **Mitigation:** Implement strict authorization checks to ensure users can only access or modify resources they own. Validate user identity against resource ownership before performing any sensitive operation.

### 2. Insufficient Authentication Enforcement

- **Impact:** Unauthenticated users may be able to access protected routes or perform actions intended for authenticated users.
- **Affected Components:** Route protection logic in Next.js pages and API routes.
- **Mitigation:** Enforce authentication checks on all sensitive routes and server actions. Redirect unauthenticated users to the login page and prevent unauthorized API access.

### 3. Lack of Input Validation and Sanitization

- **Impact:** The application may be vulnerable to injection attacks (e.g., SQL Injection, XSS) if user input is not properly validated or sanitized.
- **Affected Components:** Form handlers, database queries, and any component processing user input.
- **Mitigation:** Validate and sanitize all user input on both client and server sides. Use parameterized queries and output encoding to prevent injection attacks.

### 4. Inadequate Error Handling and Information Disclosure

- **Impact:** Detailed error messages may leak sensitive information about the application's internals, aiding attackers in crafting targeted attacks.
- **Affected Components:** API responses, server logs, and error pages.
- **Mitigation:** Return generic error messages to users and log detailed errors securely on the server. Avoid exposing stack traces or internal implementation details in client-facing responses.

### 5. Weak Session Management

- **Impact:** Poor session handling could allow session hijacking or fixation, leading to unauthorized access.
- **Affected Components:** Authentication/session management logic, cookie settings.
- **Mitigation:** Use secure, HTTP-only cookies with appropriate SameSite attributes. Implement session expiration and regeneration on sensitive actions (e.g., login).

### 6. Missing Rate Limiting and Brute Force Protection

- **Impact:** Attackers may exploit authentication endpoints or voting mechanisms via brute force or automated attacks.
- **Affected Components:** Login, registration, and voting endpoints.
- **Mitigation:** Implement rate limiting and account lockout mechanisms to prevent abuse. Use CAPTCHA or similar solutions where appropriate.

## Recommendations

- **Conduct regular security reviews** and penetration testing.
- **Keep dependencies up to date** and monitor for known vulnerabilities.
- **Educate developers** on secure coding practices and common web vulnerabilities.
- **Implement logging and monitoring** to detect and respond to suspicious activities.

## Conclusion

While ALX Polly provides a strong foundation for a modern polling application, addressing the identified vulnerabilities is essential to ensure user trust and application security. Prompt remediation of these issues, combined with ongoing security practices, will significantly enhance the application's resilience against attacks.

## Security Fixes Implemented

The following section documents all security vulnerabilities that have been identified and fixed in the ALX Polly application:

### 1. Fixed: Insecure Direct Object References (IDOR)

**What was vulnerable:**

- `deletePoll()` function allowed any authenticated user to delete any poll by providing the poll ID
- `getPollById()` provided detailed error messages that could leak information
- `updatePoll()` had insufficient ownership validation

**How the fix mitigates the vulnerability:**

```typescript
// BEFORE: Vulnerable delete function
export async function deletePoll(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("polls").delete().eq("id", id);
  // No ownership check - VULNERABLE!
}

// AFTER: Secure delete function with ownership validation
export async function deletePoll(id: string) {
  const supabase = await createClient();

  // Verify authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Authentication required to delete polls." };
  }

  // Only allow deleting polls owned by the user
  const { error } = await supabase
    .from("polls")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // SECURE: Ownership check
}
```

**Why this won't disrupt legitimate workflows:**

- Users can still delete their own polls seamlessly
- Only prevents unauthorized deletion of other users' polls
- Clear error messages guide legitimate users

---

### 2. Fixed: Insufficient Authentication Enforcement

**What was vulnerable:**

- Middleware had incomplete route protection coverage
- Missing authentication checks on critical operations
- No security headers to prevent common attacks

**How the fix mitigates the vulnerability:**

```typescript
// BEFORE: Basic middleware with limited protection
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// AFTER: Enhanced middleware with comprehensive protection
export async function middleware(request: NextRequest) {
  // Define protected routes that require authentication
  const protectedPaths = ["/create", "/admin", "/polls/[id]/edit"];

  const response = await updateSession(request);

  // Add security headers to all responses
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Content-Security-Policy", "default-src 'self'...");
}
```

**Why this won't disrupt legitimate workflows:**

- Public polls remain accessible to all users
- Authenticated users can still access all their permitted features
- Security headers are transparent to users but protect against attacks

---

### 3. Fixed: Lack of Input Validation and Sanitization

**What was vulnerable:**

- No length limits on user inputs (potential DoS)
- No sanitization of user content (XSS risk)
- Missing validation for poll options and voting

**How the fix mitigates the vulnerability:**

```typescript
// BEFORE: No validation
export async function createPoll(formData: FormData) {
  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];
  // Direct use without validation - VULNERABLE!
}

// AFTER: Comprehensive validation and sanitization
function validatePollInput(question: string, options: string[]) {
  const errors: string[] = [];

  // Validate question
  if (!question || typeof question !== "string") {
    errors.push("Question is required.");
  } else if (question.trim().length > 500) {
    errors.push("Question must be less than 500 characters.");
  }

  // Validate options (length, count, content)
  if (options.length > 10) {
    errors.push("Maximum of 10 options allowed.");
  }

  return errors;
}

function sanitizeString(str: string): string {
  return str.trim().replace(/[<>]/g, ""); // Remove potential XSS chars
}
```

**Why this won't disrupt legitimate workflows:**

- Validation limits are generous (500 chars for questions, 200 for options)
- Sanitization only removes potentially dangerous characters
- Clear error messages guide users to fix input issues

---

### 4. Fixed: Inadequate Error Handling and Information Disclosure

**What was vulnerable:**

- Raw database errors exposed to users
- Detailed error messages that could aid attackers
- Stack traces visible in client responses

**How the fix mitigates the vulnerability:**

```typescript
// BEFORE: Information disclosure through errors
export async function login(data: LoginFormData) {
  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    return { error: error.message }; // Exposes internal details!
  }
}

// AFTER: Generic error messages
export async function login(data: LoginFormData) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: data.password,
  });

  if (error) {
    return { error: "Invalid email or password." }; // Generic message
  }
}
```

**Why this won't disrupt legitimate workflows:**

- Users still receive helpful feedback about invalid inputs
- Generic messages are user-friendly while maintaining security
- Detailed errors are logged server-side for debugging

---

### 5. Fixed: Weak Session Management

**What was vulnerable:**

- Cookies without security flags
- No httpOnly protection
- Missing SameSite protection against CSRF

**How the fix mitigates the vulnerability:**

```typescript
// BEFORE: Basic cookie handling
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) =>
    request.cookies.set(name, value)
  )
}

// AFTER: Secure cookie configuration
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    const secureOptions = {
      ...options,
      httpOnly: true,                    // Prevent XSS access
      secure: process.env.NODE_ENV === 'production', // HTTPS only
      sameSite: 'lax' as const,         // CSRF protection
      path: '/',                        // Proper scope
    }
    supabaseResponse.cookies.set(name, value, secureOptions);
  })
}
```

**Why this won't disrupt legitimate workflows:**

- Sessions work exactly the same from user perspective
- Enhanced security is transparent to legitimate users
- Only blocks malicious access attempts

---

### 6. Fixed: Missing Rate Limiting and Brute Force Protection

**What was vulnerable:**

- No protection against automated login attempts
- No registration spam protection
- No voting abuse prevention

**How the fix mitigates the vulnerability:**

```typescript
// Rate limiting implementation
const rateLimitMap = new Map<
  string,
  { attempts: number; lastAttempt: number }
>();

function isRateLimited(
  email: string,
  action: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const key = getRateLimitKey(email, action);
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  // Reset if window has passed
  if (now - record.lastAttempt > windowMs) {
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  record.attempts++;
  return record.attempts > maxAttempts;
}

// Applied to login function
export async function login(data: LoginFormData) {
  // Check rate limiting (5 attempts per 15 minutes)
  if (isRateLimited(email, "login", 5, 15 * 60 * 1000)) {
    return {
      error: "Too many login attempts. Please try again in 15 minutes.",
    };
  }
}
```

**Why this won't disrupt legitimate workflows:**

- Generous limits allow normal usage (5 login attempts per 15 minutes)
- Rate limits reset on successful authentication
- Only affects users making excessive failed attempts

---

### 7. Additional Security Enhancements

**Enhanced Voting Security:**

- Prevent duplicate voting by authenticated users
- Validate option indices to prevent manipulation
- Sanitize poll IDs to prevent injection attacks

**Input Validation Examples:**

```typescript
// Voting validation
export async function submitVote(pollId: string, optionIndex: number) {
  // Validate poll ID format
  if (!pollId || typeof pollId !== "string" || pollId.trim().length === 0) {
    return { error: "Invalid poll ID." };
  }

  // Validate option index
  if (
    typeof optionIndex !== "number" ||
    optionIndex < 0 ||
    !Number.isInteger(optionIndex)
  ) {
    return { error: "Invalid option selected." };
  }

  // Verify poll exists and option is valid
  const { poll, error: pollError } = await getPollById(pollId.trim());
  if (pollError || !poll) {
    return { error: "Poll not found." };
  }

  if (optionIndex >= poll.options.length) {
    return { error: "Invalid option selected." };
  }

  // Check for duplicate votes
  if (user) {
    const { data: existingVote } = await supabase
      .from("votes")
      .select("id")
      .eq("poll_id", pollId.trim())
      .eq("user_id", user.id)
      .single();

    if (existingVote) {
      return { error: "You have already voted on this poll." };
    }
  }
}
```

---

## Security Testing Recommendations

To verify these fixes work correctly:

1. **Test IDOR Protection:**

   - Try to delete/edit polls owned by other users
   - Verify proper error messages without information leakage

2. **Test Rate Limiting:**

   - Attempt multiple failed logins to trigger rate limiting
   - Verify successful login resets the counter

3. **Test Input Validation:**

   - Submit forms with oversized content, special characters
   - Verify proper sanitization and validation messages

4. **Test Authentication:**

   - Access protected routes without authentication
   - Verify proper redirects and security headers

5. **Test Session Management:**
   - Check cookie security flags in browser dev tools
   - Verify session persistence and secure logout

---

## Production Deployment Notes

When deploying these fixes to production:

1. **Environment Variables:** Ensure `NODE_ENV=production` for secure cookies
2. **Rate Limiting:** Consider implementing Redis-based rate limiting for scalability
3. **Monitoring:** Add logging for security events (failed logins, rate limit hits)
4. **CSP Headers:** Fine-tune Content Security Policy for your specific deployment
5. **Testing:** Run security tests in staging environment before production deployment

All fixes have been designed to enhance security while maintaining full compatibility with existing user workflows and legitimate application usage.

---

## Project Overview & Tech Stack

This project is a modern web application designed for creating and managing polls. Users can register for an account, create polls with multiple options, and share them with others via a unique link or a scannable QR code.

### Key Features

- **User Authentication**: Secure user registration and login.
- **Poll Management**: Create, view, and delete polls.
- **Real-time Voting**: Vote on polls and see results.
- **QR Code Sharing**: Easily share polls using a generated QR code.

### Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Backend & Database**: [Supabase](https://supabase.com/) (Authentication, Postgres Database)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **QR Code Generation**: `qrcode.react`

## Setup Steps

Follow these instructions to set up the project for local development.

### 1. Clone the Repository

First, clone the repository to your local machine:

```bash
git clone https://github.com/your-username/alx-polling.git
cd alx-polling
```

### 2. Install Dependencies

Install the necessary project dependencies using your preferred package manager:

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Configure Supabase

This project uses Supabase for the backend. You'll need to set up a Supabase project to get the required API keys and database.

1.  **Create a Supabase Project**: Go to [supabase.com](https://supabase.com/), sign in, and create a new project.
2.  **Get API Keys**: In your project dashboard, navigate to **Project Settings** > **API**. You will need the **Project URL** and the `anon` **public key**.
3.  **Database Setup**: Go to the **SQL Editor** in your Supabase project dashboard and run the following SQL script to create the necessary tables (`polls` and `votes`):

    ```sql
    -- Create the polls table
    CREATE TABLE polls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create the votes table
    CREATE TABLE votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
      option_index INT NOT NULL,
      user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Allow anonymous votes but link if user is logged in
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable Row Level Security (RLS)
    ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
    ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

    -- Policies for polls table
    CREATE POLICY "Public polls are viewable by everyone." ON polls FOR SELECT USING (true);
    CREATE POLICY "Users can insert their own polls." ON polls FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update their own polls." ON polls FOR UPDATE USING (auth.uid() = user_id);
    CREATE POLICY "Users can delete their own polls." ON polls FOR DELETE USING (auth.uid() = user_id);

    -- Policies for votes table
    CREATE POLICY "Votes are viewable by everyone." ON votes FOR SELECT USING (true);
    CREATE POLICY "Users can cast votes." ON votes FOR INSERT WITH CHECK (true);
    ```

### 4. Set Environment Variables

Create a `.env.local` file in the root of the project and add your Supabase project credentials.

```bash
cp .env.example .env.local
```

Fill in the `.env.local` file with your keys:

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=[YOUR_SUPABASE_PROJECT_URL]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_SUPABASE_ANON_KEY]
```

Replace `[YOUR_SUPABASE_PROJECT_URL]` and `[YOUR_SUPABASE_ANON_KEY]` with the values from your Supabase project.

## Usage Examples

### Creating a Poll

1.  Register for an account or log in.
2.  Navigate to the **Create Poll** page (`/create`).
3.  Enter your poll question and at least two options.
4.  Click **Create Poll** to submit.

### Voting on a Poll

1.  Open a poll's unique URL (e.g., `/polls/your-poll-id`).
2.  Select one of the options.
3.  Click the **Vote** button. You can vote once per poll.

## Running & Testing Locally

### Running the Development Server

To run the app in development mode, execute the following command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Running Tests

The project is set up for testing, but specific test suites have not been implemented yet. You can run tests using:

```bash
npm test
```

**Note**: For tests involving Supabase, ensure your environment variables are correctly configured, as tests may interact with your development database.
