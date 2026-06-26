# Mahima Academy - Education Platform

## Project Overview
A full-featured educational platform for grades 1-5 built with React, Vite, TypeScript, and Supabase. Provides course management, video lessons, student enrollment, messaging, attendance tracking, and more.

## Architecture
- **Frontend**: React 18 + TypeScript + Vite (runs on port 5000)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend/Database**: Supabase (PostgreSQL with Row Level Security)
- **Auth**: Supabase Auth
- **State**: TanStack Query for server state, React Context for app state

## Key Features
- Public landing page with course catalog
- Student signup/login with role-based access (admin, teacher, student)
- Course player with video lessons, chapters, and lecture notes
- Admin CMS for managing content, courses, users
- Messaging system between users
- Attendance and student management
- Books and resource library
- Notice board and timetable
- Payment request flow for course enrollment

## Project Structure
```
src/
  components/     # Reusable UI components
  contexts/       # React context providers (Auth, Theme, Batch)
  hooks/          # Custom React hooks
  integrations/   # Supabase client setup
  lib/            # Utility functions
  pages/          # Route-level page components
  types/          # TypeScript type definitions
supabase/
  migrations/     # Database migration SQL files
  functions/      # Edge functions (setup-admin)
```

## Supabase Configuration
- Supabase URL and anon key are stored as Replit environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- The client reads these via `import.meta.env` — no credentials are hardcoded in source code
- Database schema is managed via migrations in `supabase/migrations/`
- Row Level Security is enabled on all tables
- Role-based access: admin, teacher, student via `user_roles` table

## Running the App
- Development: `npm run dev` (starts Vite on port 5000)
- Build: `npm run build`

## Environment / Security Notes
- The Supabase anon key is safe to expose on the client (it is the publishable key)
- Sensitive operations are protected by Supabase RLS policies server-side
- Admin credentials are managed via Supabase edge function `setup-admin` using server secrets
- No secrets are stored in the frontend source code; all credentials loaded from environment variables
