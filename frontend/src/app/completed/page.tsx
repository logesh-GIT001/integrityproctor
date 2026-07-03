"use client";

import React, { use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CompletedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const candidateId = searchParams.get("id");

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 items-center justify-center px-4 relative overflow-hidden">
      {/* Dynamic scanlines background element */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none opacity-40"></div>
      
      {/* Amber radial glow */}
      <div className="absolute w-[500px] h-[500px] bg-amber-signal/5 blur-[100px] rounded-full top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 relative z-10 shadow-2xl text-center">
        {/* Terminated status banner */}
        <div className="flex items-center justify-center space-x-2 border-b border-slate-800 pb-4 mb-6">
          <span className="h-3 w-3 rounded-full bg-amber-signal"></span>
          <span className="font-mono text-xs tracking-wider text-amber-signal uppercase font-bold">Session Terminated</span>
        </div>

        {/* Checked graphic */}
        <div className="mx-auto w-16 h-16 rounded-full bg-green-signal/15 border border-green-signal/30 flex items-center justify-center text-green-signal text-3xl mb-6">
          ✓
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Assessment Completed</h1>
        <p className="text-slate-400 text-sm mb-6">
          Your answers have been graded and integrity metrics synced to the backend storage.
        </p>

        {/* Metadata Details */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 mb-8 font-mono text-left text-xs space-y-2.5">
          <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold border-b border-slate-800 pb-1 mb-1">
            EXAM TELEMETRY SUMMARY
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Candidate Session ID:</span>
            <span className="text-slate-300 font-bold">{candidateId || "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Grading Status:</span>
            <span className="text-green-signal font-bold">SUCCESS (100% Sync)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Integrity Stream:</span>
            <span className="text-slate-300">DISCONNECTED</span>
          </div>
        </div>

        <div className="space-y-3">
          {/* Quick links to review result */}
          <button
            onClick={() => router.push(`/dashboard`)}
            className="w-full bg-cyan-signal hover:bg-cyan-400 active:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider py-3.5 px-6 rounded-lg text-xs transition cursor-pointer hover:shadow-[0_0_15px_rgba(10,235,255,0.4)]"
          >
            Open Admin/HR Dashboard
          </button>
          
          <button
            onClick={() => router.push("/")}
            className="w-full bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs py-3 rounded-lg border border-slate-700 transition cursor-pointer"
          >
            Register Another Candidate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompletedPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-slate-950 text-slate-400 items-center justify-center font-mono text-sm">
        Syncing exam telemetry...
      </div>
    }>
      <CompletedContent />
    </Suspense>
  );
}
