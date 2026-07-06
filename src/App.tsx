import { useState, useEffect } from 'react';
import { 
  Undo, Swords, SportShoe
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
  const [recordingMode, setRecordingMode] = useState<'basic' | 'advanced'>('basic');
  const [dbPlayers, setDbPlayers] = useState<string[]>([]); // onboarded players list
  
  // Dynamic Roster Arrays (Initialized to 11 players each)
  const [teamAPlayers, setTeamAPlayers] = useState<string[]>([
    'Player A1', 'Player A2', 'Player A3', 'Player A4', 'Player A5', 'Player A6',
    'Player A7', 'Player A8', 'Player A9', 'Player A10', 'Player A11'
  ]);
  const [teamBPlayers, setTeamBPlayers] = useState<string[]>([
    'Player B1', 'Player B2', 'Player B3', 'Player B4', 'Player B5', 'Player B6',
    'Player B7', 'Player B8', 'Player B9', 'Player B10', 'Player B11'
  ]);

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

  // Easter Egg Double Tap tracking
  const [lastTap, setLastTap] = useState(0);

  // Device Lock & Ownership Transfer States
  const [deviceId, setDeviceId] = useState('');
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');

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
                  playersPerTeam: m.team_a_players ? m.team_a_players.length : 11,
                  tossWinner: m.toss_winner,
                  tossDecision: m.toss_decision,
                  teamAPlayers: m.team_a_players || [],
                  teamBPlayers: m.team_b_players || [],
                  recordingMode: m.recording_mode || 'basic',
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
                  deviceLockOwner: m.device_lock_owner || undefined,
                  transferCode: m.transfer_code || undefined,
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

    const fetchPlayers = async () => {
      if (supabase) {
        try {
          const { data, error } = await supabase.from('players').select('name');
          if (error) throw error;
          if (data) {
            setDbPlayers(data.map((p: any) => p.name));
          }
        } catch (e) {
          console.error("Failed to fetch players:", e);
        }
      }
    };

    // Initialize device UUID
    let devId = localStorage.getItem('mj_cricket_device_id');
    if (!devId) {
      devId = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('mj_cricket_device_id', devId);
    }
    setDeviceId(devId);

    fetchMatches();
    fetchPlayers();

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
      recordingMode,
    };
    const newMatch = createInitialMatch(config);
    newMatch.deviceLockOwner = deviceId; // Lock match to current device
    newMatch.transferCode = Math.floor(1000 + Math.random() * 9000).toString(); // Generate 4-digit code
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

      // Check device lock ownership before entering scorer mode
      if (targetView === 'scorer' && m.deviceLockOwner && m.deviceLockOwner !== deviceId) {
        // Not the owner! Force to spectator viewer mode and open transfer modal request
        setView('viewer');
        setInputCode('');
        setTransferModalOpen(true);
        return;
      }
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
    const outOfWickets = computedCurrent.wickets >= activeMatch.config.playersPerTeam;
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
          <Swords size={22} style={{ stroke: '#34d399' }} /> HERMES
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
          <div className="glass-panel" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-primary-hover)' }}>Match Setup</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(17,24,39,0.5)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <button 
                type="button"
                onClick={() => setRecordingMode('basic')}
                style={{ 
                  padding: '10px', fontSize: '13px', border: 'none', borderRadius: '10px',
                  background: recordingMode === 'basic' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                  fontWeight: 700, boxShadow: recordingMode === 'basic' ? 'var(--shadow-emerald)' : 'none'
                }}
              >
                Basic Mode
              </button>
              <button 
                type="button"
                onClick={() => setRecordingMode('advanced')}
                style={{ 
                  padding: '10px', fontSize: '13px', border: 'none', borderRadius: '10px',
                  background: recordingMode === 'advanced' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                  fontWeight: 700, boxShadow: recordingMode === 'advanced' ? 'var(--shadow-emerald)' : 'none'
                }}
              >
                Advanced Roster
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', marginBottom: '6px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Team A Name</label>
                <input type="text" value={teamAName} onChange={(e) => setTeamAName(e.target.value)} style={{ padding: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', marginBottom: '6px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Team B Name</label>
                <input type="text" value={teamBName} onChange={(e) => setTeamBName(e.target.value)} style={{ padding: '12px' }} />
              </div>
            </div>

            {/* Custom Mobile-Friendly Overs Counter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Overs</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setOversLimit(Math.max(1, oversLimit - 1))}
                  style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  -
                </button>
                <div style={{ 
                  flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
                  fontSize: '18px', fontWeight: 700 
                }}>
                  {oversLimit}
                </div>
                <button 
                  type="button" 
                  onClick={() => setOversLimit(oversLimit + 1)}
                  style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Mobile-Friendly Squad Size Counter (Adjustable in both basic and advanced modes) */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Players per Team</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => {
                    const nextVal = Math.max(2, teamAPlayers.length - 1);
                    setTeamAPlayers(Array.from({length: nextVal}, (_, i) => `Player A${i+1}`));
                    setTeamBPlayers(Array.from({length: nextVal}, (_, i) => `Player B${i+1}`));
                  }}
                  style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  -
                </button>
                <div style={{ 
                  flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
                  fontSize: '18px', fontWeight: 700 
                }}>
                  {teamAPlayers.length} Players
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    const nextVal = Math.min(16, teamAPlayers.length + 1);
                    setTeamAPlayers(Array.from({length: nextVal}, (_, i) => `Player A${i+1}`));
                    setTeamBPlayers(Array.from({length: nextVal}, (_, i) => `Player B${i+1}`));
                  }}
                  style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  +
                </button>
              </div>
            </div>

            {/* In Advanced mode, display onboarding options and player list selections */}
            {recordingMode === 'advanced' && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-hover)' }}>Onboard New Player</h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    id="newPlayerOnboardInput" 
                    placeholder="Enter full name" 
                    style={{ flex: 1 }} 
                  />
                  <button 
                    type="button" 
                    onClick={async () => {
                      const input = document.getElementById('newPlayerOnboardInput') as HTMLInputElement;
                      const name = input?.value?.trim();
                      if (!name) return;
                      
                      // Save to Supabase table 'players'
                      if (supabase) {
                        try {
                          await supabase.from('players').insert([{ name }]);
                          // Add to current state list
                          setDbPlayers([...dbPlayers, name]);
                          input.value = '';
                          alert(`${name} onboarded successfully!`);
                        } catch (err) {
                          console.error(err);
                        }
                      } else {
                        // Local fallback
                        setDbPlayers([...dbPlayers, name]);
                        input.value = '';
                        alert(`${name} onboarded successfully (Local)!`);
                      }
                    }}
                    style={{ background: '#10b981', border: 'none', color: '#fff', fontWeight: 700 }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#94a3b8' }}>{teamAName} Roster</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teamAPlayers.map((p, idx) => (
                        <select 
                          key={idx} 
                          value={p} 
                          onChange={(e) => {
                            const updated = [...teamAPlayers];
                            updated[idx] = e.target.value;
                            setTeamAPlayers(updated);
                          }}
                        >
                          <option value={`Player A${idx+1}`}>{`Player A${idx+1} (Default)`}</option>
                          {dbPlayers.map((dbP) => (
                            <option key={dbP} value={dbP}>{dbP}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#94a3b8' }}>{teamBName} Roster</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teamBPlayers.map((p, idx) => (
                        <select 
                          key={idx} 
                          value={p} 
                          onChange={(e) => {
                            const updated = [...teamBPlayers];
                            updated[idx] = e.target.value;
                            setTeamBPlayers(updated);
                          }}
                        >
                          <option value={`Player B${idx+1}`}>{`Player B${idx+1} (Default)`}</option>
                          {dbPlayers.map((dbP) => (
                            <option key={dbP} value={dbP}>{dbP}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Toss Settings */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Toss Winner</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    type="button"
                    onClick={() => setTossWinner('Team A')}
                    style={{ 
                      padding: '12px', border: tossWinner === 'Team A' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: tossWinner === 'Team A' ? 'rgba(16,185,129,0.15)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    {teamAName}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTossWinner('Team B')}
                    style={{ 
                      padding: '12px', border: tossWinner === 'Team B' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: tossWinner === 'Team B' ? 'rgba(16,185,129,0.15)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    {teamBName}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', marginBottom: '8px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Decision</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    type="button"
                    onClick={() => setTossDecision('Batting')}
                    style={{ 
                      padding: '12px', border: tossDecision === 'Batting' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: tossDecision === 'Batting' ? 'rgba(16,185,129,0.15)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    Batting
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTossDecision('Bowling')}
                    style={{ 
                      padding: '12px', border: tossDecision === 'Bowling' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: tossDecision === 'Bowling' ? 'rgba(16,185,129,0.15)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    Bowling
                  </button>
                </div>
              </div>
            </div>

            <button onClick={handleCreateMatch} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#fff', fontSize: '16px', fontWeight: 700, padding: '14px', marginTop: '10px', boxShadow: 'var(--shadow-emerald)' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="live-badge">Live</div>
              {activeMatch.transferCode && (
                <div style={{ fontSize: '11px', color: 'var(--color-primary-hover)', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 700 }}>
                  Transfer Code: {activeMatch.transferCode}
                </div>
              )}
            </div>
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

          {/* Current Batsmen / Bowler - Dropdowns for Advanced Mode, simple display for Basic Mode */}
          {activeMatch.config.recordingMode === 'advanced' ? (
            <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Striker 🏏</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <select 
                    value={selectedStriker} 
                    onChange={(e) => setSelectedStriker(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px' }}
                  >
                    {(activeMatch.currentInnings === 1 
                      ? (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                      : (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                    ).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                    {(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).batsmenStats[selectedStriker]?.runs || 0} runs
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Non-Striker</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <select 
                    value={selectedNonStriker} 
                    onChange={(e) => setSelectedNonStriker(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px' }}
                  >
                    {(activeMatch.currentInnings === 1 
                      ? (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                      : (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                    ).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>
                    {(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).batsmenStats[selectedNonStriker]?.runs || 0} runs
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Bowler 🥎</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <select 
                    value={selectedBowler} 
                    onChange={(e) => setSelectedBowler(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px' }}
                  >
                    {(activeMatch.currentInnings === 1 
                      ? (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                      : (activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers) : (activeMatch.config.tossDecision === 'Bowling' ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers))
                    ).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                    {(activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings).bowlerStats[selectedBowler]?.overs || '0.0'} Overs
                  </span>
                </div>
              </div>
            </div>
          ) : (
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
          )}

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
          <h2 style={{ margin: '0 0 10px 0' }}>Match History & Logs</h2>
          {matches.filter(m => m.status !== 'live').length === 0 ? (
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
              No matches found in history.
            </div>
          ) : (
            matches.filter(m => m.status !== 'live').map(m => (
              <div key={m.id} className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'Date Unknown'}</span>
                  <span>{m.config.oversLimit} Overs ({m.status})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px' }}>
                  <span>{m.config.teamAName} ({m.firstInnings.runs}/{m.firstInnings.wickets})</span>
                  <span>vs</span>
                  <span>{m.config.teamBName} ({m.secondInnings.runs}/{m.secondInnings.wickets})</span>
                </div>
                {m.winner ? (
                  <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                    🏆 Winner: {m.winner}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                    Match Status: {m.status}
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
      {/* Horizontal Replay Timeline Component (Visible inside active match scorer or viewer mode) */}
      {(view === 'scorer' || view === 'viewer') && activeMatch && activeMatch.ballsLog.length > 0 && (
        <div className="glass-panel" style={{ 
          marginTop: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', 
          boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' 
        }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Match Replay Timeline (Scroll ↔)
          </div>
          <div style={{ 
            display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', 
            scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' 
          }}>
            {/* Group balls by over */}
            {Array.from({ length: Math.ceil(activeMatch.ballsLog.length / 6) }).map((_, overIndex) => {
              const overBalls = activeMatch.ballsLog.filter(b => b.overNum === overIndex);
              if (overBalls.length === 0) return null;
              return (
                <div key={overIndex} style={{ 
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: '10px', padding: '8px 12px', display: 'flex', flexDirection: 'column', 
                  gap: '6px', minWidth: '150px' 
                }}>
                  <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 700 }}>
                    Over {overIndex + 1}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {overBalls.map((b, bIdx) => (
                      <div key={bIdx} style={{
                        width: '24px', height: '24px', borderRadius: '50%', 
                        background: b.wicket ? '#ef4444' : '#1e293b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '9px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {b.wicket ? 'W' : (b.extraType ? (b.extraType === 'wide' ? 'WD' : 'NB') : b.runs)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Device Transfer Code Authentication Modal Overlay */}
      {transferModalOpen && activeMatch && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 8, 16, 0.9)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '360px', padding: '24px',
            background: 'radial-gradient(circle at top, rgba(99,102,241,0.2) 0%, rgba(9,13,22,0.98) 100%)',
            display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(16,185,129,0.3)'
          }}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-primary-hover)' }}>
              Transfer Scoring Access ⚡
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
              Only one device can score a match at a time to prevent duplicate state sync errors. Enter the 4-digit code shown on the host device to acquire control.
            </p>
            <input 
              type="text" 
              maxLength={4}
              placeholder="Enter 4-Digit Code"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              style={{ fontSize: '20px', textAlign: 'center', letterSpacing: '0.2em', padding: '10px' }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={() => setTransferModalOpen(false)}
                style={{ flex: 1, background: '#1e293b' }}
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (inputCode.trim() === activeMatch.transferCode) {
                    // Match code valid! Change owner to current deviceId
                    const updatedMatch = {
                      ...activeMatch,
                      deviceLockOwner: deviceId
                    };
                    await saveLocalMatch(updatedMatch);
                    // Update frontend state list
                    setMatches(prev => prev.map(m => m.id === activeMatch.id ? updatedMatch : m));
                    setTransferModalOpen(false);
                    setView('scorer');
                    alert("Access acquired! You can now score the match.");
                  } else {
                    alert("Invalid transfer code! Please check the host screen.");
                  }
                }}
                style={{ flex: 1, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', fontWeight: 700 }}
              >
                Transfer Control
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Easter Egg trigger in the footer (Double tap to activate) */}
      <footer style={{ 
        marginTop: 'auto', paddingTop: '30px', paddingBottom: '10px', 
        display: 'flex', justifyContent: 'center', opacity: 0.25, transition: 'opacity 0.2s' 
      }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.25'}>
        <button 
          onClick={() => {
            const now = Date.now();
            const DOUBLE_PRESS_DELAY = 300;
            if (now - lastTap < DOUBLE_PRESS_DELAY) {
              openCustomModal(
                'alert', 
                'About the name "Hermes" ⚡', 
                'In Greek mythology, Hermes is the swift messenger god of speed, transitions, games, and sports. He represents agility, fast-paced decision making, and strategic wit.',
                () => {}
              );
            }
            setLastTap(now);
          }}
          style={{ 
            background: 'transparent', border: 'none', boxShadow: 'none', padding: '10px', 
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
          title="Hermes Legend (Double Tap)"
        >
          <SportShoe size={18} style={{ stroke: 'var(--color-text-secondary)' }} />
        </button>
      </footer>
    </div>
  );
}
