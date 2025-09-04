"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Validates the input for creating or updating a poll.
 *
 * @param {string} question - The poll question.
 * @param {string[]} options - An array of poll options.
 * @returns {string[]} An array of error messages. Returns an empty array if validation passes.
 */
function validatePollInput(question: string, options: string[]) {
  const errors: string[] = [];

  // Validate the poll question.
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

  // Validate the poll options.
  if (!Array.isArray(options) || options.length < 2) {
    errors.push("At least two options are required.");
  } else if (options.length > 10) {
    errors.push("Maximum of 10 options allowed.");
  } else {
    // Ensure there are at least two non-empty options.
    const validOptions = options.filter(
      (opt) => typeof opt === "string" && opt.trim().length > 0
    );
    if (validOptions.length < 2) {
      errors.push("At least two non-empty options are required.");
    }

    // Check for the length of each option.
    const tooLongOptions = validOptions.filter(
      (opt) => opt.trim().length > 200
    );
    if (tooLongOptions.length > 0) {
      errors.push("Each option must be less than 200 characters.");
    }
  }

  return errors;
}

/**
 * Sanitizes a string by trimming whitespace and removing HTML tags.
 * This is a basic security measure to prevent XSS attacks.
 *
 * @param {string} str - The string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeString(str: string): string {
  // A simple sanitizer. For more robust needs, a library like DOMPurify would be better.
  return str.trim().replace(/[<>]/g, "");
}

/**
 * Creates a new poll in the database.
 * This is a Next.js Server Action.
 *
 * @param {FormData} formData - The form data from the poll creation form.
 * @returns {Promise<{ error: string | null }>} An object with an error message or null on success.
 */
export async function createPoll(formData: FormData) {
  const supabase = await createClient();

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  // Server-side validation of the poll data.
  const validationErrors = validatePollInput(question, options);
  if (validationErrors.length > 0) {
    return { error: validationErrors.join(" ") };
  }

  // Sanitize inputs to prevent XSS.
  const sanitizedQuestion = sanitizeString(question);
  const sanitizedOptions = options.map((opt) => sanitizeString(opt));

  // Get the current user from the session to associate the poll with them.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    // Security: Ensure only authenticated users can create polls.
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

  // Revalidate the '/polls' path to ensure the new poll appears immediately
  // on the user's dashboard without requiring a manual refresh.
  revalidatePath("/polls");
  return { error: null };
}

/**
 * Fetches all polls created by the currently authenticated user.
 *
 * @returns {Promise<{ polls: any[], error: string | null }>} An object containing the user's polls and an error message if any.
 */
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

/**
 * Fetches a single poll by its ID. This function is for public access.
 * It returns a generic error for not found polls to avoid leaking information.
 *
 * @param {string} id - The UUID of the poll to fetch.
 * @returns {Promise<{ poll: any | null, error: string | null }>} The poll data or an error.
 */
export async function getPollById(id: string) {
  const supabase = await createClient();

  // Basic validation of the poll ID format.
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return { poll: null, error: "Invalid poll ID." };
  }

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id.trim())
    .single();

  if (error) {
    // Return a generic error to prevent attackers from guessing valid poll IDs.
    return { poll: null, error: "Poll not found." };
  }
  return { poll: data, error: null };
}

/**
 * Fetches a poll by its ID and verifies that the current user is the owner.
 * This is a protected action used for editing or deleting polls.
 *
 * @param {string} id - The UUID of the poll to fetch.
 * @returns {Promise<{ poll: any | null, error: string | null }>} The poll data if ownership is verified, otherwise an error.
 */
export async function getPollByIdWithOwnership(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { poll: null, error: "Authentication required." };
  }

  // Validate ID format to prevent invalid queries.
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return { poll: null, error: "Invalid poll ID." };
  }

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id.trim())
    // Security check: Crucially, this query filters by both poll ID and the authenticated user's ID.
    .eq("user_id", user.id)
    .single();

  if (error) {
    return { poll: null, error: "Poll not found or access denied." };
  }
  return { poll: data, error: null };
}

/**
 * Submits a vote for a specific poll option.
 * This is a Next.js Server Action.
 *
 * @param {string} pollId - The ID of the poll being voted on.
 * @param {number} optionIndex - The index of the selected option.
 * @returns {Promise<{ error: string | null }>} An object with an error message or null on success.
 */
export async function submitVote(pollId: string, optionIndex: number) {
  const supabase = await createClient();

  // Validate the inputs to ensure they are in the correct format.
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

  // First, verify the poll exists to provide a clear error message.
  const { poll, error: pollError } = await getPollById(pollId.trim());
  if (pollError || !poll) {
    return { error: "Poll not found." };
  }

  // Security check: Ensure the provided option index is within the valid range for the poll.
  if (optionIndex >= poll.options.length) {
    return { error: "Invalid option selected." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Security: Prevent double voting by checking if the user has already voted.
  // This check is only applied to authenticated users. Anonymous voting is allowed but can be repeated.
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
      user_id: user?.id ?? null, // Associate vote with user if logged in, otherwise anonymous.
      option_index: optionIndex,
    },
  ]);

  if (error) {
    return { error: "Failed to submit vote." };
  }
  return { error: null };
}

/**
 * Deletes a poll owned by the current user.
 * This is a Next.js Server Action.
 *
 * @param {string} id - The ID of the poll to delete.
 * @returns {Promise<{ error: string | null }>} An object with an error message or null on success.
 */
export async function deletePoll(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Authentication required to delete polls." };
  }

  // Security: The `delete` operation is scoped to the `user_id` to ensure
  // users can only delete their own polls. This is a critical row-level security check.
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

/**
 * Updates an existing poll owned by the current user.
 * This is a Next.js Server Action.
 *
 * @param {string} pollId - The ID of the poll to update.
 * @param {FormData} formData - The new poll data from the edit form.
 * @returns {Promise<{ error: string | null }>} An object with an error message or null on success.
 */
export async function updatePoll(pollId: string, formData: FormData) {
  const supabase = await createClient();

  if (!pollId || typeof pollId !== "string" || pollId.trim().length === 0) {
    return { error: "Invalid poll ID." };
  }

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  const validationErrors = validatePollInput(question, options);
  if (validationErrors.length > 0) {
    return { error: validationErrors.join(" ") };
  }

  const sanitizedQuestion = sanitizeString(question);
  const sanitizedOptions = options.map((opt) => sanitizeString(opt));

  // Verify user authentication.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Authentication required to update polls." };
  }

  // Security: The `update` operation is scoped with `.eq("user_id", user.id)`
  // to ensure that users can only modify polls they own.
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

/**
 * Gets vote counts for each option in a poll.
 * This is used for displaying poll results.
 *
 * @param {string} pollId - The ID of the poll to get vote counts for.
 * @returns {Promise<{ voteCounts: number[], error: string | null }>} Vote counts array or error.
 */
export async function getVoteCounts(pollId: string) {
  const supabase = await createClient();

  // Validate pollId
  if (!pollId || typeof pollId !== "string" || pollId.trim().length === 0) {
    return { voteCounts: [], error: "Invalid poll ID." };
  }

  try {
    const { data: votes, error } = await supabase
      .from("votes")
      .select("option_index")
      .eq("poll_id", pollId.trim());

    if (error) {
      return { voteCounts: [], error: "Failed to load vote data." };
    }

    // Get the poll to know how many options it has
    const { poll } = await getPollById(pollId.trim());
    if (!poll) {
      return { voteCounts: [], error: "Poll not found." };
    }

    // Count votes for each option
    const voteCounts = new Array(poll.options.length).fill(0);
    votes?.forEach((vote) => {
      if (vote.option_index >= 0 && vote.option_index < poll.options.length) {
        voteCounts[vote.option_index]++;
      }
    });

    return { voteCounts, error: null };
  } catch {
    return { voteCounts: [], error: "Failed to load vote data." };
  }
}
