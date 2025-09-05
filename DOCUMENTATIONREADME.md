# Polling App

A full-stack polling application that allows users to create, share, and vote on polls. Built with Next.js and Supabase, it features user authentication, real-time voting, and QR code sharing.

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
