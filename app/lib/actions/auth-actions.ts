"use server";

import { createClient } from "@/lib/supabase/server";
import { LoginFormData, RegisterFormData } from "../types";

// Simple in-memory rate limiting (in production, use Redis or database)
/**
 * In-memory store for rate-limiting login and registration attempts.
 *
 * @remarks
 * This is a simple, non-persistent solution suitable for development.
 * For production, a more robust solution like Redis or a database-backed store
 * is recommended to ensure persistence and scalability across multiple server instances.
 *
 * The key is a combination of the action (e.g., 'login') and the user's email,
 * and the value stores the number of attempts and the timestamp of the last attempt.
 */
const rateLimitMap = new Map<
  string,
  { attempts: number; lastAttempt: number }
>();

/**
 * Generates a unique key for rate-limiting based on the user's email and the action being performed.
 *
 * @param email - The user's email address.
 * @param action - The action being rate-limited (e.g., 'login', 'register').
 * @returns A unique string key for the rate-limiting map.
 */
function getRateLimitKey(email: string, action: string): string {
  return `${action}:${email.toLowerCase()}`;
}

/**
 * Checks if a user is rate-limited for a specific action.
 *
 * @param email - The user's email address.
 * @param action - The action to check (e.g., 'login', 'register').
 * @param maxAttempts - The maximum number of allowed attempts within the time window. Defaults to 5.
 * @param windowMs - The time window in milliseconds. Defaults to 15 minutes.
 * @returns `true` if the user is rate-limited, `false` otherwise.
 */
function isRateLimited(
  email: string,
  action: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): boolean {
  const key = getRateLimitKey(email, action);
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    // No record found, so this is the first attempt.
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  // Reset the attempt count if the time window has passed.
  if (now - record.lastAttempt > windowMs) {
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  // Increment the attempt count.
  record.attempts++;
  record.lastAttempt = now;

  // The user is rate-limited if they have exceeded the maximum number of attempts.
  return record.attempts > maxAttempts;
}

/**
 * Validates an email address against a set of rules.
 *
 * @param email - The email address to validate.
 * @returns A string with an error message if validation fails, or `null` if it succeeds.
 */
function validateEmail(email: string): string | null {
  if (!email || typeof email !== "string") {
    return "Email is required.";
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length === 0) {
    return "Email is required.";
  }

  if (trimmedEmail.length > 254) {
    return "Email is too long.";
  }

  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return "Please enter a valid email address.";
  }

  return null;
}

/**
 * Validates a password against a set of security rules.
 *
 * @param password - The password to validate.
 * @returns A string with an error message if validation fails, or `null` if it succeeds.
 */
function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") {
    return "Password is required.";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  if (password.length > 128) {
    return "Password is too long.";
  }

  // Check for at least one number and one letter
  if (!/(?=.*[a-zA-Z])(?=.*\\d)/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }

  return null;
}

/**
 * Validates a user's name.
 *
 * @param name - The name to validate.
 * @returns A string with an error message if validation fails, or `null` if it succeeds.
 */
function validateName(name: string): string | null {
  if (!name || typeof name !== "string") {
    return "Name is required.";
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return "Name is required.";
  }

  if (trimmedName.length > 100) {
    return "Name must be less than 100 characters.";
  }

  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\\s'-]+$/.test(trimmedName)) {
    return "Name can only contain letters, spaces, hyphens, and apostrophes.";
  }

  return null;
}

/**
 * Handles the user login flow. It validates credentials, checks for rate-limiting,
 * and attempts to sign in the user with Supabase.
 *
 * @param data - An object containing the user's email and password.
 * @returns An object with either an `error` message or `null` on success.
 */
export async function login(data: LoginFormData) {
  const supabase = await createClient();

  // Validate input
  const emailError = validateEmail(data.email);
  if (emailError) {
    return { error: emailError };
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    return { error: passwordError };
  }

  const email = data.email.trim().toLowerCase();

  // Security: Apply rate-limiting to prevent brute-force attacks.
  if (isRateLimited(email, "login", 5, 15 * 60 * 1000)) {
    return {
      error: "Too many login attempts. Please try again in 15 minutes.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: data.password,
  });

  if (error) {
    // Security: Return a generic error message to prevent user enumeration attacks,
    // where an attacker could otherwise determine if an email is registered.
    return { error: "Invalid email or password." };
  }

  // On successful login, clear any previous rate-limiting records for this user.
  rateLimitMap.delete(getRateLimitKey(email, "login"));
  return { error: null };
}

/**
 * Handles the user registration flow. It validates user input, checks for rate-limiting,
 * and attempts to sign up the user with Supabase.
 *
 * @param data - An object containing the user's name, email, and password.
 * @returns An object with either an `error` message or `null` on success.
 */
export async function register(data: RegisterFormData) {
  const supabase = await createClient();

  // Validate input
  const nameError = validateName(data.name);
  if (nameError) {
    return { error: nameError };
  }

  const emailError = validateEmail(data.email);
  if (emailError) {
    return { error: emailError };
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    return { error: passwordError };
  }

  const email = data.email.trim().toLowerCase();
  const name = data.name.trim();

  // Security: Apply rate-limiting to prevent spam or abuse.
  if (isRateLimited(email, "register", 3, 60 * 60 * 1000)) {
    return {
      error: "Too many registration attempts. Please try again in 1 hour.",
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password: data.password,
    options: {
      data: {
        name,
      },
    },
  });

  if (error) {
    // Provide a more specific error if the user already exists,
    // which is acceptable in a registration context.
    if (error.message.includes("already registered")) {
      return { error: "An account with this email already exists." };
    }
    // For other errors, return a generic message.
    return { error: "Registration failed. Please try again." };
  }

  // On successful registration, clear any previous rate-limiting records.
  rateLimitMap.delete(getRateLimitKey(email, "register"));
  return { error: null };
}

/**
 * Logs out the currently authenticated user.
 *
 * @returns An object with either an `error` message or `null` on success.
 */
export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { error: "Logout failed. Please try again." };
  }
  return { error: null };
}

/**
 * Retrieves the currently authenticated user's data.
 *
 * @returns The user object if authenticated, otherwise `null`.
 *          Returns `null` on any error to ensure the caller can safely handle unauthenticated states.
 */
export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }
    return data.user;
  } catch {
    // Catch any unexpected errors during client creation or the request itself.
    return null;
  }
}

/**
 * Retrieves the current session data for the user.
 *
 * @returns The session object if a valid session exists, otherwise `null`.
 */
export async function getSession() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return null;
    }
    return data.session;
  } catch {
    // Catch any unexpected errors.
    return null;
  }
}
