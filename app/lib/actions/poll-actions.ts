"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Input validation helpers
function validatePollInput(question: string, options: string[]) {
  const errors: string[] = [];

  // Validate question
  if (!question || typeof question !== "string") {
    errors.push("Question is required.");
  } else {
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      errors.push("Question cannot be empty.");
    } else if (trimmedQuestion.length > 500) {
      errors.push("Question must be less than 500 characters.");
    }
  }

  // Validate options
  if (!Array.isArray(options) || options.length < 2) {
    errors.push("At least two options are required.");
  } else if (options.length > 10) {
    errors.push("Maximum of 10 options allowed.");
  } else {
    const validOptions = options.filter(
      (opt) => typeof opt === "string" && opt.trim().length > 0
    );
    if (validOptions.length < 2) {
      errors.push("At least two non-empty options are required.");
    }

    // Check option length
    const tooLongOptions = validOptions.filter(
      (opt) => opt.trim().length > 200
    );
    if (tooLongOptions.length > 0) {
      errors.push("Each option must be less than 200 characters.");
    }
  }

  return errors;
}

function sanitizeString(str: string): string {
  return str.trim().replace(/[<>]/g, "");
}

// CREATE POLL
export async function createPoll(formData: FormData) {
  const supabase = await createClient();

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  // Validate input
  const validationErrors = validatePollInput(question, options);
  if (validationErrors.length > 0) {
    return { error: validationErrors.join(" ") };
  }

  // Sanitize input
  const sanitizedQuestion = sanitizeString(question);
  const sanitizedOptions = options.map((opt) => sanitizeString(opt));

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to create a poll." };
  }

  const { error } = await supabase.from("polls").insert([
    {
      user_id: user.id,
      question: sanitizedQuestion,
      options: sanitizedOptions,
    },
  ]);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/polls");
  return { error: null };
}

// GET USER POLLS
export async function getUserPolls() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { polls: [], error: "Not authenticated" };

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { polls: [], error: error.message };
  return { polls: data ?? [], error: null };
}

// GET POLL BY ID - Public access for voting, but with sanitized errors
export async function getPollById(id: string) {
  const supabase = await createClient();

  // Validate ID format
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return { poll: null, error: "Invalid poll ID." };
  }

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id.trim())
    .single();

  if (error) {
    return { poll: null, error: "Poll not found." };
  }
  return { poll: data, error: null };
}

// GET POLL BY ID WITH OWNERSHIP CHECK - For editing/admin operations
export async function getPollByIdWithOwnership(id: string) {
  const supabase = await createClient();

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { poll: null, error: "Authentication required." };
  }

  // Validate ID format
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return { poll: null, error: "Invalid poll ID." };
  }

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id.trim())
    .eq("user_id", user.id)
    .single();

  if (error) {
    return { poll: null, error: "Poll not found or access denied." };
  }
  return { poll: data, error: null };
}

// SUBMIT VOTE
export async function submitVote(pollId: string, optionIndex: number) {
  const supabase = await createClient();

  // Validate inputs
  if (!pollId || typeof pollId !== "string" || pollId.trim().length === 0) {
    return { error: "Invalid poll ID." };
  }

  if (
    typeof optionIndex !== "number" ||
    optionIndex < 0 ||
    !Number.isInteger(optionIndex)
  ) {
    return { error: "Invalid option selected." };
  }

  // Verify poll exists and get its options to validate optionIndex
  const { poll, error: pollError } = await getPollById(pollId.trim());
  if (pollError || !poll) {
    return { error: "Poll not found." };
  }

  if (optionIndex >= poll.options.length) {
    return { error: "Invalid option selected." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if user already voted (prevent double voting)
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

  const { error } = await supabase.from("votes").insert([
    {
      poll_id: pollId.trim(),
      user_id: user?.id ?? null,
      option_index: optionIndex,
    },
  ]);

  if (error) {
    return { error: "Failed to submit vote." };
  }
  return { error: null };
}

// DELETE POLL
export async function deletePoll(id: string) {
  const supabase = await createClient();

  // Get user from session
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
    .eq("user_id", user.id);

  if (error) {
    return {
      error: "Failed to delete poll. You can only delete your own polls.",
    };
  }

  revalidatePath("/polls");
  return { error: null };
}

// UPDATE POLL
export async function updatePoll(pollId: string, formData: FormData) {
  const supabase = await createClient();

  // Validate pollId
  if (!pollId || typeof pollId !== "string" || pollId.trim().length === 0) {
    return { error: "Invalid poll ID." };
  }

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  // Validate input
  const validationErrors = validatePollInput(question, options);
  if (validationErrors.length > 0) {
    return { error: validationErrors.join(" ") };
  }

  // Sanitize input
  const sanitizedQuestion = sanitizeString(question);
  const sanitizedOptions = options.map((opt) => sanitizeString(opt));

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Authentication required to update polls." };
  }

  // Only allow updating polls owned by the user
  const { error } = await supabase
    .from("polls")
    .update({ question: sanitizedQuestion, options: sanitizedOptions })
    .eq("id", pollId.trim())
    .eq("user_id", user.id);

  if (error) {
    return {
      error: "Failed to update poll. You can only update your own polls.",
    };
  }

  revalidatePath("/polls");
  return { error: null };
}
