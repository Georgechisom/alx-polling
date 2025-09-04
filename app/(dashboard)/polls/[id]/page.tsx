"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPollById,
  getVoteCounts,
  deletePoll,
  submitVote,
} from "@/app/lib/actions/poll-actions";
import { getCurrentUser } from "@/app/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Poll {
  id: string;
  question: string;
  options: string[];
  user_id: string;
  created_at: string;
}

export default function PollDetailPage({ params }: PageProps) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voteCounts, setVoteCounts] = useState<number[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const resolvedParams = await params;
        const pollId = resolvedParams.id;

        // Validate poll ID
        if (!pollId || typeof pollId !== "string") {
          notFound();
          return;
        }

        // Fetch poll data
        const { poll: pollData, error: pollError } = await getPollById(pollId);

        if (pollError || !pollData) {
          setError("Poll not found");
          return;
        }

        setPoll(pollData);

        // Get current user to check ownership
        const currentUser = await getCurrentUser();
        setIsOwner(currentUser?.id === pollData.user_id);

        // Get vote counts
        const { voteCounts: voteData, error: voteError } = await getVoteCounts(
          pollId
        );
        const actualVoteCounts = voteError
          ? pollData.options.map(() => 0)
          : voteData;
        setVoteCounts(actualVoteCounts);
        setTotalVotes(
          actualVoteCounts.reduce(
            (sum: number, count: number) => sum + count,
            0
          )
        );
      } catch (err) {
        setError("Failed to load poll data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-center">Loading poll...</div>
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-center text-red-500">
          {error || "Poll not found"}
        </div>
        <div className="text-center mt-4">
          <Link href="/polls" className="text-blue-600 hover:underline">
            ← Back to Polls
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/polls" className="text-blue-600 hover:underline">
          ← Back to Polls
        </Link>
        {isOwner && (
          <div className="flex space-x-2">
            <Button variant="outline" asChild>
              <Link href={`/polls/${poll.id}/edit`}>Edit Poll</Link>
            </Button>
            <DeletePollButton pollId={poll.id} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{poll.question}</CardTitle>
          <CardDescription>
            Select an option to vote on this poll
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VotingInterface
            pollId={poll.id}
            options={poll.options}
            voteCounts={voteCounts}
            totalVotes={totalVotes}
          />
        </CardContent>
        <CardFooter className="text-sm text-slate-500 flex justify-between">
          <span>Poll ID: {poll.id}</span>
          <span>
            Created on {new Date(poll.created_at).toLocaleDateString()}
          </span>
        </CardFooter>
      </Card>

      <SharePollSection pollId={poll.id} pollTitle={poll.question} />
    </div>
  );
}

// Inline voting component
function VotingInterface({
  pollId,
  options,
  voteCounts,
  totalVotes,
}: {
  pollId: string;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
}) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async () => {
    if (selectedOption === null) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitVote(pollId, selectedOption);

      if (result.error) {
        setError(result.error);
      } else {
        setHasVoted(true);
        // Refresh the page to show updated results
        window.location.reload();
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  return (
    <div className="space-y-4">
      {!hasVoted ? (
        // Voting interface
        <div className="space-y-3">
          <h3 className="font-medium">Choose an option:</h3>
          {options.map((option, index) => (
            <div
              key={index}
              className={`p-3 border rounded-md cursor-pointer transition-colors ${
                selectedOption === index
                  ? "border-blue-500 bg-blue-50"
                  : "hover:bg-slate-50"
              }`}
              onClick={() => setSelectedOption(index)}
            >
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="poll-option"
                  value={index}
                  checked={selectedOption === index}
                  onChange={() => setSelectedOption(index)}
                  className="sr-only"
                />
                <span>{option}</span>
              </div>
            </div>
          ))}

          {error && (
            <div className="text-red-500 bg-red-50 border border-red-200 rounded p-3 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleVote}
            disabled={selectedOption === null || isSubmitting}
            className="w-full mt-4"
          >
            {isSubmitting ? "Submitting..." : "Submit Vote"}
          </Button>
        </div>
      ) : (
        // Results interface
        <div className="space-y-4">
          <h3 className="font-medium">Poll Results:</h3>
          {options.map((option, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{option}</span>
                <span>
                  {getPercentage(voteCounts[index])}% ({voteCounts[index]}{" "}
                  votes)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${getPercentage(voteCounts[index])}%` }}
                ></div>
              </div>
            </div>
          ))}
          <div className="text-sm text-slate-500 pt-2">
            Total votes: {totalVotes}
          </div>
        </div>
      )}
    </div>
  );
}

// Separate component for delete functionality
function DeletePollButton({ pollId }: { pollId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this poll? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deletePoll(pollId);
      if (result.error) {
        alert("Failed to delete poll: " + result.error);
      } else {
        window.location.href = "/polls";
      }
    } catch (error) {
      alert("An error occurred while deleting the poll.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="text-red-500 hover:text-red-700"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "Deleting..." : "Delete"}
    </Button>
  );
}

// Simple share section component
function SharePollSection({
  pollId,
  pollTitle,
}: {
  pollId: string;
  pollTitle: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/polls/${pollId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert("Failed to copy link");
    }
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Check out this poll: ${pollTitle}`);
    const url = encodeURIComponent(`${window.location.origin}/polls/${pollId}`);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      "_blank"
    );
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-semibold mb-4">Share this poll</h2>
      <div className="flex space-x-2">
        <Button variant="outline" className="flex-1" onClick={handleCopyLink}>
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleShareTwitter}
        >
          Share on Twitter
        </Button>
      </div>
    </div>
  );
}
