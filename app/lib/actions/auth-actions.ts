"use server";

import { createClient } from "@/lib/supabase/server";
import { LoginFormData, RegisterFormData } from "../types";

// Simple in-memory rate limiting (in production, use Redis or database)
const rateLimitMap = new Map<
  string,
  { attempts: number; lastAttempt: number }
>();

function getRateLimitKey(email: string, action: string): string {
  return `${action}:${email.toLowerCase()}`;
}

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
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  // Reset if window has passed
  if (now - record.lastAttempt > windowMs) {
    rateLimitMap.set(key, { attempts: 1, lastAttempt: now });
    return false;
  }

  // Increment attempts
  record.attempts++;
  record.lastAttempt = now;

  return record.attempts > maxAttempts;
}

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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return "Please enter a valid email address.";
  }

  return null;
}

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
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }

  return null;
}

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
  if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) {
    return "Name can only contain letters, spaces, hyphens, and apostrophes.";
  }

  return null;
}

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

  // Check rate limiting
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
    // Generic error message to prevent user enumeration
    return { error: "Invalid email or password." };
  }

  // Success: clear rate limiting on successful login
  rateLimitMap.delete(getRateLimitKey(email, "login"));
  return { error: null };
}

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

  // Check rate limiting
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
    // Handle specific errors while preventing information disclosure
    if (error.message.includes("already registered")) {
      return { error: "An account with this email already exists." };
    }
    return { error: "Registration failed. Please try again." };
  }

  // Success: clear rate limiting on successful registration
  rateLimitMap.delete(getRateLimitKey(email, "register"));
  return { error: null };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { error: "Logout failed. Please try again." };
  }
  return { error: null };
}

export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

export async function getSession() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return null;
    }
    return data.session;
  } catch {
    return null;
  }
}
