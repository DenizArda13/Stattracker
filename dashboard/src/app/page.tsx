"use client";

import { useEffect, useState } from "react";
import { 
  Trophy, 
  Activity, 
  History as HistoryIcon, 
  Settings, 
  AlertCircle,
  ChevronRight,
  Clock,
  BarChart3,
  Search
} from "lucide-react";

interface Fixture {
  fixture_id: number;
  home_team: string;
  away_team: string;
}

interface Stat {
  type: string;
  value: number;
}

interface TeamStats {
  team: { name: string };
  statistics: Stat[];
}

interface LiveData {
  response: TeamStats[];
  elapsed: number;
}

interface HistorySession {
  timestamp: string;
  fixtures: Array<{
    fixture_id: number;
    status: string;
    conditions: Array<{
      team: string;
      stat: string;
      target: number;
    }>;
    final_stats: Record<string, number>;
    alert_minute: number | null;
  }>;
}

export default function Home() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [allLiveData, setAllLiveData] = useState<Record<number, LiveData>>({});
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "history" | "track">("live");

  // Track Matches State
  const [trackedMatches, setTrackedMatches] = useState<Array<{
    fixtureId: number;
    homeTeam: string;
    awayTeam: string;
    conditions: Array<{ stat: string; target: number; team: string }>;
  }>>([]);
  const [newTrackForm, setNewTrackForm] = useState<{
    fixtureId: number | null;
    conditions: Array<{ stat: string; target: number | ""; team: string }>;
  }>({
    fixtureId: null,
    conditions: [{ stat: "Corners", target: "", team: "Home" }]
  });

  const API_BASE = "http://localhost:5000";

  useEffect(() => {
    fetchFixtures();
    fetchHistory();
  }, []);

  // Fetch live stats for ALL fixtures continuously in the background
  useEffect(() => {
    if (fixtures.length === 0) return;

    // Fetch all fixtures immediately
    fixtures.forEach(fixture => {
      fetchLiveStats(fixture.fixture_id);
    });

    // Then set up interval for continuous updates
    const interval = setInterval(() => {
      fixtures.forEach(fixture => {
        fetchLiveStats(fixture.fixture_id);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [fixtures]);

  // Fetch history periodically when on history tab
  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
      const interval = setInterval(() => {
        fetchHistory();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const fetchFixtures = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/fixtures`);
      if (!res.ok) throw new Error("Could not connect to mock server");
      const data = await res.json();
      setFixtures(data.response);
      if (data.response.length > 0 && !selectedFixtureId) {
        setSelectedFixtureId(data.response[0].fixture_id);
      }
      setLoading(false);
    } catch (err) {
      setError("Mock server not running. Please start it with 'python -m football_alert.mock_server' and ensure it's accessible at http://localhost:5000");
      setLoading(false);
    }
  };

  const fetchLiveStats = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/fixtures/statistics?fixture=${id}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setAllLiveData(prev => ({
        ...prev,
        [id]: data
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setHistory(data.response);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddCondition = () => {
    setNewTrackForm({
      ...newTrackForm,
      conditions: [...newTrackForm.conditions, { stat: "Corners", target: "", team: "Home" }]
    });
  };

  const handleRemoveCondition = (index: number) => {
    const updatedConditions = newTrackForm.conditions.filter((_, i) => i !== index);
    setNewTrackForm({ ...newTrackForm, conditions: updatedConditions });
  };

  const handleConditionChange = (index: number, field: string, value: string | number) => {
    const updatedConditions = [...newTrackForm.conditions];
    updatedConditions[index] = { ...updatedConditions[index], [field]: value };
    setNewTrackForm({ ...newTrackForm, conditions: updatedConditions });
  };

  const handleTrackMatch = () => {
    if (!newTrackForm.fixtureId) return;
    
    // Validate conditions
    const validConditions = newTrackForm.conditions.filter(c => c.target !== "" && Number(c.target) >= 0);
    if (validConditions.length === 0) return;

    const fixture = fixtures.find(f => f.fixture_id === newTrackForm.fixtureId);
    if (!fixture) return;

    setTrackedMatches([
      ...trackedMatches,
      {
        fixtureId: fixture.fixture_id,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        conditions: validConditions as Array<{ stat: string; target: number; team: string }>
      }
    ]);

    // Reset form
    setNewTrackForm({
      fixtureId: null,
      conditions: [{ stat: "Corners", target: "", team: "Home" }]
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-12 w-12 animate-spin text-blue-500" />
          <p className="text-xl font-medium">Loading Football Alert Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white p-6">
        <div className="max-w-md bg-gray-800 p-8 rounded-2xl border border-red-500/30 text-center shadow-2xl">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button 
            onClick={() => { setLoading(true); fetchFixtures(); }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Football Alert <span className="text-blue-500">Dashboard</span>
            </h1>
          </div>
          <nav className="flex bg-gray-800 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab("live")}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${activeTab === "live" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"}`}
            >
              <Activity className="h-4 w-4" /> Live
            </button>
            <button 
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${activeTab === "history" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"}`}
            >
              <HistoryIcon className="h-4 w-4" /> History
            </button>
            <button 
              onClick={() => setActiveTab("track")}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${activeTab === "track" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"}`}
            >
              <Settings className="h-4 w-4" /> Track
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === "track" ? (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Track Matches</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">Add Match to Track</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Select Match</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                    value={newTrackForm.fixtureId || ""}
                    onChange={(e) => setNewTrackForm({ ...newTrackForm, fixtureId: Number(e.target.value) })}
                  >
                    <option value="">Select a match...</option>
                    {fixtures.map(f => (
                      <option key={f.fixture_id} value={f.fixture_id}>{f.home_team} vs {f.away_team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Conditions</label>
                  {newTrackForm.conditions.map((condition, index) => (
                    <div key={index} className="flex gap-2 items-center mb-2">
                      <select
                        className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white flex-1"
                        value={condition.team}
                        onChange={(e) => handleConditionChange(index, "team", e.target.value)}
                      >
                        <option value="Home">Home</option>
                        <option value="Away">Away</option>
                      </select>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white flex-1"
                        value={condition.stat}
                        onChange={(e) => handleConditionChange(index, "stat", e.target.value)}
                      >
                        <option value="Corners">Corners</option>
                        <option value="Total Shots">Total Shots</option>
                        <option value="Goals">Goals</option>
                        <option value="Shots on Target">Shots on Target</option>
                        <option value="Fouls Committed">Fouls Committed</option>
                        <option value="Offsides">Offsides</option>
                        <option value="Possession %">Possession %</option>
                        <option value="Pass Accuracy %">Pass Accuracy %</option>
                        <option value="Yellow Cards">Yellow Cards</option>
                        <option value="Red Cards">Red Cards</option>
                        <option value="Tackles">Tackles</option>
                        <option value="Interceptions">Interceptions</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Target"
                        className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-24"
                        value={condition.target}
                        onChange={(e) => handleConditionChange(index, "target", e.target.value ? Number(e.target.value) : "")}
                      />
                      {newTrackForm.conditions.length > 1 && (
                        <button
                          onClick={() => handleRemoveCondition(index)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddCondition}
                    className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
                  >
                    + Add Statistic
                  </button>
                </div>

                <button
                  onClick={handleTrackMatch}
                  disabled={!newTrackForm.fixtureId}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all mt-4"
                >
                  Track Match
                </button>
              </div>
            </div>

            {trackedMatches.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold">Currently Tracking</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trackedMatches.map((match, idx) => (
                    <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="font-bold mb-2">{match.homeTeam} vs {match.awayTeam}</div>
                      <div className="space-y-1 text-sm text-gray-400">
                        {match.conditions.map((c, cIdx) => (
                          <div key={cIdx}>• {c.team} {c.stat} ≥ {c.target}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "live" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sidebar: Match Selection */}
            <div className="lg:col-span-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-2">Live Matches</h2>
              <div className="space-y-2">
                {fixtures.map((fixture) => (
                  <button
                    key={fixture.fixture_id}
                    onClick={() => {
                      setSelectedFixtureId(fixture.fixture_id);
                    }}
                    className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between group ${
                      selectedFixtureId === fixture.fixture_id 
                        ? "bg-blue-600/10 border-blue-500 text-white" 
                        : "bg-gray-900 border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs opacity-60 mb-1">Fixture #{fixture.fixture_id}</span>
                      <span className="font-bold">{fixture.home_team} vs {fixture.away_team}</span>
                    </div>
                    <ChevronRight className={`h-5 w-5 transition-transform ${selectedFixtureId === fixture.fixture_id ? "translate-x-1 text-blue-500" : "opacity-0 group-hover:opacity-100"}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content: Stats */}
            <div className="lg:col-span-8 space-y-6">
              {selectedFixtureId && allLiveData[selectedFixtureId] ? (
                (() => {
                  const liveData = allLiveData[selectedFixtureId];
                  const homeGoals = liveData.response[0].statistics.find(s => s.type === "Goals")?.value ?? 0;
                  const awayGoals = liveData.response[1].statistics.find(s => s.type === "Goals")?.value ?? 0;
                  
                  return (
                    <>
                      {/* Scoreboard / Status */}
                      <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-2xl border border-blue-500/20 p-8 shadow-xl">
                        <div className="flex justify-between items-center mb-8">
                          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold animate-pulse">
                            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                            LIVE
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 font-mono">
                            <Clock className="h-4 w-4" />
                            <span className="text-lg">{liveData.elapsed}\'</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-around items-center gap-4">
                          <div className="text-center flex-1">
                            <div className="h-20 w-20 bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow-inner border border-gray-700">
                              {liveData.response[0].team.name.charAt(0)}
                            </div>
                            <h3 className="text-xl font-bold">{liveData.response[0].team.name}</h3>
                            <p className="text-gray-500 text-sm">Home</p>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <div className="text-5xl font-black text-white mb-2">
                              {homeGoals} - {awayGoals}
                            </div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Score</div>
                          </div>
                          
                          <div className="text-center flex-1">
                            <div className="h-20 w-20 bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow-inner border border-gray-700">
                              {liveData.response[1].team.name.charAt(0)}
                            </div>
                            <h3 className="text-xl font-bold">{liveData.response[1].team.name}</h3>
                            <p className="text-gray-500 text-sm">Away</p>
                          </div>
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden p-6 space-y-6">
                        <h4 className="font-bold text-center text-gray-400 mb-6 uppercase tracking-wider text-sm">Match Statistics</h4>
                        <div className="space-y-6">
                          {liveData.response[0].statistics
                            .filter(stat => stat.type !== "Goals")
                            .map((stat, index) => {
                              const homeValue = stat.value;
                              const awayValue = liveData.response[1].statistics.find(s => s.type === stat.type)?.value ?? 0;
                              const total = homeValue + awayValue;
                              const homePercent = total === 0 ? 50 : (homeValue / total) * 100;
                              
                              return (
                                <div key={stat.type} className="space-y-2">
                                  <div className="flex justify-between items-center text-sm font-bold">
                                    <span className="text-blue-400 w-12 text-left">{homeValue}</span>
                                    <span className="text-gray-500 font-normal uppercase text-xs">{stat.type}</span>
                                    <span className="text-emerald-400 w-12 text-right">{awayValue}</span>
                                  </div>
                                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
                                    <div 
                                      style={{ width: `${homePercent}%` }} 
                                      className="bg-blue-500 h-full transition-all duration-500" 
                                    />
                                    <div 
                                      style={{ width: `${100 - homePercent}%` }} 
                                      className="bg-emerald-500 h-full transition-all duration-500" 
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-gray-500 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
                  <Activity className="h-12 w-12 mb-4 opacity-20" />
                  <p>Select a match to see live statistics</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Session History</h2>
              <div className="text-sm text-gray-500">{history.length} sessions recorded</div>
            </div>

            {history.length > 0 ? (
              <div className="space-y-4">
                {history.map((session, idx) => (
                  <div key={idx} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                    <div className="px-6 py-4 bg-gray-800/50 border-b border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <HistoryIcon className="h-5 w-5 text-blue-500" />
                        <span className="font-bold">{new Date(session.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {session.fixtures.map((f, fIdx) => (
                          <div key={fIdx} className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-xs font-bold text-gray-500 uppercase">Fixture #{f.fixture_id}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                f.status === "Alert Triggered" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                              }`}>
                                {f.status}
                              </span>
                            </div>
                            <div className="space-y-2 mb-4">
                              {f.conditions.map((c, cIdx) => (
                                <div key={cIdx} className="text-sm">
                                  <span className="text-gray-400">{c.team}:</span> {c.stat} ≥ {c.target}
                                </div>
                              ))}
                            </div>
                            {f.alert_minute && (
                              <div className="text-xs font-medium text-blue-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Triggered at {f.alert_minute}\'
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-[400px] flex flex-col items-center justify-center text-gray-500 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
                <HistoryIcon className="h-12 w-12 mb-4 opacity-20" />
                <p>No history sessions found</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-6 text-center text-gray-600 text-sm border-t border-gray-900 mt-12">
        Football Alert CLI &copy; 2026 - Modern Local Dashboard
      </footer>
    </div>
  );
}
