# name: cricket-scoring-manager
# description: Skill for orchestrating the build, styling, database integration, and features of the MJ Cricket Scoring App.

# MJ Cricket Scoring App Manager Skill

This skill contains specific guidelines and instructions to build, structure, and verify the cricket scoring application as defined in the product specification.

## Application Architecture

The application should be built using **Vite + React (TypeScript)** or a **Single Page Application** matching the following layout:
*   `src/index.css` - Global theme rules (Dark mode first, Sleek palette).
*   `src/App.tsx` - Router/Application Shell containing routes for Scorer Dashboard, Spectator Dashboard, and Match History.
*   `src/db/supabase.ts` - Supabase client setup with subscription handlers for real-time scorecard updates.
*   `src/types/cricket.ts` - Fully typed data models for Ball, Innings, Over, BatsmanStats, BowlerStats, and Match.

## Database Schema (Supabase)

Create/mock or setup the following tables:
1.  **Matches (`matches`)**:
    *   `id` (uuid, primary key)
    *   `team_a_name` (text), `team_b_name` (text)
    *   `overs_limit` (int)
    *   `toss_winner` (text), `toss_decision` (text)
    *   `current_innings` (int)
    *   `status` ('live', 'completed')
2.  **Balls Log (`balls_log`)**:
    *   `id` (uuid, primary key)
    *   `match_id` (uuid, foreign key)
    *   `innings` (int)
    *   `over_num` (int)
    *   `ball_num` (int)
    *   `bowler` (text)
    *   `batsman_striker` (text)
    *   `batsman_non_striker` (text)
    *   `runs` (int)
    *   `extra_runs` (int)
    *   `extra_type` ('wide', 'noball', 'bye', 'legbye', null)
    *   `wicket` (boolean)
    *   `wicket_type` (text, null)
    *   `timestamp` (timestamptz)

## UI Theme Guidelines
*   **Background**: Deep dark blues/slates (`#0f172a`, `#1e293b`).
*   **Accents**: Vibrant emerald/mint green for live status and primary buttons (`#10b981`).
*   **Card Styling**: Frosted glassmorphism (`backdrop-filter: blur(...)` combined with translucent borders and backgrounds).
*   **Scoring Controls**: Massive tap targets with active state animations.
