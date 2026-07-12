import { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { 
  Undo, Swords, SportShoe, Flame, Zap, Target, Award, Play, Trophy, Menu, X, Share2
} from 'lucide-react';
import { MatchConfig, MatchState, BallRecord } from './types/cricket';
import { createInitialMatch, computeInningsState } from './utils/scoringEngine';
import { getLocalMatches, saveLocalMatch, supabase, getLocalTeams, saveLocalTeams } from './db/supabase';

export default function App() {
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  
  // App views: 'lobby' | 'setup' | 'scorer' | 'viewer' | 'history' | 'players' | 'teams'
  const [view, setView] = useState<string>('lobby');
  const [viewHistory, setViewHistory] = useState<string[]>(['lobby']);

  // Burger Menu State
  const [menuOpen, setMenuOpen] = useState(false);

  // Teams list State
  const [teams, setTeams] = useState<Array<{ name: string; players: string[] }>>([]);
  const [selectedTeamAId, setSelectedTeamAId] = useState<string>('');
  const [selectedTeamBId, setSelectedTeamBId] = useState<string>('');
  const [newTeamNameInput, setNewTeamNameInput] = useState('');

  // Players view filtering & sorting states
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSortKey, setPlayerSortKey] = useState<string>('xp');
  const [playerSortOrder, setPlayerSortOrder] = useState<'asc' | 'desc'>('desc');

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
  const [modalType, setModalType] = useState<'wide' | 'noball' | 'wicket' | 'alert' | 'selectBowler' | 'selectBatsman'>('alert');
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<((data?: any) => void) | null>(null);
  
  // Custom Modal input values
  const [modalInputVal, setModalInputVal] = useState('0');
  const [modalBoolVal, setModalBoolVal] = useState(false);
  const [modalPlayersList, setModalPlayersList] = useState<string[]>([]);
  const [modalSelectedPlayer, setModalSelectedPlayer] = useState('');
  const [modalSelectedRole, setModalSelectedRole] = useState<'striker' | 'nonstriker'>('striker');

  // Set of match IDs expanded in Match History view
  const [expandedMatchIds, setExpandedMatchIds] = useState<Set<string>>(new Set());

  // Tracks active touch/click tooltip text on mobile devices
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  // Easter Egg Double Tap tracking
  const [lastTap, setLastTap] = useState(0);

  // Device Lock & Ownership Transfer States
  const [deviceId, setDeviceId] = useState(() => {
    let devId = localStorage.getItem('mj_cricket_device_id');
    if (!devId) {
      devId = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('mj_cricket_device_id', devId);
    }
    return devId;
  });
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');

  const openCustomModal = (
    type: 'wide' | 'noball' | 'wicket' | 'alert' | 'selectBowler' | 'selectBatsman',
    title: string,
    message: string,
    onConfirm: (data?: any) => void,
    players: string[] = []
  ) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalOnConfirm(() => onConfirm);
    setModalInputVal('0');
    setModalBoolVal(false);
    setModalPlayersList(players);
    setModalSelectedPlayer(players[0] || '');
    setModalSelectedRole('striker');
    setModalOpen(true);
  };

  const getLocalMatchesSorted = () => {
    const raw = getLocalMatches();
    return [...raw].sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  };

  const fetchMatches = async () => {
    if (supabase) {
      try {
        const { data: dbMatches, error } = await supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (dbMatches) {
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
        setMatches(getLocalMatchesSorted());
      }
    } else {
      setMatches(getLocalMatchesSorted());
    }
  };

  // Load matches from Supabase (or LocalStorage fallback) and start real-time sync listeners
  useEffect(() => {
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

    const fetchTeams = async () => {
      if (supabase) {
        try {
          const { data, error } = await supabase.from('teams').select('*');
          if (!error && data) {
            setTeams(data.map((t: any) => ({ name: t.name, players: t.players || [] })));
            return;
          }
        } catch (e) {
          console.error("Failed to fetch teams from Supabase:", e);
        }
      }
      setTeams(getLocalTeams());
    };

    fetchMatches();
    fetchPlayers();
    fetchTeams();

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
    // Reset selection and team state to start fresh from manual/custom
    setSelectedTeamAId('');
    setSelectedTeamBId('');
    setTeamAName('Team A');
    setTeamBName('Team B');
    setTeamAPlayers([
      'Player A1', 'Player A2', 'Player A3', 'Player A4', 'Player A5', 'Player A6',
      'Player A7', 'Player A8', 'Player A9', 'Player A10', 'Player A11'
    ]);
    setTeamBPlayers([
      'Player B1', 'Player B2', 'Player B3', 'Player B4', 'Player B5', 'Player B6',
      'Player B7', 'Player B8', 'Player B9', 'Player B10', 'Player B11'
    ]);
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
    setMatches(prev => [newMatch, ...prev]);
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
      // If the match exists in this device's localStorage, we bypass the lock checks
      const localMatches = getLocalMatches();
      const isLocallyOwned = localMatches.some((lm: any) => lm.id === m.id);

      if (targetView === 'scorer' && m.deviceLockOwner && m.deviceLockOwner !== deviceId && !isLocallyOwned) {
        // Not the owner! Force to spectator viewer mode and open transfer modal request
        setView('viewer');
        setViewHistory(prev => [...prev, 'viewer']);
        setInputCode('');
        setTransferModalOpen(true);
        return;
      }
    }
    setView(targetView);
    setViewHistory(prev => [...prev, targetView]);
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
      } else if (isOverEnded) {
        // Prompt user to select next bowler in advanced roster matches
        if (activeMatch.config.recordingMode === 'advanced') {
          const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
          const bowlingTeamList = teamAFirst ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers;
          
          openCustomModal('selectBowler', 'Next Bowler Selection', 'Select the bowler for the next over:', (bowlerData) => {
            const selectedNextBowler = bowlerData?.bowler || selectedBowler;
            setSelectedBowler(selectedNextBowler);
            updatedMatch.currentBowler = selectedNextBowler;
            saveLocalMatch(updatedMatch);
            setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
          }, bowlingTeamList);
        } else {
          openCustomModal('alert', 'Over Completed 🛑', `Over ${Math.floor(willBeOversBowled / 6)} has finished! Tap OK to prepare starting the next over.`, () => {
            // Standard alert
          });
        }
      }
    } else {
      if (isOverEnded) {
        // Prompt user to select next bowler in advanced roster matches
        if (activeMatch.config.recordingMode === 'advanced') {
          const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
          const bowlingTeamList = teamAFirst ? activeMatch.config.teamBPlayers : activeMatch.config.teamAPlayers;
          
          openCustomModal('selectBowler', 'Next Bowler Selection', 'Select the bowler for the next over:', (bowlerData) => {
            const selectedNextBowler = bowlerData?.bowler || selectedBowler;
            setSelectedBowler(selectedNextBowler);
            updatedMatch.currentBowler = selectedNextBowler;
            saveLocalMatch(updatedMatch);
            setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
          }, bowlingTeamList);
        } else {
          openCustomModal('alert', 'Over Completed 🛑', `Over ${Math.floor(willBeOversBowled / 6)} has finished! Tap OK to prepare starting the next over.`, () => {
            // Standard alert
          });
        }
      }
    }

    // Advanced Wicket-Fall new batsman prompt
    const firstInningsRuns = updatedMatch.firstInnings.runs;
    const secondInningsRuns = computedCurrent.runs;
    const targetChased = innings === 2 && secondInningsRuns > firstInningsRuns;

    if (wicket && activeMatch.config.recordingMode === 'advanced' && !outOfWickets && !oversFinished && !targetChased) {
      const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
      const battingRoster = (innings === 1)
        ? (teamAFirst ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers)
        : (teamAFirst ? activeMatch.config.teamBPlayers : activeMatch.config.teamAPlayers);
      
      // Filter out batsman who are already in (striker/nonStriker) and any who have already been dismissed
      const currentInningsBalls = updatedBallsLog.filter(b => b.innings === innings);
      const dismissedBatsmen = currentInningsBalls.filter(b => b.wicket && b.wicketType !== 'runout').map(b => b.batsmanStriker);
      // For runouts, find the actual player who got run out if recorded, otherwise standard striker
      currentInningsBalls.forEach(b => {
        if (b.wicket && b.wicketType === 'runout') {
          dismissedBatsmen.push(b.batsmanStriker); // fallback to striker
        }
      });
      
      const availableBatsmen = battingRoster.filter(p => p !== newStriker && p !== newNonStriker && !dismissedBatsmen.includes(p));

      if (availableBatsmen.length > 0) {
        openCustomModal('selectBatsman', 'New Batsman Selection', 'Select the incoming batsman and role:', (batsmanData) => {
          const incomingBatsman = batsmanData?.batsman || availableBatsmen[0];
          const assignRole = batsmanData?.role || 'striker';
          
          let finalStriker = newStriker;
          let finalNonStriker = newNonStriker;

          if (assignRole === 'striker') {
            finalStriker = incomingBatsman;
            setSelectedStriker(incomingBatsman);
          } else {
            finalNonStriker = incomingBatsman;
            setSelectedNonStriker(incomingBatsman);
          }

          updatedMatch.striker = finalStriker;
          updatedMatch.nonStriker = finalNonStriker;

          // If this was ALSO the end of the over, now trigger the Bowler selection prompt AFTER batsman is resolved
          if (isOverEnded) {
            const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
            const bowlingTeamList = (innings === 1)
              ? (teamAFirst ? activeMatch.config.teamBPlayers : activeMatch.config.teamAPlayers)
              : (teamAFirst ? activeMatch.config.teamAPlayers : activeMatch.config.teamBPlayers);
            
            openCustomModal('selectBowler', 'Next Bowler Selection', 'Select the bowler for the next over:', (bowlerData) => {
              const selectedNextBowler = bowlerData?.bowler || selectedBowler;
              setSelectedBowler(selectedNextBowler);
              updatedMatch.currentBowler = selectedNextBowler;
              saveLocalMatch(updatedMatch);
              setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
            }, bowlingTeamList);
          } else {
            saveLocalMatch(updatedMatch);
            setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
          }
        }, availableBatsmen);
      } else {
        saveLocalMatch(updatedMatch);
        setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
      }
    } else {
      saveLocalMatch(updatedMatch);
      setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
    }
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
    setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flex: 1, padding: '16px', boxSizing: 'border-box' }}>
      {/* Header bar */}
      <header className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', position: 'relative', zIndex: 950 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {viewHistory.length > 1 && (
            <button
              onClick={() => {
                const updated = [...viewHistory];
                updated.pop(); // remove current view
                const prevView = updated[updated.length - 1] || 'lobby';
                setViewHistory(updated);
                setView(prevView);
              }}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--brand-color-text-secondary)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
          )}
          <h1 
            onClick={() => {
              setView('lobby');
              setViewHistory(['lobby']);
            }}
            style={{ 
              margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', 
              background: 'linear-gradient(135deg, #adadad 0%, var(--brand-color-action) 100%)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              cursor: 'pointer', userSelect: 'none'
            }}
          >
            <Swords size={22} style={{ stroke: 'var(--brand-color-action)' }} /> HERMES
          </h1>
        </div>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setMenuOpen(!menuOpen)} 
            style={{ 
              padding: '8px', borderRadius: '8px', background: 'transparent', border: 'none', 
              boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' 
            }}
            title="Menu"
          >
            {menuOpen ? <X size={24} style={{ stroke: 'var(--brand-color-action)' }} /> : <Menu size={24} style={{ stroke: 'var(--brand-color-text)' }} />}
          </button>
          
          {menuOpen && (
            <div className="glass-panel" style={{
              position: 'absolute', top: '44px', right: 0, width: '160px', 
              display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', 
              zIndex: 999, background: 'rgba(9, 13, 22, 0.98)', border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)'
            }}>
              <button 
                onClick={() => { setView('lobby'); setMenuOpen(false); fetchMatches(); }} 
                style={{ 
                  width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '14px', borderRadius: '6px',
                  background: view === 'lobby' ? 'var(--brand-color-action-bg)' : 'transparent', 
                  border: view === 'lobby' ? '1px solid var(--brand-color-action)' : '1px solid transparent',
                  color: view === 'lobby' ? 'var(--brand-color-action)' : 'var(--brand-color-text)'
                }}
              >
                Home
              </button>
              <button 
                onClick={() => { setView('teams'); setMenuOpen(false); }} 
                style={{ 
                  width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '14px', borderRadius: '6px',
                  background: view === 'teams' ? 'var(--brand-color-action-bg)' : 'transparent', 
                  border: view === 'teams' ? '1px solid var(--brand-color-action)' : '1px solid transparent',
                  color: view === 'teams' ? 'var(--brand-color-action)' : 'var(--brand-color-text)'
                }}
              >
                Teams
              </button>
              <button 
                onClick={() => { setView('players'); setMenuOpen(false); }} 
                style={{ 
                  width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '14px', borderRadius: '6px',
                  background: view === 'players' ? 'var(--brand-color-action-bg)' : 'transparent', 
                  border: view === 'players' ? '1px solid var(--brand-color-action)' : '1px solid transparent',
                  color: view === 'players' ? 'var(--brand-color-action)' : 'var(--brand-color-text)'
                }}
              >
                Players
              </button>
              <button 
                onClick={() => { setView('history'); setMenuOpen(false); }} 
                style={{ 
                  width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '14px', borderRadius: '6px',
                  background: view === 'history' ? 'var(--brand-color-action-bg)' : 'transparent', 
                  border: view === 'history' ? '1px solid var(--brand-color-action)' : '1px solid transparent',
                  color: view === 'history' ? 'var(--brand-color-action)' : 'var(--brand-color-text)'
                }}
              >
                History
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.location.href = "https://github.com/aadityadeshmukh/mj-devils-scorer/raw/cfdcf559c0eede878b3f42d22793f3972dcf1724/mobile/hermes-scricket-scoring.apk";
                }}
                style={{ 
                  width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '14px', borderRadius: '6px',
                  background: 'transparent', 
                  border: '1px solid transparent',
                  color: 'var(--brand-color-text)',
                  boxShadow: 'none'
                }}
              >
                Download App
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Lobby View */}
      {view === 'lobby' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
          <div className="glass-panel" style={{ padding: '32px 24px', textAlign: 'center', background: 'radial-gradient(circle at top, rgba(24,86,255,0.15) 0%, rgba(9,13,22,0.4) 100%)' }}>
            <h2 style={{ marginTop: 0, fontSize: '24px', fontWeight: 800 }}>Society Cricket Matches</h2>
            <p style={{ color: 'var(--brand-color-text-secondary)', fontSize: '14px', marginBottom: '28px', lineHeight: '1.6' }}>
              Score local matches ball-by-ball, save detailed records, and share real-time score updates.
            </p>
            <button onClick={startNewMatchSetup} style={{ width: '100%', background: 'linear-gradient(135deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)', color: '#fff', fontSize: '16px', fontWeight: 700, padding: '14px', border: 'none' }}>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="live-badge" style={{ background: 'rgba(24,86,255,0.1)', color: 'var(--brand-color-action)', border: '1px solid rgba(24,86,255,0.2)' }}>Live</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just Now'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{m.config.oversLimit} Overs Match</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '18px' }}>
                  <span>{m.config.teamAName}</span>
                  <span>vs</span>
                  <span>{m.config.teamBName}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleSelectActiveMatch(m.id, 'scorer')} style={{ flex: 1, background: 'var(--brand-color-fill-secondary)', border: '1px solid var(--brand-color-border)' }}>
                    Score Match
                  </button>
                  <button onClick={() => handleSelectActiveMatch(m.id, 'viewer')} style={{ flex: 1, background: 'rgba(24,86,255,0.1)', color: 'var(--brand-color-action)', border: '1px solid var(--brand-color-border)' }}>
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
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--brand-color-action)' }}>Match Setup</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(17,24,39,0.5)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <button 
                type="button"
                onClick={() => setRecordingMode('basic')}
                style={{ 
                  padding: '10px', fontSize: '13px', border: 'none', borderRadius: '10px',
                  background: recordingMode === 'basic' ? 'linear-gradient(135deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)' : 'transparent',
                  fontWeight: 700
                }}
              >
                Basic Mode
              </button>
              <button 
                type="button"
                onClick={() => setRecordingMode('advanced')}
                style={{ 
                  padding: '10px', fontSize: '13px', border: 'none', borderRadius: '10px',
                  background: recordingMode === 'advanced' ? 'linear-gradient(135deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)' : 'transparent',
                  fontWeight: 700
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

            {/* In Advanced mode, display onboarding options, quick load, and player list selections */}
            {recordingMode === 'advanced' && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Load Saved Teams Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--brand-color-action)' }}>Quick Load Teams</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', marginBottom: '6px', color: '#94a3b8' }}>Load Team A</label>
                      <select
                        value={selectedTeamAId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedTeamAId(val);
                          const selected = teams.find(t => t.name === val);
                          if (selected) {
                            setTeamAName(selected.name);
                            setTeamAPlayers(selected.players.length > 0 ? [...selected.players] : ['Player A1']);
                          } else {
                            // Reset back to Manual/Custom defaults
                            setTeamAName('Team A');
                            setTeamAPlayers(Array.from({ length: teamAPlayers.length }, (_, i) => `Player A${i+1}`));
                          }
                        }}
                        style={{ marginBottom: '6px' }}
                      >
                        <option value="">-- Manual/Custom --</option>
                        {teams.map(t => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          const saveName = prompt("Enter a unique name to save these squads as a team record:", teamAName);
                          if (!saveName) return;
                          
                          const isNewTeam = !teams.some(t => t.name.toLowerCase() === saveName.toLowerCase());
                          const newTeamObj = { name: saveName, players: [...teamAPlayers] };
                          
                          let updatedTeams;
                          if (isNewTeam) {
                            updatedTeams = [...teams, newTeamObj];
                          } else {
                            updatedTeams = teams.map(t => t.name.toLowerCase() === saveName.toLowerCase() ? newTeamObj : t);
                          }
                          
                          setTeams(updatedTeams);
                          await saveLocalTeams(updatedTeams);
                          alert(`Team "${saveName}" quick saved successfully!`);
                        }}
                        style={{ background: 'var(--brand-color-action-bg)', border: '1px solid var(--brand-color-action)', color: 'var(--brand-color-action)', fontSize: '11px', padding: '6px 10px', width: '100%' }}
                      >
                        Quick Save Custom Team
                      </button>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', marginBottom: '6px', color: '#94a3b8' }}>Load Team B</label>
                      <select
                        value={selectedTeamBId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedTeamBId(val);
                          const selected = teams.find(t => t.name === val);
                          if (selected) {
                            setTeamBName(selected.name);
                            setTeamBPlayers(selected.players.length > 0 ? [...selected.players] : ['Player B1']);
                          } else {
                            // Reset back to Manual/Custom defaults
                            setTeamBName('Team B');
                            setTeamBPlayers(Array.from({ length: teamBPlayers.length }, (_, i) => `Player B${i+1}`));
                          }
                        }}
                        style={{ marginBottom: '6px' }}
                      >
                        <option value="">-- Manual/Custom --</option>
                        {teams.map(t => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          const saveName = prompt("Enter a unique name to save these squads as a team record:", teamBName);
                          if (!saveName) return;
                          
                          const isNewTeam = !teams.some(t => t.name.toLowerCase() === saveName.toLowerCase());
                          const newTeamObj = { name: saveName, players: [...teamBPlayers] };
                          
                          let updatedTeams;
                          if (isNewTeam) {
                            updatedTeams = [...teams, newTeamObj];
                          } else {
                            updatedTeams = teams.map(t => t.name.toLowerCase() === saveName.toLowerCase() ? newTeamObj : t);
                          }
                          
                          setTeams(updatedTeams);
                          await saveLocalTeams(updatedTeams);
                          alert(`Team "${saveName}" quick saved successfully!`);
                        }}
                        style={{ background: 'var(--brand-color-action-bg)', border: '1px solid var(--brand-color-action)', color: 'var(--brand-color-action)', fontSize: '11px', padding: '6px 10px', width: '100%' }}
                      >
                        Quick Save Custom Team
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-hover)' }}>Onboard New Player</h4>
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <input 
                      type="text" 
                      id="newPlayerOnboardInput" 
                      placeholder="Enter full name" 
                      autoFocus
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const btn = document.getElementById('newPlayerOnboardSubmitBtn');
                          if (btn) btn.click();
                        }
                      }}
                      style={{ flex: 1, minWidth: 0 }} 
                    />
                    <button 
                      type="button" 
                      id="newPlayerOnboardSubmitBtn"
                      onClick={async () => {
                        const input = document.getElementById('newPlayerOnboardInput') as HTMLInputElement;
                        const name = input?.value?.trim();
                        if (!name) return;
                        
                        // Reject duplicate player name additions (case-insensitive check)
                        const nameExists = dbPlayers.some(p => p.toLowerCase() === name.toLowerCase());
                        if (nameExists) {
                          alert(`Player name "${name}" already exists!`);
                          return;
                        }

                        // Save to Supabase table 'players'
                        if (supabase) {
                          try {
                            await supabase.from('players').insert([{ name }]);
                            // Add to current state list
                            setDbPlayers([...dbPlayers, name]);
                            input.value = '';
                            input.blur(); // dismiss keyboard on success
                            alert(`${name} onboarded successfully!`);
                          } catch (err) {
                            console.error(err);
                          }
                        } else {
                          // Local fallback
                          setDbPlayers([...dbPlayers, name]);
                          input.value = '';
                          input.blur(); // dismiss keyboard on success
                          alert(`${name} onboarded successfully (Local)!`);
                        }
                      }}
                      style={{ background: 'var(--brand-color-action)', border: 'none', color: '#fff', fontWeight: 700, padding: '0 20px', height: '42px', flexShrink: 0 }}
                    >
                      Add
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <div>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#94a3b8' }}>{teamAName} Roster</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {teamAPlayers.map((p, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select 
                              value={p} 
                              onChange={(e) => {
                                const updated = [...teamAPlayers];
                                updated[idx] = e.target.value;
                                setTeamAPlayers(updated);
                              }}
                              style={{ flex: 1 }}
                            >
                              <option value={`Player A${idx+1}`}>{`Player A${idx+1} (Default)`}</option>
                              {dbPlayers.map((dbP) => (
                                <option key={dbP} value={dbP}>{dbP}</option>
                              ))}
                            </select>
                            <span
                              onClick={() => {
                                const updated = teamAPlayers.filter((_, i) => i !== idx);
                                setTeamAPlayers(updated.length > 0 ? updated : ['Player A1']);
                              }}
                              style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: '0 4px' }}
                              title="Remove player from roster"
                            >
                              ×
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#94a3b8' }}>{teamBName} Roster</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {teamBPlayers.map((p, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select 
                              value={p} 
                              onChange={(e) => {
                                const updated = [...teamBPlayers];
                                updated[idx] = e.target.value;
                                setTeamBPlayers(updated);
                              }}
                              style={{ flex: 1 }}
                            >
                              <option value={`Player B${idx+1}`}>{`Player B${idx+1} (Default)`}</option>
                              {dbPlayers.map((dbP) => (
                                <option key={dbP} value={dbP}>{dbP}</option>
                              ))}
                            </select>
                            <span
                              onClick={() => {
                                const updated = teamBPlayers.filter((_, i) => i !== idx);
                                setTeamBPlayers(updated.length > 0 ? updated : ['Player B1']);
                              }}
                              style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: '0 4px' }}
                              title="Remove player from roster"
                            >
                              ×
                            </span>
                          </div>
                        ))}
                      </div>
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
                      padding: '12px', border: tossWinner === 'Team A' ? '2px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.1)',
                      background: tossWinner === 'Team A' ? 'var(--brand-color-action-bg)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    {teamAName}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTossWinner('Team B')}
                    style={{ 
                      padding: '12px', border: tossWinner === 'Team B' ? '2px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.1)',
                      background: tossWinner === 'Team B' ? 'var(--brand-color-action-bg)' : 'transparent', fontWeight: 700 
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
                      padding: '12px', border: tossDecision === 'Batting' ? '2px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.1)',
                      background: tossDecision === 'Batting' ? 'var(--brand-color-action-bg)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    Batting
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTossDecision('Bowling')}
                    style={{ 
                      padding: '12px', border: tossDecision === 'Bowling' ? '2px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.1)',
                      background: tossDecision === 'Bowling' ? 'var(--brand-color-action-bg)' : 'transparent', fontWeight: 700 
                    }}
                  >
                    Bowling
                  </button>
                </div>
              </div>
            </div>

            <button onClick={handleCreateMatch} style={{ background: 'linear-gradient(135deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)', border: 'none', color: '#fff', fontSize: '16px', fontWeight: 700, padding: '14px', marginTop: '10px' }}>
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
            {activeMatch.currentInnings === 2 && (() => {
              const totalBallsLimit = activeMatch.config.oversLimit * 6;
              const ballsRemaining = Math.max(0, totalBallsLimit - activeMatch.secondInnings.ballsBowled);
              const targetScore = activeMatch.firstInnings.runs + 1;
              const runsNeeded = targetScore - activeMatch.secondInnings.runs;
              return (
                <div style={{ marginTop: '8px', color: 'var(--brand-color-action)', fontWeight: 700, fontSize: '13px' }}>
                  Target: {targetScore} ({runsNeeded} req in {ballsRemaining} balls)
                </div>
              );
            })()}
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
              <button onClick={() => handleBallScored(4, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0', background: 'var(--brand-color-success-bg)', border: '1px solid var(--brand-color-link)', color: 'var(--brand-color-link)' }}>4</button>
              <button onClick={() => handleBallScored(6, 0, null, false)} style={{ fontSize: '18px', padding: '16px 0', background: 'var(--brand-color-success-bg)', border: '1px solid var(--brand-color-link)', color: 'var(--brand-color-link)' }}>6</button>
              <button onClick={() => {
                openCustomModal('wide', 'Wide Scored', '1 wide run is added implicitly. Enter any additional runs scored (e.g. from runs run or boundaries):', (data) => {
                  const extraRuns = (data?.runs || 0) + 1;
                  handleBallScored(0, extraRuns, 'wide', false);
                });
              }} style={{ fontSize: '14px', padding: '16px 0', background: '#374151' }}>WD+</button>
              <button onClick={() => {
                openCustomModal('noball', 'No Ball Scored', '1 no ball run is added implicitly. Enter any additional runs scored off the bat or as byes:', (data) => {
                  const additionalRuns = data?.runs || 0;
                  const isByes = data?.isByes || false;
                  if (isByes) {
                    handleBallScored(0, additionalRuns + 1, 'noball', false);
                  } else {
                    handleBallScored(additionalRuns, 1, 'noball', false);
                  }
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

          {/* Match Replay Timeline */}
          {activeMatch && activeMatch.ballsLog.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Match Replay Timeline (Scroll ↔)
              </div>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                {[1, 2].map((inningsNum) => {
                  const inningsBalls = activeMatch.ballsLog.filter(b => b.innings === inningsNum);
                  if (inningsBalls.length === 0) return null;
                  const maxOver = Math.max(...inningsBalls.map(b => b.overNum), 0);
                  return (
                    <div key={inningsNum} style={{ display: 'flex', gap: '12px' }}>
                      {Array.from({ length: maxOver + 1 }).map((_, overIndex) => {
                        const overBalls = inningsBalls.filter(b => b.overNum === overIndex);
                        if (overBalls.length === 0) return null;
                        return (
                          <div key={overIndex} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--brand-color-action)', fontWeight: 700 }}>
                              Inn {inningsNum} - Over {overIndex + 1}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {overBalls.map((b, bIdx) => (
                                <div key={bIdx} style={{
                                  width: '24px', height: '24px', borderRadius: '50%', 
                                  background: b.wicket ? '#ef4444' : 'var(--brand-color-fill-secondary)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                  fontSize: '9px', fontWeight: 700, border: '1px solid var(--brand-color-border)'
                                }}>
                                  {b.wicket ? 'W' : (b.extraType ? (b.extraType === 'wide' ? 'WD' : 'NB') : b.runs)}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Viewer Dashboard View */}
      {view === 'viewer' && activeMatch && (() => {
        const teamAFirst = activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting') : (activeMatch.config.tossDecision === 'Bowling');
        const battingTeamName = activeMatch.currentInnings === 1 
          ? (teamAFirst ? activeMatch.config.teamAName : activeMatch.config.teamBName)
          : (teamAFirst ? activeMatch.config.teamBName : activeMatch.config.teamAName);
        
        const currentInningsState = activeMatch.currentInnings === 1 ? activeMatch.firstInnings : activeMatch.secondInnings;
        const totalBallsLimit = activeMatch.config.oversLimit * 6;
        const ballsRemaining = Math.max(0, totalBallsLimit - currentInningsState.ballsBowled);
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
              <div className="live-badge" style={{ marginBottom: '12px', background: 'rgba(24,86,255,0.1)', color: 'var(--brand-color-action)', border: '1px solid rgba(24,86,255,0.2)' }}>Live Updates</div>
              <h2 style={{ margin: '0 0 4px 0' }}>{activeMatch.config.teamAName} vs {activeMatch.config.teamBName}</h2>
              <div style={{ fontSize: '13px', color: 'var(--brand-color-action)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                🏏 Batting: {battingTeamName}
              </div>

              <div style={{ fontSize: '42px', fontWeight: 800, margin: '8px 0', color: 'var(--brand-color-text)' }}>
                {currentInningsState.runs} / {currentInningsState.wickets}
              </div>
              
              <div style={{ color: 'var(--brand-color-text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                Overs: {Math.floor(currentInningsState.ballsBowled / 6)}.{currentInningsState.ballsBowled % 6} / {activeMatch.config.oversLimit}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--brand-color-text-secondary)' }}>
                  Balls Remaining: <strong>{ballsRemaining}</strong>
                </span>

                {activeMatch.currentInnings === 2 && (
                  <span style={{ fontSize: '14px', color: 'var(--brand-color-action)', fontWeight: 600 }}>
                    Target: {activeMatch.firstInnings.runs + 1} ({activeMatch.firstInnings.runs + 1 - activeMatch.secondInnings.runs} runs needed from {ballsRemaining} balls)
                  </span>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    await fetchMatches();
                  }}
                  style={{
                    marginTop: '12px',
                    width: '100%',
                    background: 'var(--brand-color-action-bg)',
                    border: '1px solid var(--brand-color-action)',
                    color: 'var(--brand-color-action)',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '8px 16px',
                    borderRadius: '8px'
                  }}
                >
                  Refresh Score
                </button>
              </div>
            </div>

            {/* Match Replay Timeline */}
            {activeMatch && activeMatch.ballsLog.length > 0 && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Match Replay Timeline (Scroll ↔)
                </div>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                  {[1, 2].map((inningsNum) => {
                    const inningsBalls = activeMatch.ballsLog.filter(b => b.innings === inningsNum);
                    if (inningsBalls.length === 0) return null;
                    const maxOver = Math.max(...inningsBalls.map(b => b.overNum), 0);
                    return (
                      <div key={inningsNum} style={{ display: 'flex', gap: '12px' }}>
                        {Array.from({ length: maxOver + 1 }).map((_, overIndex) => {
                          const overBalls = inningsBalls.filter(b => b.overNum === overIndex);
                          if (overBalls.length === 0) return null;
                          return (
                            <div key={overIndex} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                              <div style={{ fontSize: '10px', color: 'var(--brand-color-action)', fontWeight: 700 }}>
                                Inn {inningsNum} - Over {overIndex + 1}
                              </div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {overBalls.map((b, bIdx) => (
                                  <div key={bIdx} style={{
                                    width: '24px', height: '24px', borderRadius: '50%', 
                                    background: b.wicket ? '#ef4444' : 'var(--brand-color-fill-secondary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    fontSize: '9px', fontWeight: 700, border: '1px solid var(--brand-color-border)'
                                  }}>
                                    {b.wicket ? 'W' : (b.extraType ? (b.extraType === 'wide' ? 'WD' : 'NB') : b.runs)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progressive Live Match Report */}
            {activeMatch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ margin: '8px 0 0 0', fontSize: '16px', fontWeight: 700, textAlign: 'center' }}>Live Match Scorecard Report</h3>
                
                {/* First Innings Scorecard */}
                {Object.keys(activeMatch.firstInnings.batsmenStats).length > 0 && (
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--brand-color-action)' }}>
                      {activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAName : activeMatch.config.teamBName) : (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamBName : activeMatch.config.teamAName)} Innings
                    </h4>
                    
                    {/* Batsmen Table */}
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                        <span>Batsman</span>
                        <span style={{ textAlign: 'center' }}>R</span>
                        <span style={{ textAlign: 'center' }}>B</span>
                        <span style={{ textAlign: 'center' }}>4s</span>
                        <span style={{ textAlign: 'center' }}>6s</span>
                        <span style={{ textAlign: 'right' }}>SR</span>
                      </div>
                      {Object.entries(activeMatch.firstInnings.batsmenStats)
                        .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0)
                        .map(([name, stat]: [string, any]) => (
                          <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700 }}>{stat.runs}</span>
                            <span style={{ textAlign: 'center' }}>{stat.balls}</span>
                            <span style={{ textAlign: 'center' }}>{stat.fours}</span>
                            <span style={{ textAlign: 'center' }}>{stat.sixes}</span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 100).toFixed(1) : '0.0'}</span>
                          </div>
                        ))}
                    </div>

                    {/* Bowlers Table */}
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                        <span>Bowler</span>
                        <span style={{ textAlign: 'center' }}>O</span>
                        <span style={{ textAlign: 'center' }}>R</span>
                        <span style={{ textAlign: 'center' }}>W</span>
                        <span style={{ textAlign: 'right' }}>Econ</span>
                      </div>
                      {Object.entries(activeMatch.firstInnings.bowlerStats)
                        .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0 || stat.wickets > 0)
                        .map(([name, stat]: [string, any]) => (
                          <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                            <span style={{ textAlign: 'center' }}>{stat.overs}</span>
                            <span style={{ textAlign: 'center' }}>{stat.runs}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-color-action)' }}>{stat.wickets}</span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 6).toFixed(2) : '0.00'}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Second Innings Scorecard */}
                {activeMatch.currentInnings === 2 && Object.keys(activeMatch.secondInnings.batsmenStats).length > 0 && (
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--brand-color-action)' }}>
                      {activeMatch.config.tossWinner === 'Team A' ? (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamBName : activeMatch.config.teamAName) : (activeMatch.config.tossDecision === 'Batting' ? activeMatch.config.teamAName : activeMatch.config.teamBName)} Innings
                    </h4>
                    
                    {/* Batsmen Table */}
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                        <span>Batsman</span>
                        <span style={{ textAlign: 'center' }}>R</span>
                        <span style={{ textAlign: 'center' }}>B</span>
                        <span style={{ textAlign: 'center' }}>4s</span>
                        <span style={{ textAlign: 'center' }}>6s</span>
                        <span style={{ textAlign: 'right' }}>SR</span>
                      </div>
                      {Object.entries(activeMatch.secondInnings.batsmenStats)
                        .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0)
                        .map(([name, stat]: [string, any]) => (
                          <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700 }}>{stat.runs}</span>
                            <span style={{ textAlign: 'center' }}>{stat.balls}</span>
                            <span style={{ textAlign: 'center' }}>{stat.fours}</span>
                            <span style={{ textAlign: 'center' }}>{stat.sixes}</span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 100).toFixed(1) : '0.0'}</span>
                          </div>
                        ))}
                    </div>

                    {/* Bowlers Table */}
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                        <span>Bowler</span>
                        <span style={{ textAlign: 'center' }}>O</span>
                        <span style={{ textAlign: 'center' }}>R</span>
                        <span style={{ textAlign: 'center' }}>W</span>
                        <span style={{ textAlign: 'right' }}>Econ</span>
                      </div>
                      {Object.entries(activeMatch.secondInnings.bowlerStats)
                        .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0 || stat.wickets > 0)
                        .map(([name, stat]: [string, any]) => (
                          <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                            <span style={{ textAlign: 'center' }}>{stat.overs}</span>
                            <span style={{ textAlign: 'center' }}>{stat.runs}</span>
                            <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-color-action)' }}>{stat.wickets}</span>
                            <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 6).toFixed(2) : '0.00'}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
              <div key={m.id} id={`match-card-container-${m.id}`} className="glass-panel" style={{ padding: '16px', background: 'var(--brand-color-panel-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'Date Unknown'}</span>
                  <span>{m.config.oversLimit} Overs ({m.status})</span>
                </div>
                {(() => {
                  const teamAFirst = m.config.tossWinner === 'Team A' ? (m.config.tossDecision === 'Batting') : (m.config.tossDecision === 'Bowling');
                  const firstBattingTeamName = teamAFirst ? m.config.teamAName : m.config.teamBName;
                  const secondBattingTeamName = teamAFirst ? m.config.teamBName : m.config.teamAName;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px' }}>
                      <span>{firstBattingTeamName} ({m.firstInnings.runs}/{m.firstInnings.wickets})</span>
                      <span>vs</span>
                      <span>{secondBattingTeamName} ({m.secondInnings.runs}/{m.secondInnings.wickets})</span>
                    </div>
                  );
                })()}
                {m.winner ? (
                  <div style={{ fontSize: '12px', color: 'var(--brand-color-link)', fontWeight: 600, marginBottom: '6px' }}>
                    🏆 Winner: {m.winner}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '6px' }}>
                    Match Status: {m.status}
                  </div>
                )}

                {m.config.recordingMode === 'advanced' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <button
                      onClick={() => {
                        const nextSet = new Set(expandedMatchIds);
                        if (nextSet.has(m.id)) {
                          nextSet.delete(m.id);
                        } else {
                          nextSet.add(m.id);
                        }
                        setExpandedMatchIds(nextSet);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--brand-color-text-secondary)',
                        fontSize: '11px',
                        padding: '4px 8px'
                      }}
                    >
                      {expandedMatchIds.has(m.id) ? 'Hide Details' : 'Details'}
                    </button>

                    <button
                      onClick={async () => {
                        // Expand details first so they are rendered in the DOM
                        const nextSet = new Set(expandedMatchIds);
                        nextSet.add(m.id);
                        setExpandedMatchIds(nextSet);

                        // Wait for DOM update
                        setTimeout(async () => {
                          const element = document.getElementById(`match-card-container-${m.id}`);
                          if (!element) return;
                          
                          try {
                            const canvas = await html2canvas(element, {
                              backgroundColor: '#090d16',
                              scale: 2, // higher resolution
                              logging: false,
                              useCORS: true
                            });

                            canvas.toBlob(async (blob) => {
                              if (!blob) return;
                              const file = new File([blob], `${m.config.teamAName}-vs-${m.config.teamBName}-report.png`, { type: 'image/png' });
                              
                              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                try {
                                  await navigator.share({
                                    files: [file],
                                    title: 'Match Report Snapshot',
                                    text: `${m.config.teamAName} vs ${m.config.teamBName} Detailed Match Report Card.`
                                  });
                                } catch (shareError) {
                                  console.log('Share canceled or failed, downloading instead...', shareError);
                                  // download fallback
                                  const link = document.createElement('a');
                                  link.download = `${m.config.teamAName}-vs-${m.config.teamBName}-report.png`;
                                  link.href = canvas.toDataURL('image/png');
                                  link.click();
                                }
                              } else {
                                // download fallback
                                const link = document.createElement('a');
                                link.download = `${m.config.teamAName}-vs-${m.config.teamBName}-report.png`;
                                link.href = canvas.toDataURL('image/png');
                                link.click();
                              }
                            }, 'image/png');
                          } catch (err) {
                            console.error('Failed to capture match card canvas screenshot:', err);
                          }
                        }, 250);
                      }}
                      style={{
                        background: 'var(--brand-color-action-bg)',
                        border: '1px solid var(--brand-color-action)',
                        color: 'var(--brand-color-action)',
                        fontSize: '11px',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Share2 size={11} /> Share Report
                    </button>
                  </div>
                )}

                {m.config.recordingMode === 'advanced' && expandedMatchIds.has(m.id) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '10px' }}>
                        {/* First Innings Summary Card */}
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--brand-color-action)' }}>
                            {m.config.tossWinner === 'Team A' ? (m.config.tossDecision === 'Batting' ? m.config.teamAName : m.config.teamBName) : (m.config.tossDecision === 'Batting' ? m.config.teamBName : m.config.teamAName)} Innings
                          </h4>
                          
                          {/* Batsmen Stats Table */}
                          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                              <span>Batsman</span>
                              <span style={{ textAlign: 'center' }}>R</span>
                              <span style={{ textAlign: 'center' }}>B</span>
                              <span style={{ textAlign: 'center' }}>4s</span>
                              <span style={{ textAlign: 'center' }}>6s</span>
                              <span style={{ textAlign: 'right' }}>SR</span>
                            </div>
                            {Object.entries(m.firstInnings.batsmenStats)
                              .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0)
                              .map(([name, stat]: [string, any]) => (
                                <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                  <span style={{ textAlign: 'center', fontWeight: 700 }}>{stat.runs}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.balls}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.fours}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.sixes}</span>
                                  <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 100).toFixed(1) : '0.0'}</span>
                                </div>
                              ))}
                          </div>

                          {/* Bowlers Stats Table */}
                          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                              <span>Bowler</span>
                              <span style={{ textAlign: 'center' }}>O</span>
                              <span style={{ textAlign: 'center' }}>R</span>
                              <span style={{ textAlign: 'center' }}>W</span>
                              <span style={{ textAlign: 'right' }}>Econ</span>
                            </div>
                            {Object.entries(m.firstInnings.bowlerStats)
                              .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0 || stat.wickets > 0)
                              .map(([name, stat]: [string, any]) => (
                                <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.overs}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.runs}</span>
                                  <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-color-action)' }}>{stat.wickets}</span>
                                  <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 6).toFixed(2) : '0.00'}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Second Innings Summary Card */}
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--brand-color-action)' }}>
                            {m.config.tossWinner === 'Team A' ? (m.config.tossDecision === 'Batting' ? m.config.teamBName : m.config.teamAName) : (m.config.tossDecision === 'Batting' ? m.config.teamAName : m.config.teamBName)} Innings
                          </h4>
                          
                          {/* Batsmen Stats Table */}
                          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                              <span>Batsman</span>
                              <span style={{ textAlign: 'center' }}>R</span>
                              <span style={{ textAlign: 'center' }}>B</span>
                              <span style={{ textAlign: 'center' }}>4s</span>
                              <span style={{ textAlign: 'center' }}>6s</span>
                              <span style={{ textAlign: 'right' }}>SR</span>
                            </div>
                            {Object.entries(m.secondInnings.batsmenStats)
                              .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0)
                              .map(([name, stat]: [string, any]) => (
                                <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                  <span style={{ textAlign: 'center', fontWeight: 700 }}>{stat.runs}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.balls}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.fours}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.sixes}</span>
                                  <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 100).toFixed(1) : '0.0'}</span>
                                </div>
                              ))}
                          </div>

                          {/* Bowlers Stats Table */}
                          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', color: 'var(--brand-color-text-secondary)' }}>
                              <span>Bowler</span>
                              <span style={{ textAlign: 'center' }}>O</span>
                              <span style={{ textAlign: 'center' }}>R</span>
                              <span style={{ textAlign: 'center' }}>W</span>
                              <span style={{ textAlign: 'right' }}>Econ</span>
                            </div>
                            {Object.entries(m.secondInnings.bowlerStats)
                              .filter(([_, stat]: [string, any]) => stat.balls > 0 || stat.runs > 0 || stat.wickets > 0)
                              .map(([name, stat]: [string, any]) => (
                                <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.overs}</span>
                                  <span style={{ textAlign: 'center' }}>{stat.runs}</span>
                                  <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-color-action)' }}>{stat.wickets}</span>
                                  <span style={{ textAlign: 'right', fontFamily: 'var(--brand-font-family-code)' }}>{stat.balls > 0 ? ((stat.runs / stat.balls) * 6).toFixed(2) : '0.00'}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

      {/* Teams and Members management tab */}
      {view === 'teams' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, width: '100%', maxWidth: '440px', margin: '0 auto' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Teams & Members</h2>
          
          {/* Create new Team Section */}
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--brand-color-action)' }}>Create Team</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Team Name (e.g. Royals)"
                value={newTeamNameInput}
                onChange={(e) => setNewTeamNameInput(e.target.value)}
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const btn = document.getElementById('createTeamSubmitBtn');
                    if (btn) btn.click();
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                id="createTeamSubmitBtn"
                onClick={async () => {
                  const name = newTeamNameInput.trim();
                  if (!name) return;
                  if (teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
                    alert("A team with this name already exists!");
                    return;
                  }
                  const updatedTeams = [...teams, { name, players: [] }];
                  setTeams(updatedTeams);
                  await saveLocalTeams(updatedTeams);
                  setNewTeamNameInput('');
                  // dismiss keyboard on mobile by blurring the input element
                  const inp = document.activeElement as HTMLElement;
                  if (inp) inp.blur();
                  alert(`Team "${name}" created successfully!`);
                }}
                style={{ background: 'var(--brand-color-action)', border: 'none', color: '#fff', padding: '0 16px', fontWeight: 700 }}
              >
                Create
              </button>
            </div>
          </div>

          {/* List existing teams and allow adding members to them */}
          {teams.length === 0 ? (
            <div className="glass-card" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              No teams created yet. Use the panel above to add one.
            </div>
          ) : (
            teams.map((t, idx) => (
              <div key={t.name} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '16px' }}>{t.name}</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Are you sure you want to delete team ${t.name}?`)) {
                        const updatedTeams = teams.filter(item => item.name !== t.name);
                        setTeams(updatedTeams);
                        await saveLocalTeams(updatedTeams);
                      }
                    }}
                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '4px 8px', fontSize: '11px' }}
                  >
                    Delete
                  </button>
                </div>

                {/* Add new member inputs */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    id={`team-player-input-${idx}`}
                    placeholder="Player Name"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const btn = document.getElementById(`team-player-submit-btn-${idx}`);
                        if (btn) btn.click();
                      }
                    }}
                    style={{ flex: 1, padding: '8px' }}
                  />
                  <button
                    id={`team-player-submit-btn-${idx}`}
                    onClick={async () => {
                      const input = document.getElementById(`team-player-input-${idx}`) as HTMLInputElement;
                      const pName = input?.value?.trim();
                      if (!pName) return;
                      if (t.players.includes(pName)) {
                        alert("Player is already in this team!");
                        return;
                      }
                      
                      // Update Supabase players catalog if not already there
                      if (supabase && !dbPlayers.includes(pName)) {
                        try {
                          await supabase.from('players').insert([{ name: pName }]);
                          setDbPlayers(prev => [...prev, pName]);
                        } catch (e) { console.error(e); }
                      } else if (!dbPlayers.includes(pName)) {
                        setDbPlayers(prev => [...prev, pName]);
                      }

                      const updatedTeams = [...teams];
                      updatedTeams[idx].players.push(pName);
                      setTeams(updatedTeams);
                      await saveLocalTeams(updatedTeams);
                      input.value = '';
                      input.blur(); // dismiss keyboard on success
                    }}
                    style={{ background: 'var(--brand-color-action-bg)', border: '1px solid var(--brand-color-action)', color: 'var(--brand-color-action)', padding: '0 12px', fontSize: '12px' }}
                  >
                    Add
                  </button>
                </div>

                {/* List players in team */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {t.players.length === 0 ? (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>No players in this team yet.</span>
                  ) : (
                    t.players.map((player) => (
                      <span
                        key={player}
                        style={{
                          fontSize: '11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          padding: '4px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        {player}
                        <span
                          onClick={async () => {
                            const updatedTeams = [...teams];
                            updatedTeams[idx].players = updatedTeams[idx].players.filter(p => p !== player);
                            setTeams(updatedTeams);
                            await saveLocalTeams(updatedTeams);
                          }}
                          style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', padding: '0 2px' }}
                          title="Remove player"
                        >
                          ×
                        </span>
                      </span>
                    ))
                  )}
                </div>

                {/* Teams Stats Badging Subpanel */}
                {(() => {
                  const advancedMatches = matches.filter(m => m.status === 'completed' && m.config.recordingMode === 'advanced');
                  
                  let teamMatchesPlayed = 0;
                  let teamMatchesWon = 0;
                  let teamRunsScored = 0;
                  let teamWicketsTaken = 0;
                  let teamBoundariesHit = 0;

                  advancedMatches.forEach(m => {
                    const isTeamA = m.config.teamAName.toLowerCase() === t.name.toLowerCase();
                    const isTeamB = m.config.teamBName.toLowerCase() === t.name.toLowerCase();
                    
                    if (isTeamA || isTeamB) {
                      teamMatchesPlayed += 1;
                      if (m.winner && m.winner.toLowerCase() === t.name.toLowerCase()) {
                        teamMatchesWon += 1;
                      }

                      // Check which team batted in which innings
                      const teamAFirst = m.config.tossWinner === 'Team A' ? (m.config.tossDecision === 'Batting') : (m.config.tossDecision === 'Bowling');
                      
                      // Identify which innings belongs to our team 't'
                      const isTeamFirstBatting = (isTeamA && teamAFirst) || (isTeamB && !teamAFirst);
                      
                      const statsToSum = isTeamFirstBatting ? m.firstInnings : m.secondInnings;
                      const statsOpponent = isTeamFirstBatting ? m.secondInnings : m.firstInnings;
                      
                      // sum runs scored
                      teamRunsScored += statsToSum.runs;
                      // wickets taken is wickets fallen in opponent innings
                      teamWicketsTaken += statsOpponent.wickets;

                      // sum boundaries
                      Object.values(statsToSum.batsmenStats).forEach((batsman: any) => {
                        teamBoundariesHit += (batsman.fours || 0) + (batsman.sixes || 0);
                      });
                    }
                  });

                  const totalXP = (teamRunsScored * 5) + (teamBoundariesHit * 10) + (teamWicketsTaken * 50) + (teamMatchesPlayed * 100) + (teamMatchesWon * 200);
                  
                  let teamLevel = 1;
                  let teamLevelName = 'Rookie Squad';
                  let nextThreshold = 2000;
                  let prevThreshold = 0;

                  if (totalXP >= 20000) {
                    teamLevel = 5;
                    teamLevelName = 'Invincible Giants';
                    nextThreshold = 20000;
                    prevThreshold = 20000;
                  } else if (totalXP >= 10000) {
                    teamLevel = 4;
                    teamLevelName = 'Championship Contenders';
                    nextThreshold = 20000;
                    prevThreshold = 10000;
                  } else if (totalXP >= 5000) {
                    teamLevel = 3;
                    teamLevelName = 'Powerhouse';
                    nextThreshold = 10000;
                    prevThreshold = 5000;
                  } else if (totalXP >= 2000) {
                    teamLevel = 2;
                    teamLevelName = 'Rising Syndicate';
                    nextThreshold = 5000;
                    prevThreshold = 2000;
                  }

                  const getBadgeColor = (val: number, bronze: number, silver: number, gold: number) => {
                    if (val >= gold) return '#fbbf24';
                    if (val >= silver) return '#cbd5e1';
                    if (val >= bronze) return '#b45309';
                    return null;
                  };

                  const getBadgeText = (val: number, bronze: number, silver: number, gold: number) => {
                    if (val >= gold) return 'Gold';
                    if (val >= silver) return 'Silver';
                    if (val >= bronze) return 'Bronze';
                    return 'Locked';
                  };

                  const runColor = getBadgeColor(teamRunsScored, 500, 1500, 3000);
                  const runText = getBadgeText(teamRunsScored, 500, 1500, 3000);
                  const wicketColor = getBadgeColor(teamWicketsTaken, 20, 60, 120);
                  const wicketText = getBadgeText(teamWicketsTaken, 20, 60, 120);
                  const boundaryColor = getBadgeColor(teamBoundariesHit, 50, 150, 300);
                  const boundaryText = getBadgeText(teamBoundariesHit, 50, 150, 300);
                  const winColor = getBadgeColor(teamMatchesWon, 3, 10, 20);
                  const winText = getBadgeText(teamMatchesWon, 3, 10, 20);

                  // Show locked badges for teams with 0 matches instead of hiding them completely
                  const pct = teamLevel === 5 ? 100 : Math.min(100, Math.max(0, ((totalXP - prevThreshold) / (nextThreshold - prevThreshold)) * 100));

                  return (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-color-action)' }}>{teamLevelName}</span>
                        <span style={{ fontSize: '11px', background: 'var(--brand-color-action-bg)', color: 'var(--brand-color-action)', padding: '2px 6px', borderRadius: '6px', fontWeight: 700 }}>
                          Lvl {teamLevel}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--brand-color-text-secondary)' }}>
                          <span>XP: {totalXP}</span>
                          {teamLevel < 5 && <span>Next: {nextThreshold} XP</span>}
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--brand-color-fill-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)', borderRadius: '4px' }} />
                        </div>
                      </div>

                      {/* Team Badges layout styled like Player Profile badges */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                        <div 
                          onClick={() => {
                            const tid = `team-${t.name}-runs`;
                            setActiveTooltipId(activeTooltipId === tid ? null : tid);
                          }}
                          style={{ 
                            display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                            background: runColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', 
                            border: activeTooltipId === `team-${t.name}-runs` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)', 
                            opacity: runColor ? 1 : 0.4,
                            cursor: 'pointer'
                          }}
                          title={`Batter's Blitz: Milestone runs scored as a team. Current runs: ${teamRunsScored}. (Bronze: 500, Silver: 1500, Gold: 3000)`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={14} style={{ stroke: runColor || '#7e7e7e' }} />
                            <span style={{ fontSize: '10px', fontWeight: 600 }}>Batter's Blitz: {runText}</span>
                          </div>
                          {activeTooltipId === `team-${t.name}-runs` && (
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                              Runs: {teamRunsScored} (Bronze: 500, Silver: 1500, Gold: 3000)
                            </div>
                          )}
                        </div>

                        <div 
                          onClick={() => {
                            const tid = `team-${t.name}-wickets`;
                            setActiveTooltipId(activeTooltipId === tid ? null : tid);
                          }}
                          style={{ 
                            display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                            background: wicketColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', 
                            border: activeTooltipId === `team-${t.name}-wickets` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)', 
                            opacity: wicketColor ? 1 : 0.4,
                            cursor: 'pointer'
                          }}
                          title={`Wicket Wizard: Milestone wickets taken as a team. Current wickets: ${teamWicketsTaken}. (Bronze: 20, Silver: 60, Gold: 120)`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Target size={14} style={{ stroke: wicketColor || '#7e7e7e' }} />
                            <span style={{ fontSize: '10px', fontWeight: 600 }}>Wicket Wizard: {wicketText}</span>
                          </div>
                          {activeTooltipId === `team-${t.name}-wickets` && (
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                              Wickets: {teamWicketsTaken} (Bronze: 20, Silver: 60, Gold: 120)
                            </div>
                          )}
                        </div>

                        <div 
                          onClick={() => {
                            const tid = `team-${t.name}-boundaries`;
                            setActiveTooltipId(activeTooltipId === tid ? null : tid);
                          }}
                          style={{ 
                            display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                            background: boundaryColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', 
                            border: activeTooltipId === `team-${t.name}-boundaries` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)', 
                            opacity: boundaryColor ? 1 : 0.4,
                            cursor: 'pointer'
                          }}
                          title={`Speed Demon: Boundaries hit by team batsmen. Current: ${teamBoundariesHit}. (Bronze: 50, Silver: 150, Gold: 300)`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Award size={14} style={{ stroke: boundaryColor || '#7e7e7e' }} />
                            <span style={{ fontSize: '10px', fontWeight: 600 }}>Speed Demon: {boundaryText}</span>
                          </div>
                          {activeTooltipId === `team-${t.name}-boundaries` && (
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                              Boundaries: {teamBoundariesHit} (Bronze: 50, Silver: 150, Gold: 300)
                            </div>
                          )}
                        </div>

                        <div 
                          onClick={() => {
                            const tid = `team-${t.name}-wins`;
                            setActiveTooltipId(activeTooltipId === tid ? null : tid);
                          }}
                          style={{ 
                            display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                            background: winColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', 
                            border: activeTooltipId === `team-${t.name}-wins` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)', 
                            opacity: winColor ? 1 : 0.4,
                            cursor: 'pointer'
                          }}
                          title={`Winner's Circle: Total matches won by team. Current wins: ${teamMatchesWon}. (Bronze: 3, Silver: 10, Gold: 20)`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Trophy size={14} style={{ stroke: winColor || '#7e7e7e' }} />
                            <span style={{ fontSize: '10px', fontWeight: 600 }}>Winner's Circle: {winText}</span>
                          </div>
                          {activeTooltipId === `team-${t.name}-wins` && (
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                              Wins: {teamMatchesWon} (Bronze: 3, Silver: 10, Gold: 20)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      )}

      {/* Players Dashboard View (Gamification) */}
      {view === 'players' && (() => {
        const advancedMatches = matches.filter(m => m.status === 'completed' && m.config.recordingMode === 'advanced');
        const playerStats: Record<string, {
          runs: number;
          balls: number;
          fours: number;
          sixes: number;
          overs: number;
          wickets: number;
          matchesPlayed: number;
          matchesWon: number;
          matchDates: string[];
        }> = {};

        dbPlayers.forEach(name => {
          playerStats[name] = { runs: 0, balls: 0, fours: 0, sixes: 0, overs: 0, wickets: 0, matchesPlayed: 0, matchesWon: 0, matchDates: [] };
        });

        advancedMatches.forEach(m => {
          const matchDate = m.createdAt || new Date().toISOString();
          [m.firstInnings, m.secondInnings].forEach(inn => {
            Object.entries(inn.batsmenStats).forEach(([name, stat]) => {
              if (!playerStats[name]) {
                playerStats[name] = { runs: 0, balls: 0, fours: 0, sixes: 0, overs: 0, wickets: 0, matchesPlayed: 0, matchesWon: 0, matchDates: [] };
              }
              playerStats[name].runs += stat.runs;
              playerStats[name].balls += stat.balls;
              playerStats[name].fours += stat.fours;
              playerStats[name].sixes += stat.sixes;
            });
            Object.entries(inn.bowlerStats).forEach(([name, stat]) => {
              if (!playerStats[name]) {
                playerStats[name] = { runs: 0, balls: 0, fours: 0, sixes: 0, overs: 0, wickets: 0, matchesPlayed: 0, matchesWon: 0, matchDates: [] };
              }
              playerStats[name].overs += stat.overs;
              playerStats[name].wickets += stat.wickets;
            });
          });

          // Build set of players who actually batted or bowled in this match
          const activeParticipants = new Set<string>();
          [m.firstInnings, m.secondInnings].forEach(inn => {
            Object.keys(inn.batsmenStats).forEach(name => activeParticipants.add(name));
            Object.keys(inn.bowlerStats).forEach(name => activeParticipants.add(name));
          });
          // Also include the roster players
          const allPlayersInMatch = Array.from(new Set([...m.config.teamAPlayers, ...m.config.teamBPlayers, ...activeParticipants]));

          allPlayersInMatch.forEach(name => {
            if (!playerStats[name]) {
              playerStats[name] = { runs: 0, balls: 0, fours: 0, sixes: 0, overs: 0, wickets: 0, matchesPlayed: 0, matchesWon: 0, matchDates: [] };
            }
            playerStats[name].matchesPlayed += 1;
            playerStats[name].matchDates.push(matchDate);
            
            // Check if player was on the winning team in this match
            // A player is on the winning team if they are in the winning team's roster
            const teamANameLower = m.config.teamAName.toLowerCase();
            const teamBNameLower = m.config.teamBName.toLowerCase();
            const matchWinnerLower = m.winner ? m.winner.toLowerCase() : '';

            if (matchWinnerLower) {
              let isWinner = false;

              // Check if player is explicitly listed in the winning team's roster config snapshot
              if (matchWinnerLower === teamANameLower && m.config.teamAPlayers.includes(name)) {
                isWinner = true;
              } else if (matchWinnerLower === teamBNameLower && m.config.teamBPlayers.includes(name)) {
                isWinner = true;
              }

              if (isWinner) {
                playerStats[name].matchesWon += 1;
              }
            }
          });
        });

        const playersList = Object.entries(playerStats).map(([name, stat]) => {
          const boundaryCount = stat.fours + stat.sixes;
          const totalXP = (stat.runs * 10) + (boundaryCount * 15) + (stat.wickets * 100) + (stat.matchesPlayed * 200) + (stat.matchesWon * 300);
          
          let level = 1;
          let levelName = 'Rookie';
          let nextThreshold = 1000;
          let prevThreshold = 0;
          
          if (totalXP >= 10000) {
            level = 5;
            levelName = 'Cricket Legend';
            nextThreshold = 10000;
            prevThreshold = 10000;
          } else if (totalXP >= 5000) {
            level = 4;
            levelName = 'Elite Competitor';
            nextThreshold = 10000;
            prevThreshold = 5000;
          } else if (totalXP >= 2500) {
            level = 3;
            levelName = 'Rising Star';
            nextThreshold = 5000;
            prevThreshold = 2500;
          } else if (totalXP >= 1000) {
            level = 2;
            levelName = 'Scrappy Batsman';
            nextThreshold = 2500;
            prevThreshold = 1000;
          }

          let isConsistent = false;
          if (stat.matchDates.length > 0) {
            const sortedDates = stat.matchDates.map(d => new Date(d).getTime()).sort((a, b) => b - a);
            const now = Date.now();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            const playedLastWeek = (now - sortedDates[0]) <= sevenDaysInMs;
            
            if (playedLastWeek) {
              isConsistent = true;
              for (let i = 0; i < sortedDates.length - 1; i++) {
                if ((sortedDates[i] - sortedDates[i + 1]) > sevenDaysInMs) {
                  isConsistent = false;
                  break;
                }
              }
            }
          }

          return {
            name,
            stat,
            boundaryCount,
            totalXP,
            level,
            levelName,
            prevThreshold,
            nextThreshold,
            isConsistent
          };
        });

        playersList.sort((a, b) => {
          let valA = 0;
          let valB = 0;

          if (playerSortKey === 'xp') {
            valA = a.totalXP;
            valB = b.totalXP;
          } else if (playerSortKey === 'badges') {
            const countUnlocked = (statObj: typeof a.stat, boundary: number) => {
              let count = 0;
              if (statObj.runs >= 100) count++;
              if (statObj.wickets >= 5) count++;
              if (boundary >= 10) count++;
              if (statObj.matchesPlayed >= 5) count++;
              if (statObj.matchesWon >= 2) count++;
              return count;
            };
            valA = countUnlocked(a.stat, a.boundaryCount);
            valB = countUnlocked(b.stat, b.boundaryCount);
          } else if (playerSortKey === 'batter') {
            valA = a.stat.runs;
            valB = b.stat.runs;
          } else if (playerSortKey === 'bowler') {
            valA = a.stat.wickets;
            valB = b.stat.wickets;
          } else if (playerSortKey === 'speed') {
            valA = a.boundaryCount;
            valB = b.boundaryCount;
          } else if (playerSortKey === 'match') {
            valA = a.stat.matchesPlayed;
            valB = b.stat.matchesPlayed;
          } else if (playerSortKey === 'win') {
            valA = a.stat.matchesWon;
            valB = b.stat.matchesWon;
          }

          return playerSortOrder === 'asc' ? valA - valB : valB - valA;
        });

        const filteredPlayers = playersList.filter(p => 
          p.name.toLowerCase().includes(playerSearchQuery.toLowerCase())
        );

        const getBadgeColor = (val: number, bronze: number, silver: number, gold: number) => {
          if (val >= gold) return '#fbbf24';
          if (val >= silver) return '#cbd5e1';
          if (val >= bronze) return '#b45309';
          return null;
        };

        const getBadgeText = (val: number, bronze: number, silver: number, gold: number) => {
          if (val >= gold) return 'Gold';
          if (val >= silver) return 'Silver';
          if (val >= bronze) return 'Bronze';
          return 'Locked';
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '440px', margin: '0 auto' }}>
            <h2 style={{ margin: '0 0 4px 0', textAlign: 'center', width: '100%' }}>Player Profiles</h2>
            
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', boxSizing: 'border-box' }}>
              <input
                type="text"
                placeholder="Search players by name..."
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '14px',
                  borderRadius: 'var(--brand-border-radius-sm)',
                  border: '1px solid var(--brand-color-border)',
                  background: 'var(--brand-color-fill-secondary)',
                  color: 'var(--brand-color-text)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div className="glass-panel" style={{ width: '100%', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Tap Icon to Sort Profiles</span>
                <select 
                  value={playerSortOrder} 
                  onChange={(e) => setPlayerSortOrder(e.target.value as any)}
                  style={{ padding: '4px 8px', fontSize: '11px', height: '28px', width: '110px' }}
                >
                  <option value="desc">High ➔ Low</option>
                  <option value="asc">Low ➔ High</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', width: '100%' }}>
                <button 
                  onClick={() => setPlayerSortKey('xp')}
                  style={{ 
                    flex: 1, padding: '8px 0', fontSize: '11px', 
                    background: playerSortKey === 'xp' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'xp' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Total XP"
                >
                  XP
                </button>

                <button 
                  onClick={() => setPlayerSortKey('badges')}
                  style={{ 
                    flex: 1, padding: '8px 0', fontSize: '11px', 
                    background: playerSortKey === 'badges' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'badges' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Unlocked Badges count"
                >
                  Badges
                </button>

                <button 
                  onClick={() => setPlayerSortKey('batter')}
                  style={{ 
                    padding: '8px 10px', 
                    background: playerSortKey === 'batter' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'batter' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Batter's Blitz (Runs)"
                >
                  <Zap size={14} style={{ stroke: playerSortKey === 'batter' ? 'var(--brand-color-action)' : '#94a3b8' }} />
                </button>

                <button 
                  onClick={() => setPlayerSortKey('bowler')}
                  style={{ 
                    padding: '8px 10px', 
                    background: playerSortKey === 'bowler' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'bowler' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Wicket Wizard (Wickets)"
                >
                  <Target size={14} style={{ stroke: playerSortKey === 'bowler' ? 'var(--brand-color-action)' : '#94a3b8' }} />
                </button>

                <button 
                  onClick={() => setPlayerSortKey('speed')}
                  style={{ 
                    padding: '8px 10px', 
                    background: playerSortKey === 'speed' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'speed' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Speed Demon (Boundaries)"
                >
                  <Award size={14} style={{ stroke: playerSortKey === 'speed' ? 'var(--brand-color-action)' : '#94a3b8' }} />
                </button>

                <button 
                  onClick={() => setPlayerSortKey('match')}
                  style={{ 
                    padding: '8px 10px', 
                    background: playerSortKey === 'match' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'match' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Match Master (Matches)"
                >
                  <Play size={14} style={{ stroke: playerSortKey === 'match' ? 'var(--brand-color-action)' : '#94a3b8' }} />
                </button>

                <button 
                  onClick={() => setPlayerSortKey('win')}
                  style={{ 
                    padding: '8px 10px', 
                    background: playerSortKey === 'win' ? 'var(--brand-color-action-bg)' : 'transparent',
                    border: playerSortKey === 'win' ? '1px solid var(--brand-color-action)' : '1px solid var(--brand-color-border)'
                  }}
                  title="Sort by Winner's Circle (Wins)"
                >
                  <Trophy size={14} style={{ stroke: playerSortKey === 'win' ? 'var(--brand-color-action)' : '#94a3b8' }} />
                </button>
              </div>
            </div>

            {filteredPlayers.length === 0 ? (
              <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', width: '100%' }}>
                {playerSearchQuery ? 'No players match your search query.' : 'No players onboarded yet.'}
              </div>
            ) : (
              filteredPlayers.map(({ name, stat, boundaryCount, totalXP, level, levelName, prevThreshold, nextThreshold, isConsistent }) => {
                const percentToNextLevel = level === 5 ? 100 : Math.min(100, Math.max(0, ((totalXP - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
                const runColor = getBadgeColor(stat.runs, 100, 500, 1000);
                const runText = getBadgeText(stat.runs, 100, 500, 1000);
                const wicketColor = getBadgeColor(stat.wickets, 5, 20, 50);
                const wicketText = getBadgeText(stat.wickets, 5, 20, 50);
                const speedColor = getBadgeColor(boundaryCount, 10, 50, 100);
                const speedText = getBadgeText(boundaryCount, 10, 50, 100);
                const matchColor = getBadgeColor(stat.matchesPlayed, 5, 15, 30);
                const matchText = getBadgeText(stat.matchesPlayed, 5, 15, 30);
                const winColor = getBadgeColor(stat.matchesWon, 2, 5, 10);
                const winText = getBadgeText(stat.matchesWon, 2, 5, 10);

                return (
                  <div key={name} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '16px' }}>{name}</span>
                      <span style={{ fontSize: '11px', background: 'var(--brand-color-action-bg)', color: 'var(--brand-color-action)', padding: '4px 8px', borderRadius: '8px', fontWeight: 700 }}>
                        Lvl {level} ({levelName})
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--brand-color-text-secondary)' }}>
                        <span>XP: {totalXP}</span>
                        {level < 5 && <span>Next: {nextThreshold} XP</span>}
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--brand-color-fill-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${percentToNextLevel}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand-color-action) 0%, var(--brand-color-action-hover) 100%)', borderRadius: '4px' }} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <div 
                        onClick={() => {
                          const tid = `player-${name}-streak`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: isConsistent ? 'rgba(24,86,255,0.1)' : 'rgba(255,255,255,0.03)', 
                          border: activeTooltipId === `player-${name}-streak` ? '1px solid var(--brand-color-action)' : (isConsistent ? '1px solid rgba(24,86,255,0.2)' : '1px solid rgba(255,255,255,0.05)'),
                          opacity: isConsistent ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title="Consistent Player streak: Play at least 1 match every week (7 days) without missing."
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Flame size={14} style={{ stroke: isConsistent ? 'var(--brand-color-action)' : '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Consistent Streak</span>
                        </div>
                        {activeTooltipId === `player-${name}-streak` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Play at least 1 match every week.
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => {
                          const tid = `player-${name}-runs`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: runColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          border: activeTooltipId === `player-${name}-runs` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)',
                          opacity: runColor ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title={`Batter's Blitz: Total runs scored. Current runs: ${stat.runs}. (Bronze: 100, Silver: 500, Gold: 1000)`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Zap size={14} style={{ stroke: runColor || '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Batter's Blitz: {runText}</span>
                        </div>
                        {activeTooltipId === `player-${name}-runs` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Runs: {stat.runs} (Bronze: 100, Silver: 500, Gold: 1000)
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => {
                          const tid = `player-${name}-wickets`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: wicketColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          border: activeTooltipId === `player-${name}-wickets` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)',
                          opacity: wicketColor ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title={`Wicket Wizard: Career wickets taken. Current wickets: ${stat.wickets}. (Bronze: 5, Silver: 20, Gold: 50)`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Target size={14} style={{ stroke: wicketColor || '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Wicket Wizard: {wicketText}</span>
                        </div>
                        {activeTooltipId === `player-${name}-wickets` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Wickets: {stat.wickets} (Bronze: 5, Silver: 20, Gold: 50)
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => {
                          const tid = `player-${name}-boundaries`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: speedColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          border: activeTooltipId === `player-${name}-boundaries` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)',
                          opacity: speedColor ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title={`Speed Demon: Total boundaries hit (4s + 6s). Current: ${boundaryCount}. (Bronze: 10, Silver: 50, Gold: 100)`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Award size={14} style={{ stroke: speedColor || '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Speed Demon: {speedText}</span>
                        </div>
                        {activeTooltipId === `player-${name}-boundaries` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Boundaries: {boundaryCount} (Bronze: 10, Silver: 50, Gold: 100)
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => {
                          const tid = `player-${name}-matches`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: matchColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          border: activeTooltipId === `player-${name}-matches` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)',
                          opacity: matchColor ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title={`Match Master: Roster matches completed. Current matches: ${stat.matchesPlayed}. (Bronze: 5, Silver: 15, Gold: 30)`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Play size={14} style={{ stroke: matchColor || '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Match Master: {matchText}</span>
                        </div>
                        {activeTooltipId === `player-${name}-matches` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Matches: {stat.matchesPlayed} (Bronze: 5, Silver: 15, Gold: 30)
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => {
                          const tid = `player-${name}-wins`;
                          setActiveTooltipId(activeTooltipId === tid ? null : tid);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 10px', borderRadius: '6px', 
                          background: winColor ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          border: activeTooltipId === `player-${name}-wins` ? '1px solid var(--brand-color-action)' : '1px solid rgba(255,255,255,0.05)',
                          opacity: winColor ? 1 : 0.4,
                          cursor: 'pointer'
                        }}
                        title={`Winner's Circle: Total matches won. Current wins: ${stat.matchesWon}. (Bronze: 2, Silver: 5, Gold: 10)`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Trophy size={14} style={{ stroke: winColor || '#7e7e7e' }} />
                          <span style={{ fontSize: '10px', fontWeight: 600 }}>Winner's Circle: {winText}</span>
                        </div>
                        {activeTooltipId === `player-${name}-wins` && (
                          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2px' }}>
                            Wins: {stat.matchesWon} (Bronze: 2, Silver: 5, Gold: 10)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {modalType === 'wide' 
                      ? 'Additional Runs (e.g. byes/runs run, excluding implicit 1 wide):' 
                      : 'Additional Runs (excluding implicit 1 no ball):'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => setModalInputVal(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)))}
                      style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      -
                    </button>
                    <div style={{ 
                      flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
                      fontSize: '18px', fontWeight: 700 
                    }}>
                      {modalInputVal}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setModalInputVal(prev => String((parseInt(prev) || 0) + 1))}
                      style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                      +
                    </button>
                  </div>
                </div>
                {modalType === 'noball' && (
                  <div>
                    <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Runs Type:</label>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="nbRunsSource" 
                          checked={!modalBoolVal} 
                          onChange={() => setModalBoolVal(false)} 
                          style={{ width: '16px', height: '16px' }} 
                        /> Off the Bat
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="nbRunsSource" 
                          checked={modalBoolVal} 
                          onChange={() => setModalBoolVal(true)} 
                          style={{ width: '16px', height: '16px' }} 
                        /> Byes / Leg Byes
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {modalType === 'wicket' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>Completed Runs:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => setModalInputVal(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)))}
                      style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      -
                    </button>
                    <div style={{ 
                      flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
                      fontSize: '18px', fontWeight: 700 
                    }}>
                      {modalInputVal}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setModalInputVal(prev => String((parseInt(prev) || 0) + 1))}
                      style={{ width: '48px', height: '48px', padding: 0, fontSize: '22px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={modalBoolVal}
                    onChange={(e) => setModalBoolVal(e.target.checked)}
                    id="modalRunoutCheck"
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label 
                    htmlFor="modalRunoutCheck"
                    style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  >
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

            {modalType === 'selectBowler' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>Select Bowler:</label>
                <select
                  value={modalSelectedPlayer}
                  onChange={(e) => setModalSelectedPlayer(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px' }}
                >
                  {modalPlayersList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {modalType === 'selectBatsman' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>Select New Batsman:</label>
                <select
                  value={modalSelectedPlayer}
                  onChange={(e) => setModalSelectedPlayer(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}
                >
                  {modalPlayersList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <label style={{ fontSize: '12px', color: '#94a3b8' }}>Assign Role As:</label>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="batsmanRoleAssign"
                      checked={modalSelectedRole === 'striker'}
                      onChange={() => setModalSelectedRole('striker')}
                      style={{ width: '16px', height: '16px' }}
                    /> Striker
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="batsmanRoleAssign"
                      checked={modalSelectedRole === 'nonstriker'}
                      onChange={() => setModalSelectedRole('nonstriker')}
                      style={{ width: '16px', height: '16px' }}
                    /> Non-Striker
                  </label>
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
                      modalOnConfirm({
                        runs: parseInt(modalInputVal) || 0,
                        isByes: modalBoolVal
                      });
                    } else if (modalType === 'selectBowler') {
                      modalOnConfirm({
                        bowler: modalSelectedPlayer
                      });
                    } else if (modalType === 'selectBatsman') {
                      modalOnConfirm({
                        batsman: modalSelectedPlayer,
                        role: modalSelectedRole
                      });
                    } else {
                      modalOnConfirm();
                    }
                  }
                }}
                style={{ flex: 1, background: 'linear-gradient(135deg, var(--brand-color-link) 0%, var(--brand-color-link-hover) 100%)', border: 'none', fontWeight: 700 }}
              >
                Confirm
              </button>
            </div>
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
                style={{ flex: 1, background: 'var(--brand-color-fill-secondary)', border: '1px solid var(--brand-color-border)' }}
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
                style={{ flex: 1, background: 'linear-gradient(135deg, var(--brand-color-link) 0%, var(--brand-color-link-hover) 100%)', border: 'none', fontWeight: 700 }}
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
          <SportShoe size={18} style={{ stroke: 'var(--brand-color-text-secondary)' }} />
        </button>
      </footer>
    </div>
  );
}
