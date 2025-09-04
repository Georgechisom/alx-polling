import {
  getPollById,
  getPollByIdWithOwnership,
} from "@/app/lib/actions/poll-actions";
import { notFound } from "next/navigation";
// Import the client component
import EditPollForm from "./EditPollForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPollPage({ params }: PageProps) {
  // Await the params Promise as required by Next.js App Router
  const resolvedParams = await params;
  const pollId = resolvedParams.id;

  // Use the secure ownership-checked function for editing
  const { poll, error } = await getPollByIdWithOwnership(pollId);

  if (error || !poll) {
    notFound();
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Poll</h1>
      <EditPollForm poll={poll} />
    </div>
  );
}
