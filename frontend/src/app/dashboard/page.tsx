"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";

interface Candidate {
  id: number;
  name: string;
  email: string;
  status: string;
  trust_score: number;
  technical_score: number;
  ai_summary: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Answer {
  id: number;
  question_id: number;
  mcq_answer: string | null;
  coding_submission: string | null;
  is_correct: boolean | null;
  points_earned: number;
  graded_at: string;
}

interface IntegrityEvent {
  id: number;
  event_type: string;
  timestamp: string;
  confidence: number;
  details: string | null;
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [report, setReport] = useState<{
    candidate: Candidate;
    answers: Answer[];
    events: IntegrityEvent[];
  } | null>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

  // 1. Fetch Candidates List
  const fetchCandidates = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
        if (data.length > 0 && selectedId === null) {
          setSelectedId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load candidates", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  // 2. Fetch Selected Candidate Report
  const fetchReport = async (candidateId: number) => {
    setLoadingReport(true);
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${candidateId}/report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error("Failed to load report", err);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (selectedId !== null) {
      fetchReport(selectedId);
    }
  }, [selectedId]);

  // 3. Trigger Claude AI Summary
  const handleGenerateAISummary = async () => {
    if (!selectedId) return;
    setGeneratingAI(true);
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${selectedId}/ai-summary`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        // Update local report with the summary
        setReport((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            candidate: {
              ...prev.candidate,
              ai_summary: data.summary,
            },
          };
        });
        // Refresh candidates list to update summary icon/status
        fetchCandidates();
      }
    } catch (err) {
      console.error("Failed to generate AI summary", err);
    } finally {
      setGeneratingAI(false);
    }
  };

  // Helper: Format Date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " " + d.toLocaleDateString();
  };

  // Helper: Trust Score Colors
  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return "text-green-signal border-green-signal/20 bg-green-signal/5";
    if (score >= 50) return "text-amber-signal border-amber-signal/20 bg-amber-signal/5";
    return "text-red-signal border-red-signal/20 bg-red-signal/5";
  };

  const getTrustBadgeBg = (score: number) => {
    if (score >= 80) return "bg-green-signal";
    if (score >= 50) return "bg-amber-signal";
    return "bg-red-signal";
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <span>IntegrityProctor</span>
            <span className="text-xs bg-slate-800 text-cyan-signal border border-slate-700 px-2 py-0.5 rounded font-mono font-normal">
              HR AUDIT CONTROL CENTRE
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Review candidate compliance flags, technical scoring performance, and AI proctoring summary verdicts.
          </p>
        </div>

        <button
          onClick={fetchCandidates}
          className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs px-4.5 py-2 rounded transition cursor-pointer font-mono text-slate-300 hover:text-white"
        >
          Refresh Feed
        </button>
      </header>

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Candidates List */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 select-none">
            <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
              Candidate Queue ({candidates.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
            {loadingList ? (
              <div className="text-center text-slate-500 font-mono text-xs py-8">Loading queue logs...</div>
            ) : candidates.length === 0 ? (
              <div className="text-center text-slate-600 font-mono text-xs py-12">No candidate logs found.</div>
            ) : (
              candidates.map((cand) => {
                const isActive = selectedId === cand.id;
                return (
                  <button
                    key={cand.id}
                    onClick={() => setSelectedId(cand.id)}
                    className={`w-full text-left p-4 transition flex flex-col space-y-2 cursor-pointer ${
                      isActive ? "bg-slate-900 border-l-2 border-cyan-signal" : "hover:bg-slate-900/50"
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="font-bold text-white text-sm truncate max-w-[150px]">{cand.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                        cand.status === "completed" ? "bg-green-signal/10 text-green-signal" : "bg-amber-signal/10 text-amber-signal"
                      }`}>
                        {cand.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                      <span>Tech Score: {cand.technical_score}%</span>
                      <div className="flex items-center space-x-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${getTrustBadgeBg(cand.trust_score)}`}></span>
                        <span>Trust: {cand.trust_score}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Side: Selected Candidate Report */}
        <main className="flex-1 bg-slate-950 flex flex-col overflow-hidden">
          {loadingReport ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center space-y-4">
                <span className="h-8 w-8 border-4 border-cyan-signal border-t-transparent rounded-full animate-spin"></span>
                <p className="font-mono text-slate-400 text-sm">Decoding proctored telemetry report...</p>
              </div>
            </div>
          ) : !report ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-sm">
              Select a candidate from the queue to view audit reports.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Report Header Profile */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-white">{report.candidate.name}</h2>
                  <p className="text-sm font-mono text-slate-400 mt-1">{report.candidate.email}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs font-mono text-slate-500">
                    <span>Created: {formatDate(report.candidate.created_at)}</span>
                    {report.candidate.started_at && (
                      <span>Started: {formatDate(report.candidate.started_at)}</span>
                    )}
                    {report.candidate.completed_at && (
                      <span>Finished: {formatDate(report.candidate.completed_at)}</span>
                    )}
                  </div>
                </div>

                {/* Score Indicators */}
                <div className="flex gap-4">
                  {/* Trust Score */}
                  <div className={`border rounded-lg px-4 py-2.5 flex flex-col items-center min-w-[100px] ${getTrustScoreColor(report.candidate.trust_score)}`}>
                    <span className="text-[9px] font-mono uppercase tracking-widest font-bold opacity-60">Trust Score</span>
                    <span className="text-2xl font-bold font-mono mt-0.5">{report.candidate.trust_score}</span>
                  </div>

                  {/* Tech Score */}
                  <div className="border border-slate-800 bg-slate-900/60 rounded-lg px-4 py-2.5 flex flex-col items-center min-w-[100px] text-cyan-signal">
                    <span className="text-[9px] font-mono uppercase tracking-widest font-bold opacity-60 text-slate-400">Tech Score</span>
                    <span className="text-2xl font-bold font-mono mt-0.5">{report.candidate.technical_score}%</span>
                  </div>
                </div>
              </div>

              {/* Grid: AI Summary + Integrity Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Panel 1: Claude AI Summary */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col h-[400px]">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 select-none">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                      AI Proctoring Intelligence Report
                    </span>
                    <span className="text-[9px] bg-cyan-signal/15 text-cyan-signal font-mono font-bold px-2 py-0.5 rounded border border-cyan-signal/20">
                      CLAUDE-3.5-SONNET
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 text-sm leading-relaxed text-slate-300 font-sans whitespace-pre-wrap">
                    {report.candidate.ai_summary ? (
                      report.candidate.ai_summary
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                        <p className="text-xs text-slate-500 font-mono">
                          No intelligence assessment generated for this candidate session logs.
                        </p>
                        <button
                          onClick={handleGenerateAISummary}
                          disabled={generatingAI}
                          className="bg-cyan-signal hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs px-4 py-2 rounded transition cursor-pointer disabled:opacity-50"
                        >
                          {generatingAI ? "Analyzing Events Logs..." : "Run AI Proctor Evaluation"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Panel 2: Integrity Event Timeline Logs */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col h-[400px]">
                  <div className="border-b border-slate-800 pb-3 mb-4 select-none">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                      Integrity Incident Telemetry Logs ({report.events.length})
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
                    {report.events.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
                        Pristine exam integrity. No flags triggered.
                      </div>
                    ) : (
                      report.events.map((event) => (
                        <div key={event.id} className="border-l-2 border-amber-signal pl-4 py-1">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                              {event.event_type.replace("_", " ")}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {event.details || "No secondary metadata logged."}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Performance / Code Submissions */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-4 select-none">
                  Assessment Answer Responses
                </h3>

                <div className="space-y-6">
                  {report.answers.length === 0 ? (
                    <div className="text-slate-500 font-mono text-xs py-4 text-center">
                      No question submissions recorded yet.
                    </div>
                  ) : (
                    report.answers.map((answer, index) => (
                      <div key={answer.id} className="bg-slate-950 border border-slate-850 rounded-lg p-5 space-y-4">
                        
                        {/* Title details */}
                        <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 select-none">
                          <span className="font-mono text-xs font-bold text-white uppercase">
                            Question ID: {answer.question_id}
                          </span>
                          <div className="flex space-x-2 items-center">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              answer.is_correct ? "bg-green-signal/15 text-green-signal border border-green-signal/20" : "bg-red-signal/15 text-red-signal border border-red-signal/20"
                            }`}>
                              {answer.is_correct ? "CORRECT" : "INCORRECT"}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              Points: {answer.points_earned}
                            </span>
                          </div>
                        </div>

                        {/* Submission details */}
                        {answer.mcq_answer ? (
                          <div className="text-sm font-mono text-slate-300">
                            <span className="text-slate-500 mr-2">Selected Answer:</span>
                            <span className="text-white">{answer.mcq_answer}</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-xs font-mono text-slate-500">Code Submitted:</span>
                            <pre className="bg-slate-900 border border-slate-850 rounded-lg p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-60 leading-relaxed">
                              {answer.coding_submission}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
