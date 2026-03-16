"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Trophy,
  Activity,
  History as HistoryIcon,
  Settings,
  AlertCircle,
  ChevronRight,
  Clock,
  BarChart3,
  Search,
  Bell,
  BellRing,
  X,
  CheckCircle2,
  XCircle,
  Trash2,
  Filter
} from "lucide-react";

interface Toast {
  id: string;
  title: string;
  message: string;
  type: "success" | "info" | "warning" | "error";
}

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

interface ToastHistoryItem {
  id: number;
  timestamp: string;
  title: string;
  message: string;
  fixture_id?: number;
  match_name?: string;
  type: string;
}

interface TrackedMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  conditions: Array<{ stat: string; target: number; team: string }>;
  notifiedConditions?: Set<string>; // Track which conditions have been notified
}

// Custom hook for browser notifications
function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setIsSupported(false);
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }, [isSupported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!isSupported || permission !== "granted") return false;
    new Notification(title, {
      icon: "/favicon.ico",
      ...options,
    });
    return true;
  }, [isSupported, permission]);

  return { permission, isSupported, requestPermission, sendNotification };
}

export default function Home() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [allLiveData, setAllLiveData] = useState<Record<number, LiveData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "history" | "track">("live");
  const [historyFilter, setHistoryFilter] = useState<"all" | "met" | "unmet">("all");

  // Track Matches State
  const [trackedMatches, setTrackedMatches] = useState<TrackedMatch[]>([]);
  const [newTrackForm, setNewTrackForm] = useState<{
    fixtureId: number | null;
    conditions: Array<{ stat: string; target: number | ""; team: string }>;
  }>({
    fixtureId: null,
    conditions: [{ stat: "Corners", target: "", team: "Home" }]
  });

  // Notification State
  const { permission, isSupported, requestPermission, sendNotification } = useBrowserNotifications();
  const notifiedConditionsRef = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastHistory, setToastHistory] = useState<ToastHistoryItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((title: string, message: string, type: "success" | "info" | "warning" | "error" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  const API_BASE = "http://localhost:5000";

  // Fetch toast history - defined early for use in useEffect
  const fetchToastHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setToastHistory(data.response);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, []);

  // Log history notification to server - defined early for use in useEffect
  const logToastToServer = useCallback(async (title: string, message: string, fixtureId?: number, matchName?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          message,
          fixture_id: fixtureId,
          match_name: matchName,
        }),
      });
      if (!res.ok) throw new Error("Failed to log history");
      // Refresh history after logging
      fetchToastHistory();
    } catch (err) {
      console.error("Failed to log history to server:", err);
    }
  }, [fetchToastHistory]);

  // Delete history notification from server
  const deleteToastNotification = useCallback(async (notificationId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/history/${notificationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete notification");
      // Refresh history after deletion
      fetchToastHistory();
      // Show success toast
      addToast("Notification Deleted", "The notification has been removed from history.", "info");
    } catch (err) {
      console.error("Failed to delete notification:", err);
      addToast("Error", "Failed to delete notification. Please try again.", "error");
    }
  }, [fetchToastHistory, addToast]);

  // Clear all history notifications from server (respects current filter)
  const clearAllToastNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history?filter=${historyFilter}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear all notifications");
      // Refresh history after clearing
      fetchToastHistory();
      // Show success toast based on filter
      const filterMessages: Record<string, string> = {
        all: "All notifications have been removed from history.",
        met: "All 'Conditions Met' notifications have been removed from history.",
        unmet: "All 'Conditions Not Met' notifications have been removed from history.",
      };
      addToast("History Cleared", filterMessages[historyFilter] || "Notifications have been removed from history.", "success");
    } catch (err) {
      console.error("Failed to clear all notifications:", err);
      addToast("Error", "Failed to clear all notifications. Please try again.", "error");
    }
  }, [fetchToastHistory, addToast, historyFilter]);

  useEffect(() => {
    fetchFixtures();
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

  // Check for notification triggers when live data updates
  useEffect(() => {
    if (trackedMatches.length === 0 || Object.keys(allLiveData).length === 0) return;

    trackedMatches.forEach((match) => {
      const liveData = allLiveData[match.fixtureId];
      if (!liveData || !liveData.response) return;

      const homeStats = liveData.response[0];
      const awayStats = liveData.response[1];
      const elapsed = liveData.elapsed;

      // Track how many conditions are met for THIS match
      let metConditionsCount = 0;
      const conditionDetails: string[] = [];

      match.conditions.forEach((condition) => {
        const teamStats = condition.team === "Home" ? homeStats : awayStats;
        const statValue = teamStats.statistics.find((s: Stat) => s.type === condition.stat)?.value ?? 0;

        if (statValue >= condition.target) {
          metConditionsCount++;
          // Use target value (snapshot) instead of live value to preserve state at notification time
          conditionDetails.push(`${condition.team} ${condition.stat}: ${condition.target}`);
        }
      });

      // If ALL conditions are met for this match
      if (metConditionsCount === match.conditions.length && metConditionsCount > 0) {
        const matchKey = `match-${match.fixtureId}-all-met`;

        // Only notify once for "all met" state per match
        if (!notifiedConditionsRef.current.has(matchKey)) {
          const title = `🏆 Match Alert: All Conditions Met!`;
          const message = `${match.homeTeam} vs ${match.awayTeam}\n${conditionDetails.join(", ")} at ${elapsed}'`;

          // Send browser notification
          sendNotification(title, { body: message, tag: matchKey });

          // Show in-app toast
          addToast(title, message, "success");

          // Log to server for history
          logToastToServer(title, message, match.fixtureId, `${match.homeTeam} vs ${match.awayTeam}`);

          // Mark as notified
          notifiedConditionsRef.current.add(matchKey);
        }
      }

      // Check if AT LEAST ONE condition is NOT met (for error notification)
      const unmetConditions: string[] = [];
      match.conditions.forEach((condition) => {
        const teamStats = condition.team === "Home" ? homeStats : awayStats;
        const statValue = teamStats.statistics.find((s: Stat) => s.type === condition.stat)?.value ?? 0;

        if (statValue < condition.target) {
          unmetConditions.push(`${condition.team} ${condition.stat}: ${statValue} (target: ${condition.target})`);
        }
      });

      // If at least one condition is NOT met, send error notification ONLY at full time
      if (unmetConditions.length > 0 && elapsed >= 90) {
        const unmetKey = `match-${match.fixtureId}-unmet`;

        // Only notify once for "conditions not met" state per match
        if (!notifiedConditionsRef.current.has(unmetKey)) {
          const title = `⚠️ Match Alert: Conditions Not Met`;
          const message = `${match.homeTeam} vs ${match.awayTeam}\n${unmetConditions.join(", ")} at ${elapsed}'`;

          // Send browser notification
          sendNotification(title, { body: message, tag: unmetKey });

          // Show in-app toast with error type (red color)
          addToast(title, message, "error");

          // Log to server for history
          logToastToServer(title, message, match.fixtureId, `${match.homeTeam} vs ${match.awayTeam}`);

          // Mark as notified
          notifiedConditionsRef.current.add(unmetKey);
        }
      }

      // Also keep individual condition background notifications if needed, 
      // but the user specifically asked for "all conditions met" toast.
      match.conditions.forEach((condition) => {
        const conditionKey = `${match.fixtureId}-${condition.team}-${condition.stat}-${condition.target}`;

        // Skip if already notified for this condition
        if (notifiedConditionsRef.current.has(conditionKey)) return;

        const teamStats = condition.team === "Home" ? homeStats : awayStats;
        const statValue = teamStats.statistics.find((s: Stat) => s.type === condition.stat)?.value ?? 0;

        if (statValue >= condition.target) {
          // Condition met - send browser notification (silent, no toast here as per request for "all conditions")
          const teamName = condition.team === "Home" ? match.homeTeam : match.awayTeam;
          const title = `🚨 Stat Alert: ${teamName}`;
          // Use target value (snapshot) instead of live value to preserve state at notification time
          const body = `${condition.stat} reached target: ${condition.target} at ${elapsed}'`;

          sendNotification(title, {
            body,
            tag: conditionKey,
            requireInteraction: false,
          });

          // Mark as notified
          notifiedConditionsRef.current.add(conditionKey);
        }
      });
    });
  }, [allLiveData, trackedMatches, sendNotification, addToast, logToastToServer]);

  // Fetch toast history periodically when on history tab
  useEffect(() => {
    if (activeTab === "history") {
      fetchToastHistory();
      const interval = setInterval(() => {
        fetchToastHistory();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchToastHistory]);

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

    const newMatch: TrackedMatch = {
      fixtureId: fixture.fixture_id,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      conditions: validConditions as Array<{ stat: string; target: number; team: string }>,
    };

    setTrackedMatches([...trackedMatches, newMatch]);

    // Reset form
    setNewTrackForm({
      fixtureId: null,
      conditions: [{ stat: "Corners", target: "", team: "Home" }]
    });

    // Request notification permission if not already granted
    if (permission !== "granted") {
      requestPermission();
    }
  };

  const handleRemoveTrackedMatch = (index: number) => {
    const match = trackedMatches[index];
    // Clear notified conditions for this match
    match.conditions.forEach((condition) => {
      const conditionKey = `${match.fixtureId}-${condition.team}-${condition.stat}-${condition.target}`;
      notifiedConditionsRef.current.delete(conditionKey);
    });
    setTrackedMatches(trackedMatches.filter((_, i) => i !== index));
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
          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            {isSupported && (
              <button
                onClick={requestPermission}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                  permission === "granted"
                    ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    : permission === "denied"
                    ? "bg-red-600/20 text-red-400"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                }`}
                title={
                  permission === "granted"
                    ? "Notifications enabled"
                    : permission === "denied"
                    ? "Notifications blocked"
                    : "Click to enable notifications"
                }
                disabled={permission === "denied"}
              >
                {permission === "granted" ? (
                  <>
                    <BellRing className="h-4 w-4" />
                    <span className="text-sm font-medium hidden sm:inline">Notifications On</span>
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    <span className="text-sm font-medium hidden sm:inline">
                      {permission === "denied" ? "Blocked" : "Enable Alerts"}
                    </span>
                  </>
                )}
              </button>
            )}
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
                  {trackedMatches.map((match, idx) => {
                    const liveData = allLiveData[match.fixtureId];
                    const homeStats = liveData?.response?.[0];
                    const awayStats = liveData?.response?.[1];

                    // Check if all conditions met
                    const allMet = match.conditions.every((c) => {
                      const teamStats = c.team === "Home" ? homeStats : awayStats;
                      const currentValue = teamStats?.statistics.find((s: Stat) => s.type === c.stat)?.value ?? 0;
                      return currentValue >= c.target;
                    }) && match.conditions.length > 0;

                    return (
                      <div key={idx} className={`bg-gray-900 border rounded-xl p-4 transition-all ${allMet ? "border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]" : "border-gray-800"}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex flex-col">
                            <div className="font-bold">{match.homeTeam} vs {match.awayTeam}</div>
                            {allMet && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase mt-1">
                                <Trophy className="h-3 w-3" /> All Conditions Met
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveTrackedMatch(idx)}
                            className="p-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                            title="Stop tracking"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="space-y-2 text-sm">
                          {match.conditions.map((c, cIdx) => {
                            const teamStats = c.team === "Home" ? homeStats : awayStats;
                            const currentValue = teamStats?.statistics.find((s: Stat) => s.type === c.stat)?.value ?? 0;
                            const isMet = currentValue >= c.target;
                            const conditionKey = `${match.fixtureId}-${c.team}-${c.stat}-${c.target}`;
                            const wasNotified = notifiedConditionsRef.current.has(conditionKey);

                            return (
                              <div
                                key={cIdx}
                                className={`flex items-center justify-between p-2 rounded ${
                                  isMet
                                    ? wasNotified
                                      ? "bg-green-600/20 border border-green-600/30"
                                      : "bg-yellow-600/20 border border-yellow-600/30"
                                    : "bg-gray-800"
                                }`}
                              >
                                <span className={isMet ? "text-white" : "text-gray-400"}>
                                  {c.team} {c.stat} ≥ {c.target}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono ${isMet ? "text-green-400 font-bold" : "text-gray-500"}`}>
                                    {currentValue}
                                  </span>
                                  {wasNotified && (
                                    <BellRing className="h-3 w-3 text-green-400" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
          /* History Tab - Notification History Only */
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BellRing className="h-6 w-6 text-blue-500" />
                Notification History
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as "all" | "met" | "unmet")}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Notifications</option>
                    <option value="met">Conditions Met</option>
                    <option value="unmet">Conditions Not Met</option>
                  </select>
                </div>
                <div className="text-sm text-gray-500">{toastHistory.length} alerts recorded</div>
                {toastHistory.length > 0 && (
                  <button
                    onClick={clearAllToastNotifications}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all"
                    title="Clear all notifications"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {toastHistory.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {toastHistory.slice().reverse().filter(toast => {
                  if (historyFilter === "all") return true;
                  const isError = toast.title.includes("Not Met") || toast.message.includes("Not Met");
                  return historyFilter === "unmet" ? isError : !isError;
                }).map((toast) => {
                  // Determine if this is an error notification (conditions not met)
                  const isError = toast.title.includes("Not Met") || toast.message.includes("Not Met");
                  return (
                    <div key={toast.id} className={`bg-gray-900 border rounded-2xl overflow-hidden shadow-lg ${
                      isError ? "border-red-500/30" : "border-green-500/30"
                    }`}>
                      <div className={`px-6 py-4 border-b flex justify-between items-center ${
                        isError ? "bg-red-900/20 border-red-500/30" : "bg-green-900/20 border-green-500/30"
                      }`}>
                        <div className="flex items-center gap-3">
                          {isError ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          )}
                          <span className={`font-bold ${isError ? "text-red-400" : "text-green-400"}`}>
                            {isError ? "Conditions Not Met!" : "All Conditions Met!"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            {new Date(toast.timestamp).toLocaleString()}
                          </span>
                          <button
                            onClick={() => deleteToastNotification(toast.id)}
                            className={`p-1.5 rounded-lg transition-all ${
                              isError
                                ? "hover:bg-red-600/30 text-red-400"
                                : "hover:bg-green-600/30 text-green-400"
                            }`}
                            title="Delete notification"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="font-bold text-lg mb-2">{toast.match_name}</div>
                        <div className="text-sm text-gray-400 whitespace-pre-line">{toast.message}</div>
                        {toast.fixture_id && (
                          <div className="mt-4 text-xs text-gray-500">
                            Fixture #{toast.fixture_id}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="min-h-[400px] flex flex-col items-center justify-center text-gray-500 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
                <BellRing className="h-12 w-12 mb-4 opacity-20" />
                <p>No notifications yet</p>
                <p className="text-sm text-gray-600 mt-1">Track a match and wait for conditions to be checked!</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-6 text-center text-gray-600 text-sm border-t border-gray-900 mt-12">
        Football Alert CLI &copy; 2026 - Modern Local Dashboard
      </footer>

      {/* Toast Notifications Container */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-80">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl animate-in slide-in-from-right duration-300 ${
              toast.type === "success"
                ? "bg-green-900/90 border-green-500 text-white"
                : toast.type === "warning"
                ? "bg-yellow-900/90 border-yellow-500 text-white"
                : toast.type === "error"
                ? "bg-red-900/90 border-red-500 text-white"
                : "bg-blue-900/90 border-blue-500 text-white"
            }`}
          >
            <div className="mt-0.5">
              {toast.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : toast.type === "warning" ? (
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              ) : toast.type === "error" ? (
                <XCircle className="h-5 w-5 text-red-400" />
              ) : (
                <BellRing className="h-5 w-5 text-blue-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm mb-0.5">{toast.title}</div>
              <div className="text-xs opacity-90 whitespace-pre-line">{toast.message}</div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="mt-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
