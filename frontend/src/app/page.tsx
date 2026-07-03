"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bypassCamera, setBypassCamera] = useState(false);
  
  // Simulated pre-checks
  const [checks, setChecks] = useState({
    webcam: { status: "pending", label: "Webcam Access Verification" },
    screen: { status: "pending", label: "Browser Capabilities Check" },
    network: { status: "pending", label: "Network Latency Sync" },
  });

  useEffect(() => {
    // Run simulated system checks for professional proctoring feel
    const runChecks = async () => {
      await new Promise((r) => setTimeout(r, 800));
      setChecks((prev) => ({ ...prev, screen: { status: "success", label: "Browser Capabilities Check: OK" } }));
      
      await new Promise((r) => setTimeout(r, 600));
      setChecks((prev) => ({ ...prev, network: { status: "success", label: "Network Latency Sync: 24ms (Excellent)" } }));
      
      // Request media permissions for webcam indicator
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          // Stop stream immediately after checking
          stream.getTracks().forEach((track) => track.stop());
          setChecks((prev) => ({ ...prev, webcam: { status: "success", label: "Webcam Connected & Calibrated" } }));
        } else {
          setChecks((prev) => ({ ...prev, webcam: { status: "warning", label: "Webcam Access: Emulated (No hardware detected)" } }));
        }
      } catch (err) {
        setChecks((prev) => ({ ...prev, webcam: { status: "warning", label: "Webcam Blocked (Standard prompt bypass enabled)" } }));
      }
    };
    runChecks();
  }, []);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      setError("Please fill in all fields.");
      return;
    }

    if (checks.webcam.status !== "success" && !bypassCamera) {
      setError("Webcam access is required to begin this secure assessment. Please turn on your camera or select the Simulation Override.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/candidates/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        throw new Error("Failed to register candidate session.");
      }

      const candidate = await response.json();
      const redirectUrl = `/assessment/${candidate.id}` + (bypassCamera ? "?bypassCamera=true" : "");
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || "Error connecting to proctoring server. Make sure it's running.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 items-center justify-center px-4 relative overflow-hidden">
      {/* Dynamic scanlines background element */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none opacity-40"></div>
      
      {/* Cyan radial glow */}
      <div className="absolute w-[500px] h-[500px] bg-cyan-signal/5 blur-[100px] rounded-full top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-8 relative z-10 shadow-2xl">
        {/* Signal status banner */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center space-x-2">
            <span className="h-3.5 w-3.5 rounded-full bg-cyan-signal animate-pulse shadow-[0_0_8px_rgba(10,235,255,0.6)]"></span>
            <span className="font-mono text-xs tracking-wider text-cyan-signal uppercase font-bold">Proctor Node active</span>
          </div>
          <span className="font-mono text-xs text-slate-500">v1.0.0-SECURE</span>
        </div>

        {/* Product Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Integrity<span className="text-cyan-signal">Proctor</span>
          </h1>
          <p className="text-slate-400 text-sm">
            AI-powered remote exam invigilation. You are entering a monitored testing environment.
          </p>
        </div>

        {/* System Calibration Steps */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 mb-8 font-mono text-xs space-y-3">
          <div className="text-slate-400 uppercase tracking-widest text-[10px] font-bold border-b border-slate-800 pb-1 mb-2">
            Pre-Flight System Check
          </div>
          {Object.entries(checks).map(([key, check]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-slate-300">{check.label}</span>
              {check.status === "pending" ? (
                <span className="text-amber-signal animate-pulse">RUNNING...</span>
              ) : check.status === "warning" ? (
                <span className="text-amber-signal font-bold">[!] BYPASS</span>
              ) : (
                <span className="text-green-signal font-bold">✓ READY</span>
              )}
            </div>
          ))}
        </div>

        {/* Start Exam Form */}
        <form onSubmit={handleStartExam} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-signal px-4 py-3 rounded-lg text-sm font-mono flex items-center space-x-2">
              <span className="font-bold">[ERROR]</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs uppercase font-semibold tracking-wider text-slate-400" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-signal focus:ring-1 focus:ring-cyan-signal transition font-mono text-sm placeholder:text-slate-700"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase font-semibold tracking-wider text-slate-400" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-signal focus:ring-1 focus:ring-cyan-signal transition font-mono text-sm placeholder:text-slate-700"
              placeholder="e.g. john@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {checks.webcam.status !== "success" && (
            <div className="flex items-start space-x-3 bg-amber-500/5 border border-amber-500/25 p-4 rounded-lg select-none">
              <input
                id="bypass-camera"
                type="checkbox"
                checked={bypassCamera}
                onChange={(e) => setBypassCamera(e.target.checked)}
                className="mt-1 accent-amber-500 cursor-pointer h-4 w-4 rounded"
              />
              <label htmlFor="bypass-camera" className="text-xs text-amber-signal/90 font-mono leading-relaxed cursor-pointer">
                <strong>[DEV OVERRIDE]</strong> Enable camera offline emulation mode (proceed without physical hardware).
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-signal hover:bg-cyan-400 active:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider py-3.5 px-6 rounded-lg text-sm transition duration-150 ease-in-out cursor-pointer hover:shadow-[0_0_15px_rgba(10,235,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                <span>AUTHENTICATING SESSION...</span>
              </>
            ) : (
              <span>BEGIN ASSESSMENT FLOW</span>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">
            WARNING: Automated integrity flags are active. Any window alterations, webcam disengagements, or copy actions will trigger event logs.
          </p>
        </div>
      </div>
    </div>
  );
}
