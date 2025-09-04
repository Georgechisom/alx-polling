"use client";

import { useState } from "react";
import { submitVote } from "@/app/lib/actions/poll-actions";
import { Button } from "@/components/ui/button";

interface VotingFormProps {
  pollId: string;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
}

export default function VotingForm({
  pollId,
  options,
  voteCounts,
  totalVotes,
}: VotingFormProps) {
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
