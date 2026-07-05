export interface Player {
  name: string;
}

export interface MatchConfig {
  teamAName: string;
  teamBName: string;
  oversLimit: number;
  playersPerTeam: number;
  tossWinner: 'Team A' | 'Team B';
  tossDecision: 'Batting' | 'Bowling';
  teamAPlayers: string[];
  teamBPlayers: string[];
}

export interface BallRecord {
  id: string;
  innings: 1 | 2;
  overNum: number;
  ballNum: number; // actual legal ball count in the over
  bowler: string;
  batsmanStriker: string;
  batsmanNonStriker: string;
  runs: number; // runs off the bat
  extraRuns: number; // extras from wide/noball etc.
  extraType: 'wide' | 'noball' | 'bye' | 'legbye' | null;
  wicket: boolean;
  wicketType: 'bowled' | 'caught' | 'runout' | 'lbw' | 'stumped' | 'other' | null;
  wicketPlayer?: string; // player dismissed if wicket
}

export interface InningsState {
  runs: number;
  wickets: number;
  ballsBowled: number; // total legal balls
  currentOverBalls: BallRecord[];
  batsmenStats: Record<string, { runs: number; balls: number; fours: number; sixes: number }>;
  bowlerStats: Record<string, { runs: number; overs: number; wickets: number; maidens: number; balls: number }>;
}

export interface MatchState {
  id: string;
  config: MatchConfig;
  status: 'setup' | 'live' | 'completed';
  currentInnings: 1 | 2;
  striker: string;
  nonStriker: string;
  currentBowler: string;
  firstInnings: InningsState;
  secondInnings: InningsState;
  ballsLog: BallRecord[];
  redoStack: BallRecord[][]; // stores history of ball logs for redo/undo
  winner?: string; // winner team name
  createdAt?: string; // date of match ISO string
}
