'use client';

import { useState } from 'react';
import { updatePoll } from '@/app/lib/actions/poll-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Poll {
  id: string;
  question: string;
  options: string[];
  user_id: string;
}

interface EditPollFormProps {
  poll: Poll;
}

export default function EditPollForm({ poll }: EditPollFormProps) {
  const [question, setQuestion] = useState(poll.question || '');
  const [options, setOptions] = useState<string[]>(poll.options || ['', '']);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Input validation
  const validateQuestion = (q: string): string | null => {
    const trimmed = q.trim();
    if (!trimmed) return 'Question is required';
    if (trimmed.length > 500) return 'Question must be less than 500 characters';
    return null;
  };

  const validateOptions = (opts: string[]): string | null => {
    const validOptions = opts.filter(opt => opt.trim().length > 0);
    if (validOptions.length < 2) return 'At least two options are required';
    if (validOptions.length > 10) return 'Maximum of 10 options allowed';
    
    for (const opt of validOptions) {
      if (opt.trim().length > 200) {
        return 'Each option must be less than 200 characters';
      }
    }
    return null;
  };

  const sanitizeInput = (input: string): string => {
    return input.trim().replace(/[<>]/g, '');
  };

  const handleQuestionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 500) {
      setQuestion(value);
    }
  };

  const handleOptionChange = (idx: number, value: string) => {
    if (value.length <= 200) {
      setOptions((opts) => opts.map((opt, i) => (i === idx ? value : opt)));
    }
  };

  const addOption = () => {
    if (options.length < 10) {
      setOptions((opts) => [...opts, '']);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions((opts) => opts.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = async (formData: FormData) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    // Client-side validation
    const questionError = validateQuestion(question);
    if (questionError) {
      setError(questionError);
      setIsSubmitting(false);
      return;
    }

    const optionsError = validateOptions(options);
    if (optionsError) {
      setError(optionsError);
      setIsSubmitting(false);
      return;
    }

    // Sanitize and prepare data
    const sanitizedQuestion = sanitizeInput(question);
    const sanitizedOptions = options
      .filter(opt => opt.trim().length > 0)
      .map(opt => sanitizeInput(opt));

    formData.set('question', sanitizedQuestion);
    formData.delete('options');
    sanitizedOptions.forEach((opt) => formData.append('options', opt));

    try {
      const res = await updatePoll(poll.id, formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/polls';
        }, 1200);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <Label htmlFor="question">Poll Question</Label>
        <Input
          name="question"
          id="question"
          value={question}
          onChange={handleQuestionChange}
          required
          maxLength={500}
          placeholder="Enter your poll question..."
        />
        <div className="text-xs text-gray-500 mt-1">
          {question.length}/500 characters
        </div>
      </div>
      
      <div>
        <Label>Options</Label>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <Input
              name="options"
              value={opt}
              onChange={(e) => handleOptionChange(idx, e.target.value)}
              required={idx < 2}
              maxLength={200}
              placeholder={`Option ${idx + 1}`}
            />
            <div className="text-xs text-gray-500 min-w-[3rem]">
              {opt.length}/200
            </div>
            {options.length > 2 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => removeOption(idx)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <Button type="button" onClick={addOption} variant="secondary" size="sm">
            Add Option
          </Button>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {options.filter(opt => opt.trim()).length}/10 options
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}
      
      {success && (
        <div className="text-green-600 bg-green-50 border border-green-200 rounded p-3">
          Poll updated successfully! Redirecting...
        </div>
      )}
      
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? 'Updating...' : 'Update Poll'}
      </Button>
    </form>
  );
}