import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Fallback to local storage for completely free/offline use
export const getLocalMatches = () => {
  const data = localStorage.getItem('mj_cricket_matches');
  return data ? JSON.parse(data) : [];
};

export const saveLocalMatch = async (match: any) => {
  // 1. Write to local storage first
  const matches = getLocalMatches();
  const index = matches.findIndex((m: any) => m.id === match.id);
  if (index >= 0) {
    matches[index] = match;
  } else {
    matches.push(match);
  }
  localStorage.setItem('mj_cricket_matches', JSON.stringify(matches));

  // 2. Synchronize to Supabase if config exists
  if (supabase) {
    try {
      // Check if match already exists
      const { data: existing } = await supabase
        .from('matches')
        .select('id')
        .eq('id', match.id)
        .maybeSingle();

      const matchPayload = {
        id: match.id,
        team_a_name: match.config.teamAName,
        team_b_name: match.config.teamBName,
        overs_limit: match.config.oversLimit,
        toss_winner: match.config.tossWinner,
        toss_decision: match.config.tossDecision,
        current_innings: match.currentInnings,
        status: match.status,
        winner: match.winner || null,
        created_at: match.createdAt || new Date().toISOString(),
        recording_mode: match.config.recordingMode || 'basic',
        team_a_players: match.config.teamAPlayers,
        team_b_players: match.config.teamBPlayers,
        device_lock_owner: match.deviceLockOwner || null,
        transfer_code: match.transferCode || null
      };

      if (existing) {
        await supabase
          .from('matches')
          .update(matchPayload)
          .eq('id', match.id);
      } else {
        await supabase
          .from('matches')
          .insert([matchPayload]);
      }

      // Sync balls log (upload current ball states)
      if (match.ballsLog && match.ballsLog.length > 0) {
        const lastBall = match.ballsLog[match.ballsLog.length - 1];
        
        // Insert last ball scored to Supabase
        await supabase
          .from('balls_log')
          .insert([{
            id: lastBall.id,
            match_id: match.id,
            innings: lastBall.innings,
            over_num: lastBall.overNum,
            ball_num: lastBall.ballNum,
            bowler: lastBall.bowler,
            batsman_striker: lastBall.batsmanStriker,
            batsman_non_striker: lastBall.batsmanNonStriker,
            runs: lastBall.runs,
            extra_runs: lastBall.extraRuns,
            extra_type: lastBall.extraType,
            wicket: lastBall.wicket,
            wicket_type: lastBall.wicketType
          }]);
      }
    } catch (err) {
      console.error("Failed to sync to Supabase: ", err);
    }
  }
};

export const getLocalTeams = (): Array<{ name: string; players: string[] }> => {
  const data = localStorage.getItem('mj_cricket_teams');
  return data ? JSON.parse(data) : [];
};

export const saveLocalTeams = async (teams: Array<{ name: string; players: string[] }>) => {
  localStorage.setItem('mj_cricket_teams', JSON.stringify(teams));
  if (supabase) {
    try {
      // Upsert teams to Supabase schema if table exists
      for (const t of teams) {
        const { data: existing } = await supabase
          .from('teams')
          .select('name')
          .eq('name', t.name)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('teams')
            .update({ players: t.players })
            .eq('name', t.name);
        } else {
          await supabase
            .from('teams')
            .insert([{ name: t.name, players: t.players }]);
        }
      }
    } catch (e) {
      console.error("Failed to sync teams to Supabase:", e);
    }
  }
};

