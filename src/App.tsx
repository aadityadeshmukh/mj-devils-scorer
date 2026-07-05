import { useState, useEffect } from 'react';
import { 
  Undo, Smartphone
} from 'lucide-react';
import { MatchConfig, MatchState, BallRecord } from './types/cricket';
import { createInitialMatch, computeInningsState } from './utils/scoringEngine';
import { getLocalMatches, saveLocalMatch, supabase } from './db/supabase';

export default function App() {
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  
  // App views: 'lobby' | 'setup' | 'scorer' | 'viewer' | 'history'
  const [view, setView] = useState<'lobby' | 'setup' | 'scorer' | 'viewer' | 'history'>('lobby');

  // Roster inputs & Match setup
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');
  const [oversLimit, setOversLimit] = useState(8);
  const [tossWinner, setTossWinner] = useState<'Team A' | 'Team B'>('Team A');
  const [tossDecision, setTossDecision] = useState<'Batting' | 'Bowling'>('Batting');
  const [teamAPlayers] = useState<string[]>(['Player A1', 'Player A2', 'Player A3', 'Player A4', 'Player A5', 'Player A6']);
  const [teamBPlayers] = useState<string[]>(['Player B1', 'Player B2', 'Player B3', 'Player B4', 'Player B5', 'Player B6']);

  // Scorer selections
  const [selectedStriker, setSelectedStriker] = useState('');
  const [selectedNonStriker, setSelectedNonStriker] = useState('');
  const [selectedBowler, setSelectedBowler] = useState('');

  // Immersive Neural Custom Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'wide' | 'noball' | 'wicket' | 'alert'>('alert');
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<((data?: any) => void) | null>(null);
  
  // Custom Modal input values
  const [modalInputVal, setModalInputVal] = useState('0');
  const [modalBoolVal, setModalBoolVal] = useState(false);

  const openCustomModal = (
    type: 'wide' | 'noball' | 'wicket' | 'alert',
    title: string,
    message: string,
    onConfirm: (data?: any) => void
  ) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalOnConfirm(() => onConfirm);
    setModalInputVal(type === 'wide' ? '1' : '0');
    setModalBoolVal(false);
    setModalOpen(true);
  };

  // Load matches from Supabase (or LocalStorage fallback) and start real-time sync listeners
  useEffect(() => {
    const fetchMatches = async () => {
      if (supabase) {
        try {
          const { data: dbMatches, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (dbMatches) {
            // For each match, fetch its corresponding ball logs
            const matchesWithLogs = await Promise.all(
              dbMatches.map(async (m: any) => {
                let ballLogs = null;
                if (supabase) {
                  const { data } = await supabase
                    .from('balls_log')
                    .select('*')
                    .eq('match_id', m.id)
                    .order('timestamp', { ascending: true });
                  ballLogs = data;
                }

                // Construct MatchConfig
                const config: MatchConfig = {
                  teamAName: m.team_a_name,
                  teamBName: m.team_b_name,
                  oversLimit: m.overs_limit,
                  playersPerTeam: 11, // Default fallback
                  tossWinner: m.toss_winner,
                  tossDecision: m.toss_decision,
                  teamAPlayers: [],
                  teamBPlayers: [],
                };

                // Map database fields back to React frontend state structures
                const balls = (ballLogs || []).map((b: any) => ({
                  id: b.id,
                  innings: b.innings,
                  overNum: b.over_num,
                  ballNum: b.ball_num,
                  bowler: b.bowler,
                  batsmanStriker: b.batsman_striker,
                  batsmanNonStriker: b.batsman_non_striker,
                  runs: b.runs,
                  extraRuns: b.extra_runs,
                  extraType: b.extra_type,
                  wicket: b.wicket,
                  wicketType: b.wicket_type,
                }));

                return {
                  id: m.id,
                  config,
                  status: m.status,
                  currentInnings: m.current_innings,
                  striker: balls[balls.length - 1]?.batsmanStriker || '',
                  nonStriker: balls[balls.length - 1]?.batsmanNonStriker || '',
                  currentBowler: balls[balls.length - 1]?.bowler || '',
                  firstInnings: computeInningsState(balls, 1, config),
                  secondInnings: computeInningsState(balls, 2, config),
                  ballsLog: balls,
                  redoStack: [],
                  winner: m.winner,
                  createdAt: m.created_at,
                };
              })
            );
            setMatches(matchesWithLogs);
          }
        } catch (err) {
          console.error("Supabase fetch failed, falling back to LocalStorage:", err);
          setMatches(getLocalMatches());
        }
      } else {
        setMatches(getLocalMatches());
      }
    };

    fetchMatches();

    // Subscribe to real-time database changes if Supabase is active
    if (supabase) {
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'matches' },
          () => {
            fetchMatches();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'balls_log' },
          () => {
            fetchMatches();
          }
        )
        .subscribe();

      return () => {
        if (supabase) supabase.removeChannel(channel);
      };
    }
  }, []);

  const activeMatch = matches.find(m => m.id === activeMatchId);

  const startNewMatchSetup = () => {
    setView('setup');
  };

  const handleCreateMatch = () => {
    const config: MatchConfig = {
      teamAName,
      teamBName,
      oversLimit,
      playersPerTeam: Math.max(teamAPlayers.length, teamBPlayers.length),
      tossWinner,
      tossDecision,
      teamAPlayers,
      teamBPlayers,
    };
    const newMatch = createInitialMatch(config);
    saveLocalMatch(newMatch);
    setMatches(getLocalMatches());
    setActiveMatchId(newMatch.id);
    
    // Choose starting striker, non-striker, bowler
    const teamAFirst = tossWinner === 'Team A' ? (tossDecision === 'Batting') : (tossDecision === 'Bowling');
    const battingList = teamAFirst ? teamAPlayers : teamBPlayers;
    const bowlingList = teamAFirst ? teamBPlayers : teamAPlayers;
    setSelectedStriker(battingList[0] || 'Striker');
    setSelectedNonStriker(battingList[1] || 'Non Striker');
    setSelectedBowler(bowlingList[0] || 'Bowler');

    setView('scorer');
  };

  const handleSelectActiveMatch = (matchId: string, targetView: 'scorer' | 'viewer') => {
    setActiveMatchId(matchId);
    const m = matches.find(x => x.id === matchId);
    if (m) {
      const teamAFirst = m.config.tossWinner === 'Team A' ? (m.config.tossDecision === 'Batting') : (m.config.tossDecision === 'Bowling');
      const currentBattingTeam = m.currentInnings === 1 
        ? (teamAFirst ? m.config.teamAPlayers : m.config.teamBPlayers)
        : (teamAFirst ? m.config.teamBPlayers : m.config.teamAPlayers);
      const currentBowlingTeam = m.currentInnings === 1
        ? (teamAFirst ? m.config.teamBPlayers : m.config.teamAPlayers)
        : (teamAFirst ? m.config.teamAPlayers : m.config.teamBPlayers);

      setSelectedStriker(m.striker || currentBattingTeam[0] || '');
      setSelectedNonStriker(m.nonStriker || currentBattingTeam[1] || '');
      setSelectedBowler(m.currentBowler || currentBowlingTeam[0] || '');
    }
    setView(targetView);
  };

  const handleBallScored = (runs: number, extraRuns: number, extraType: 'wide' | 'noball' | 'bye' | 'legbye' | null, wicket: boolean, wicketType?: any) => {
    if (!activeMatch) return;

    const innings = activeMatch.currentInnings;
    const currentInningsState = innings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings;
    const totalOversSoFar = Math.floor(currentInningsState.ballsBowled / 6);
    const currentBallIndexInOver = (currentInningsState.ballsBowled % 6) + 1;

    const ball: BallRecord = {
      id: Math.random().toString(36).substr(2, 9),
      innings,
      overNum: totalOversSoFar,
      ballNum: currentBallIndexInOver,
      bowler: selectedBowler,
      batsmanStriker: selectedStriker,
      batsmanNonStriker: selectedNonStriker,
      runs,
      extraRuns,
      extraType,
      wicket,
      wicketType: wicket ? (wicketType || 'bowled') : null,
    };

    // Save previous state to undo stack
    const updatedBallsLog = [...activeMatch.ballsLog, ball];
    
    // Switch batsman if run is odd
    let newStriker = selectedStriker;
    let newNonStriker = selectedNonStriker;
    const isLegalBall = extraType !== 'wide' && extraType !== 'noball';

    if (runs % 2 !== 0) {
      newStriker = selectedNonStriker;
      newNonStriker = selectedStriker;
    }

    // Over complete switch striker & non-striker
    const willBeOversBowled = isLegalBall ? currentInningsState.ballsBowled + 1 : currentInningsState.ballsBowled;
    const isOverEnded = isLegalBall && (willBeOversBowled % 6 === 0);

    if (isOverEnded) {
      const prevStriker = newStriker;
      newStriker = newNonStriker;
      newNonStriker = prevStriker;
    }

    const updatedMatch: MatchState = {
      ...activeMatch,
      ballsLog: updatedBallsLog,
      striker: newStriker,
      nonStriker: newNonStriker,
      firstInnings: computeInningsState(updatedBallsLog, 1, activeMatch.config),
      secondInnings: computeInningsState(updatedBallsLog, 2, activeMatch.config),
      redoStack: [], // Clear redo on new action
    };

    setSelectedStriker(newStriker);
    setSelectedNonStriker(newNonStriker);

    // Innings end detection
    const computedCurrent = innings === 1 ? updatedMatch.firstInnings : updatedMatch.secondInnings;
    const limitBalls = activeMatch.config.oversLimit * 6;
    const outOfWickets = computedCurrent.wickets >= (activeMatch.config.playersPerTeam - 1);
    const oversFinished = computedCurrent.ballsBowled >= limitBalls;

    if (innings === 1 && (outOfWickets || oversFinished)) {
      openCustomModal('alert', 'Innings Complete', 'First Innings Completed! Switching to Second Innings.', () => {
        updatedMatch.currentInnings = 2;
        const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
        const secondBattingTeam = teamAFirst ? activeMatch.config.teamBPlayers : activeMatch.config.teamAPlayers;
        const secondBowlingTeam = teamAFirst ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers;
        updatedMatch.striker = secondBattingTeam[0] || 'Batsman 1';
        updatedMatch.nonStriker = secondBattingTeam[1] || 'Batsman 2';
        updatedMatch.currentBowler = secondBowlingTeam[0] || 'Bowler 1';
        setSelectedStriker(updatedMatch.striker);
        setSelectedNonStriker(updatedMatch.nonStriker);
        setSelectedBowler(updatedMatch.currentBowler);
        saveLocalMatch(updatedMatch);
        setMatches(getLocalMatches());
      });
    } else if (innings === 2) {
      const firstInningsRuns = updatedMatch.firstInnings.runs;
      const secondInningsRuns = computedCurrent.runs;
      const targetChased = secondInningsRuns > firstInningsRuns;

      if (targetChased || outOfWickets || oversFinished) {
        updatedMatch.status = 'completed';
        const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
        const chasingTeam = teamAFirst ? activeMatch.config.teamBName : activeMatch.config.teamAName;
        const defendingTeam = teamAFirst ? activeMatch.config.teamAName : activeMatch.config.teamBName;
        
        let winnerName = '';
        if (secondInningsRuns === firstInningsRuns) {
          winnerName = 'Match Tied';
        } else {
          winnerName = secondInningsRuns > firstInningsRuns ? chasingTeam : defendingTeam;
        }

        updatedMatch.winner = winnerName;
        openCustomModal('alert', 'Match Completed 🎉', `The match has ended! Result: ${winnerName === 'Match Tied' ? 'It is a TIE!' : `Winner is ${winnerName}`}`, () => {
          setView('history');
        });
      }
    }

    saveLocalMatch(updatedMatch);
    setMatches(getLocalMatches());
  };

  const handleUndo = async () => {
    if (!activeMatch || activeMatch.ballsLog.length === 0) return;
    const updatedBallsLog = [...activeMatch.ballsLog];
    const lastBall = updatedBallsLog.pop();

    if (!lastBall) return;

    const updatedMatch: MatchState = {
      ...activeMatch,
      ballsLog: updatedBallsLog,
      firstInnings: computeInningsState(updatedBallsLog, 1, activeMatch.config),
      secondInnings: computeInningsState(updatedBallsLog, 2, activeMatch.config),
    };

    // Revert active striker, non striker, and bowler to last ball's initial values
    setSelectedStriker(lastBall.batsmanStriker);
    setSelectedNonStriker(lastBall.batsmanNonStriker);
    setSelectedBowler(lastBall.bowler);

    updatedMatch.striker = lastBall.batsmanStriker;
    updatedMatch.nonStriker = lastBall.batsmanNonStriker;
    updatedMatch.currentBowler = lastBall.bowler;

    // Delete last ball from Supabase if active
    if (supabase) {
      supabase.from('balls_log').delete().eq('id', lastBall.id).then();
    }

    saveLocalMatch(updatedMatch);
    setMatches(getLocalMatches());
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flex: 1, padding: '16px', boxSizing: 'border-box' }}>
      {/* Header bar */}
      <header className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 0 20px rgba(99,102,241,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #a7f3d0 0%, #34d399 50%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Smartphone size={22} style={{ stroke: '#34d399' }} /> MJ SCORER
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setView('lobby')} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px' }}>Home</button>
          <button onClick={() => setView('history')} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px' }}>Logs</button>
        </div>
      </header>

      {/* Lobby View */}
      {view === 'lobby' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
          <div className="glass-panel" style={{ padding: '32px 24px', textAlign: 'center', background: 'radial-gradient(circle at top, rgba(99,102,241,0.15) 0%, rgba(9,13,22,0.4) 100%)' }}>
            <h2 style={{ marginTop: 0, fontSize: '24px', fontWeight: 800 }}>Society Cricket Matches</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '28px', lineHeight: '1.6' }}>
              Score local matches ball-by-ball, save detailed records, and share real-time score updates.
            </p>
            <button onClick={startNewMatchSetup} style={{ width: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', fontSize: '16px', fontWeight: 700, padding: '14px', border: 'none', boxShadow: 'var(--shadow-emerald)' }}>
              Create Match
            </button>
          </div>

          <h3 style={{ margin: '10px 0 0 0', fontSize: '18px', fontWeight: 700 }}>Live & Active Games</h3>
          {matches.filter(m => m.status === 'live').length === 0 ? (
            <div className="glass-card" style={{ padding: '20px', textShadow: 'none', textAlign: 'center', color: '#94a3b8' }}>
              No live matches currently. Click Create Match above to start!
            </div>
          ) : (
            matches.filter(m => m.status === 'live').map(m => (
              <div key={m.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="live-badge">Live</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{m.config.oversLimit} Overs Match</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '18px' }}>
                  <span>{m.config.teamAName}</span>
                  <span>vs</span>
                  <span>{m.config.teamBName}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleSelectActiveMatch(m.id, 'scorer')} style={{ flex: 1, background: '#1e293b' }}>
                    Score Match
                  </button>
                  <button onClick={() => handleSelectActiveMatch(m.id, 'viewer')} style={{ flex: 1, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                    View Live
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Setup View */}
      {view === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ margin: 0 }}>Match Settings</h3>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#94a3b8' }}>Team A Name</label>
              <input type="text" value={teamAName} onChange={(e) => setTeamAName(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#94a3b8' }}>Team B Name</label>
              <input type="text" value={teamBName} onChange={(e) => setTeamBName(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#94a3b8' }}>Total Overs</label>
              <input type="number" value={oversLimit} onChange={(e) => setOversLimit(parseInt(e.target.value) || 8)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#94a3b8' }}>Toss Winner</label>
              <select value={tossWinner} onChange={(e: any) => setTossWinner(e.target.value)}>
                <option value="Team A">Team A</option>
                <option value="Team B">Team B</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#94a3b8' }}>Toss Choice</label>
              <select value={tossDecision} onChange={(e: any) => setTossDecision(e.target.value)}>
                <option value="Batting">Batting</option>
                <option value="Bowling">Bowling</option>
              </select>
            </div>
            <button onClick={handleCreateMatch} style={{ background: '#10b981', color: '#fff', fontSize: '16px', fontWeight: 600, padding: '12px', marginTop: '10px' }}>
              Start Scoreboard
            </button>
          </div>
        </div>
      )}

      {/* Scorer View */}
      {view === 'scorer' && activeMatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          {/* Match Score Header */}
          <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="live-badge" style={{ marginBottom: '10px' }}>Live</div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>
              {activeMatch.config.teamAName} vs {activeMatch.config.teamBName}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, margin: '8px 0' }}>
              {activeMatch.currentInnings === 1 ? activeMatch.firstInnings.runs : activeMatch.secondInnings.runs} / {activeMatch.currentInnings === 1 ? activeMatch.firstInnings.wickets : activeMatch.secondInnings.wickets}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>
              Overs: {Math.floor((activeMatch.currentInnings === 1 ? activeMatch.firstInnings.ballsBowled : activeMatch.secondInnings.ballsBowled) / 6)}.{ (activeMatch.currentInnings === 1 ? activeMatch.firstInnings.ballsBowled : activeMatch.secondInnings.ballsBowled) % 6 } / {activeMatch.config.oversLimit}
            </div>
            {activeMatch.currentInnings === 2 && (
              <div style={{ marginTop: '8px', color: '#34d399', fontWeight: 600 }}>
                Target: {activeMatch.firstInnings.runs + 1} runs (Need {activeMatch.firstInnings.runs + 1 - activeMatch.secondInnings.runs} more)
              </div>
            )}
          </div>

          {/* Current Batsmen / Bowler */}
          <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
              <span style={{ fontWeight: 600 }}>Striker: 🏏 {selectedStriker}</span>
              <span>{(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).batsmenStats[selectedStriker]?.runs || 0} runs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
              <span style={{ color: '#94a3b8' }}>Non-Striker: {selectedNonStriker}</span>
              <span>{(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).batsmenStats[selectedNonStriker]?.runs || 0} runs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Bowler: 🥎 {selectedBowler}</span>
              <span>{(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).bowlerStats[selectedBowler]?.overs || '0.0'} Overs</span>
            </div>
          </div>

          {/* Active Over Progression */}
          <div className="glass-card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>Current Over:</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).currentOverBalls.map((b, i) => (
                <div key={i} style={{
                  width: '32px', height: '32px', borderRadius: '50%', background: b.wicket ? '#ef4444' : '#1e293b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  {b.wicket ? `W${b.runs > 0 ? `+${b.runs}` : ''}` : (b.extraType ? (b.extraType === 'wide' ? `WD${b.extraRuns > 1 ? `+${b.extraRuns - 1}` : ''}` : `NB${b.runs > 0 ? `+${b.runs}` : ''}`) : b.runs)}
                </div>
              ))}
            </div>
          </div>

          {/* Scoring Controls */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <button onClick={() => handleBallScored(0, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0' }}>0</button>
              <button onClick={() => handleBallScored(1, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0' }}>1</button>
              <button onClick={() => handleBallScored(2, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0' }}>2</button>
              <button onClick={() => handleBallScored(3, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0' }}>3</button>
              <button onClick={() => handleBallScored(4, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981' }}>4</button>
              <button onClick={() => handleBallScored(6, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981' }}>6</button>
              <button onClick={() => {
                openCustomModal('wide', 'Wide Scored', 'Enter runs scored on this Wide:', (val) => {
                  handleBallScored(0, val, 'wide', false);
                });
              }} style={{ fontSize: '14px', padding: '16px 0', background: '#374151' }}>WD</button>
              <button onClick={() => {
                openCustomModal('noball', 'No Ball Scored', 'Enter runs scored off the bat on this No Ball:', (val) => {
                  handleBallScored(val, 1, 'noball', false);
                });
              }} style={{ fontSize: '14px', padding: '16px 0', background: '#374151' }}>NB+</button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => {
                (window as any).__deliveryType = 'legal'; // Reset delivery type default value
                openCustomModal('wicket', 'Dismissal Event', 'Enter completed runs and dismissal type:', (data) => {
                  const delType = (window as any).__deliveryType || 'legal';
                  const isRunout = data.isRunout;
                  
                  if (delType === 'noball') {
                    // 1 run for No Ball (extra), plus completed runs off the bat, plus Wicket
                    handleBallScored(data.runs, 1, 'noball', true, isRunout ? 'runout' : 'bowled');
                  } else if (delType === 'wide') {
                    // Wides don't count off the bat, all runs completed go to extraRuns
                    handleBallScored(0, data.runs + 1, 'wide', true, isRunout ? 'runout' : 'bowled');
                  } else {
                    // Standard legal delivery dismissal
                    handleBallScored(data.runs, 0, null, true, isRunout ? 'runout' : 'bowled');
                  }
                });
              }} style={{ flex: 1, background: '#ef4444', color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                WICKET+
              </button>
              <button onClick={handleUndo} style={{ background: '#374151', color: '#fff', padding: '12px' }}>
                <Undo size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewer Dashboard View */}
      {view === 'viewer' && activeMatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
            <div className="live-badge" style={{ marginBottom: '12px' }}>Live Updates</div>
            <h2>{activeMatch.config.teamAName} vs {activeMatch.config.teamBName}</h2>
            <div style={{ fontSize: '36px', fontWeight: 800, margin: '12px 0' }}>
              {activeMatch.currentInnings === 1 ? activeMatch.firstInnings.runs : activeMatch.secondInnings.runs} / {activeMatch.currentInnings === 1 ? activeMatch.firstInnings.wickets : activeMatch.secondInnings.wickets}
            </div>
            <div style={{ color: '#94a3b8' }}>
              Overs: {Math.floor((activeMatch.currentInnings === 1 ? activeMatch.firstInnings.ballsBowled : activeMatch.secondInnings.ballsBowled) / 6)}.{ (activeMatch.currentInnings === 1 ? activeMatch.firstInnings.ballsBowled : activeMatch.secondInnings.ballsBowled) % 6 } / {activeMatch.config.oversLimit}
            </div>
          </div>
        </div>
      )}

      {/* History Log View */}
      {view === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
          <h2 style={{ margin: '0 0 10px 0' }}>Completed Match Logs</h2>
          {matches.filter(m => m.status === 'completed').length === 0 ? (
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
              No completed matches in history.
            </div>
          ) : (
            matches.filter(m => m.status === 'completed').map(m => (
              <div key={m.id} className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'Date Unknown'}</span>
                  <span>{m.config.oversLimit} Overs</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px' }}>
                  <span>{m.config.teamAName} ({m.firstInnings.runs}/{m.firstInnings.wickets})</span>
                  <span>vs</span>
                  <span>{m.config.teamBName} ({m.secondInnings.runs}/{m.secondInnings.wickets})</span>
                </div>
                {m.winner && (
                  <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                    🏆 Winner: {m.winner}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Styled Custom Immersive Modal Overlay */}
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '380px', padding: '24px',
            background: 'radial-gradient(circle at top, rgba(99,102,241,0.2) 0%, rgba(9,13,22,0.95) 100%)',
            boxShadow: '0 0 40px rgba(52, 211, 153, 0.25)',
            display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative'
          }}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-primary-hover)' }}>
              {modalTitle}
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {modalMessage}
            </p>

            {/* Inputs based on modal type */}
            {(modalType === 'wide' || modalType === 'noball') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>Runs:</label>
                <input
                  type="number"
                  value={modalInputVal}
                  onChange={(e) => setModalInputVal(e.target.value)}
                  style={{ fontSize: '16px', padding: '10px' }}
                  autoFocus
                />
              </div>
            )}

            {modalType === 'wicket' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>Completed Runs:</label>
                  <input
                    type="number"
                    value={modalInputVal}
                    onChange={(e) => setModalInputVal(e.target.value)}
                    style={{ fontSize: '16px', padding: '10px' }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={modalBoolVal}
                    onChange={(e) => setModalBoolVal(e.target.checked)}
                    id="modalRunoutCheck"
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="modalRunoutCheck" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    Dismissal by Run Out?
                  </label>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginTop: '4px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Delivery Type:</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="delivType" defaultChecked onChange={() => (window as any).__deliveryType = 'legal'} style={{ width: '16px', height: '16px' }} /> Legal
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="delivType" onChange={() => (window as any).__deliveryType = 'noball'} style={{ width: '16px', height: '16px' }} /> No Ball
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="delivType" onChange={() => (window as any).__deliveryType = 'wide'} style={{ width: '16px', height: '16px' }} /> Wide
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              {modalType !== 'alert' && (
                <button
                  onClick={() => setModalOpen(false)}
                  style={{ flex: 1, background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  setModalOpen(false);
                  if (modalOnConfirm) {
                    if (modalType === 'wicket') {
                      modalOnConfirm({
                        runs: parseInt(modalInputVal) || 0,
                        isRunout: modalBoolVal
                      });
                    } else if (modalType === 'wide' || modalType === 'noball') {
                      modalOnConfirm(parseInt(modalInputVal) || 0);
                    } else {
                      modalOnConfirm();
                    }
                  }
                }}
                style={{ flex: 1, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', fontWeight: 700 }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
