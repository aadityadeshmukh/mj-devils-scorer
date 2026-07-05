import { MatchState, BallRecord, InningsState, MatchConfig } from '../types/cricket';

// Calculate the stats of an innings from a list of balls
export function computeInningsState(
  balls: BallRecord[],
  innings: 1 | 2,
  config: MatchConfig
): InningsState {
  const state: InningsState = {
    runs: 0,
    wickets: 0,
    ballsBowled: 0,
    currentOverBalls: [],
    batsmenStats: {},
    bowlerStats: {},
  };

  // Initialize batsmen and bowlers list based on config if needed
  const battingTeamPlayers = innings === 1 
    ? (config.tossDecision === 'Batting' ? (config.tossWinner === 'Team A' ? config.teamAPlayers : config.teamBPlayers) : (config.tossWinner === 'Team A' ? config.teamBPlayers : config.teamAPlayers))
    : (config.tossDecision === 'Bowling' ? (config.tossWinner === 'Team A' ? config.teamAPlayers : config.teamBPlayers) : (config.tossWinner === 'Team A' ? config.teamBPlayers : config.teamAPlayers));

  const bowlingTeamPlayers = innings === 1
    ? (config.tossDecision === 'Bowling' ? (config.tossWinner === 'Team A' ? config.teamAPlayers : config.teamBPlayers) : (config.tossWinner === 'Team A' ? config.teamBPlayers : config.teamAPlayers))
    : (config.tossDecision === 'Batting' ? (config.tossWinner === 'Team A' ? config.teamAPlayers : config.teamBPlayers) : (config.tossWinner === 'Team A' ? config.teamBPlayers : config.teamAPlayers));

  battingTeamPlayers.forEach(p => {
    state.batsmenStats[p] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
  });

  bowlingTeamPlayers.forEach(p => {
    state.bowlerStats[p] = { runs: 0, overs: 0, wickets: 0, maidens: 0, balls: 0 };
  });

  const inningsBalls = balls.filter(b => b.innings === innings);

  inningsBalls.forEach(ball => {
    const isLegalBall = ball.extraType !== 'wide' && ball.extraType !== 'noball';

    // 1. Runs & Wickets
    const ballTotalRuns = ball.runs + ball.extraRuns;
    state.runs += ballTotalRuns;

    if (ball.wicket) {
      state.wickets += 1;
    }

    if (isLegalBall) {
      state.ballsBowled += 1;
    }

    // 2. Batsman stats (only bats off the bat for batsman, unless runout or bye/legbye)
    if (!state.batsmenStats[ball.batsmanStriker]) {
      state.batsmenStats[ball.batsmanStriker] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    }
    const bStat = state.batsmenStats[ball.batsmanStriker];
    bStat.runs += ball.runs;
    if (ball.extraType !== 'wide') {
      bStat.balls += 1;
    }
    if (ball.runs === 4) bStat.fours += 1;
    if (ball.runs === 6) bStat.sixes += 1;

    // 3. Bowler stats
    if (!state.bowlerStats[ball.bowler]) {
      state.bowlerStats[ball.bowler] = { runs: 0, overs: 0, wickets: 0, maidens: 0, balls: 0 };
    }
    const bowStat = state.bowlerStats[ball.bowler];
    
    // Wides and No Balls count as runs against bowler
    let bowlerConceded = ball.runs;
    if (ball.extraType === 'wide' || ball.extraType === 'noball') {
      bowlerConceded += ball.extraRuns;
    }
    bowStat.runs += bowlerConceded;

    if (isLegalBall) {
      bowStat.balls += 1;
    }

    if (ball.wicket && ball.wicketType !== 'runout') {
      bowStat.wickets += 1;
    }
  });

  // Calculate overs for each bowler
  Object.keys(state.bowlerStats).forEach(bowler => {
    const b = state.bowlerStats[bowler];
    const fullOvers = Math.floor(b.balls / 6);
    const remBalls = b.balls % 6;
    b.overs = parseFloat(`${fullOvers}.${remBalls}`);
  });

  // Find balls that belong to the current over number
  const totalOversSoFar = Math.floor(state.ballsBowled / 6);
  // We can select the last few balls matching the current over num
  const activeOverBalls = inningsBalls.filter(b => b.overNum === totalOversSoFar);
  state.currentOverBalls = activeOverBalls;

  return state;
}

export function createInitialMatch(config: MatchConfig): MatchState {
  const teamAFirst = config.tossWinner === 'Team A' ? (config.tossDecision === 'Batting') : (config.tossDecision === 'Bowling');
  const battingTeam = teamAFirst ? config.teamAPlayers : config.teamBPlayers;
  const bowlingTeam = teamAFirst ? config.teamBPlayers : config.teamAPlayers;

  return {
    id: Math.random().toString(36).substr(2, 9),
    config,
    status: 'live',
    currentInnings: 1,
    striker: battingTeam[0] || 'Batsman 1',
    nonStriker: battingTeam[1] || 'Batsman 2',
    currentBowler: bowlingTeam[0] || 'Bowler 1',
    firstInnings: {
      runs: 0,
      wickets: 0,
      ballsBowled: 0,
      currentOverBalls: [],
      batsmenStats: {},
      bowlerStats: {},
    },
    secondInnings: {
      runs: 0,
      wickets: 0,
      ballsBowled: 0,
      currentOverBalls: [],
      batsmenStats: {},
      bowlerStats: {},
    },
    ballsLog: [],
    redoStack: [],
    createdAt: new Date().toISOString(),
  };
}
