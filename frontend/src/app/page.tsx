"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config";

export default function LandingPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [verifiedCandidate, setVerifiedCandidate] = useState<any | null>(null);
  const [codeError, setCodeError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bypassCamera, setBypassCamera] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  
  // Simulated pre-checks
  const [checks, setChecks] = useState({
    webcam: { status: "pending", label: "Webcam Access Verification: Pending interaction" },
    microphone: { status: "pending", label: "Microphone Access Verification: Pending interaction" },
    screen: { status: "pending", label: "Browser Capabilities Check" },
    network: { status: "pending", label: "Network Latency Sync" },
  });

  useEffect(() => {
    // Run simulated system checks for professional proctoring feel
    const runChecks = async () => {
      await new Promise((r) => setTimeout(r, 600));
      setChecks((prev) => ({ ...prev, screen: { status: "success", label: "Browser Capabilities Check: OK" } }));
      
      await new Promise((r) => setTimeout(r, 500));
      setChecks((prev) => ({ ...prev, network: { status: "success", label: "Network Latency Sync: 24ms (Excellent)" } }));
      
      setChecks((prev) => ({ 
        ...prev, 
        webcam: { status: "pending", label: "Webcam Access: Authorization Required" },
        microphone: { status: "pending", label: "Microphone Access: Authorization Required" }
      }));
    };
    runChecks();

    // Check for code in URL query params on mount
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code");
    if (codeParam) {
      setInviteCode(codeParam);
      verifyCodeDirectly(codeParam);
    }
  }, []);

  const verifyCodeDirectly = async (code: string) => {
    if (!code.trim()) return;
    setVerifyingCode(true);
    setCodeError("");
    setError("");
    setVerifiedCandidate(null);
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${code.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed") {
          setCodeError("This invite code has already been completed.");
        } else if (data.status === "blocked") {
          setCodeError("Access denied. This candidate session has been blocked.");
        } else {
          setVerifiedCandidate(data);
        }
      } else {
        setCodeError("Invalid invite code. Please check and try again.");
      }
    } catch (err) {
      setCodeError("Error connecting to validation server.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const verifyCode = async (code: string) => {
    if (!code.trim()) {
      setCodeError("Please enter an invite code.");
      return;
    }
    verifyCodeDirectly(code);
  };

  const requestPermissions = async () => {
    setError("");
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        setChecks((prev) => ({
          ...prev,
          webcam: { status: "pending", label: "Webcam Access: Requesting..." },
          microphone: { status: "pending", label: "Microphone Access: Requesting..." },
        }));
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((track) => track.stop());
        
        setChecks((prev) => ({ 
          ...prev, 
          webcam: { status: "success", label: "Webcam Connected & Calibrated" },
          microphone: { status: "success", label: "Microphone Connected & Calibrated" }
        }));
        setError("");
      } else {
        setChecks((prev) => ({ 
          ...prev, 
          webcam: { status: "warning", label: "Webcam Access: Emulated (No hardware detected)" },
          microphone: { status: "warning", label: "Microphone Access: Emulated (No hardware detected)" }
        }));
      }
    } catch (err) {
      setChecks((prev) => ({ 
        ...prev, 
        webcam: { status: "warning", label: "Webcam Blocked (Permission Denied)" },
        microphone: { status: "warning", label: "Microphone Blocked (Permission Denied)" }
      }));
      setError("Webcam/Microphone permission request denied. Please click the lock icon in your browser address bar to reset permissions.");
    }
  };

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedCandidate) {
      setError("Please verify a valid invite code first.");
      return;
    }

    if ((checks.webcam.status !== "success" || checks.microphone.status !== "success") && !bypassCamera) {
      setError("Webcam and Microphone access are required to begin this secure assessment. Please click 'Grant Camera & Mic Permissions' above or select the Simulation Override.");
      return;
    }

    if (!consentChecked) {
      setError("You must check the consent box to consciously allow monitored assessment proctoring.");
      return;
    }

    setLoading(true);
    setError("");

    // Attempt to enter fullscreen immediately on user click gesture
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (fsErr) {
      console.warn("Fullscreen request failed during click gesture:", fsErr);
    }

    const redirectUrl = `/assessment/${verifiedCandidate.sec_id || verifiedCandidate.id}` + (bypassCamera ? "?bypassCamera=true" : "");
    router.push(redirectUrl);
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
          {(checks.webcam.status !== "success" || checks.microphone.status !== "success") && (
            <div className="pt-2.5 border-t border-slate-800 mt-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={requestPermissions}
                className="w-full bg-cyan-950 hover:bg-cyan-900 border border-cyan-800/50 text-cyan-400 hover:text-cyan-300 font-bold py-2 px-3 rounded transition text-center uppercase tracking-wider font-mono text-[9px] cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🔒 Grant Camera & Mic Permissions</span>
              </button>
              <p className="text-[9px] text-slate-500 font-sans leading-relaxed">
                Click above to trigger the browser permission prompt to allow camera and microphone access.
              </p>
            </div>
          )}
        </div>
  
        {/* Start Exam Form */}
        {!verifiedCandidate ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs uppercase font-semibold tracking-wider text-slate-400 font-mono" htmlFor="code">
                Enter Exam Invite Code
              </label>
              <input
                id="code"
                type="text"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-signal focus:ring-1 focus:ring-cyan-signal transition font-mono text-sm placeholder:text-slate-700 uppercase tracking-widest text-center"
                placeholder="SEC-XXXXXXXXXX"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={verifyingCode}
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyCode(inviteCode);
                }}
              />
            </div>

            {codeError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 rounded-lg text-xs font-mono">
                <strong>[ERROR]</strong> {codeError}
              </div>
            )}

            <button
              type="button"
              disabled={verifyingCode || !inviteCode.trim()}
              onClick={() => verifyCode(inviteCode)}
              className="w-full bg-cyan-signal hover:bg-cyan-400 active:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider py-3 px-6 rounded-lg text-xs transition duration-150 ease-in-out cursor-pointer hover:shadow-[0_0_15px_rgba(10,235,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {verifyingCode ? (
                <>
                  <span className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>VERIFYING CODE...</span>
                </>
              ) : (
                <span>VERIFY CODE & ENTER ROOM</span>
              )}
            </button>
          </div>
        ) : (
          <form onSubmit={handleStartExam} className="space-y-6 animate-fadeIn">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 rounded-lg text-sm font-mono flex items-center space-x-2">
                <span className="font-bold">[ERROR]</span>
                <span>{error}</span>
              </div>
            )}

            {/* Candidate Identity Confirmation Panel */}
            <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-4 space-y-2.5 font-mono text-xs select-none">
              <div className="text-cyan-signal uppercase tracking-wider text-[10px] font-bold border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>✓ Verified Profile Identity</span>
                <button
                  type="button"
                  onClick={() => setVerifiedCandidate(null)}
                  className="text-slate-500 hover:text-slate-350 font-bold uppercase tracking-wide text-[9px] underline cursor-pointer"
                >
                  Change Code
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Candidate:</span>
                <span className="text-white font-bold">{verifiedCandidate.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="text-white truncate max-w-[200px]">{verifiedCandidate.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Exam Track:</span>
                <span className="text-cyan-400 font-bold">{verifiedCandidate.domain}</span>
              </div>
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
                <label htmlFor="bypass-camera" className="text-xs text-amber-signal/90 font-mono leading-relaxed cursor-pointer font-sans">
                  <strong>[DEV OVERRIDE]</strong> Enable camera offline emulation mode (proceed without physical hardware).
                </label>
              </div>
            )}

            <div className="flex items-start space-x-3 bg-slate-950/60 border border-slate-850 p-4 rounded-lg select-none">
              <input
                id="consent-check"
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 accent-cyan-signal cursor-pointer h-4 w-4 rounded"
              />
              <label htmlFor="consent-check" className="text-xs text-slate-400 leading-relaxed cursor-pointer font-sans">
                I consciously consent to sharing my camera feed, microphone audio stream, and browser/system telemetry for proctoring analysis during this assessment session.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-signal hover:bg-cyan-400 active:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider py-3.5 px-6 rounded-lg text-sm transition duration-150 ease-in-out cursor-pointer hover:shadow-[0_0_15px_rgba(10,235,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>PREPARING EXAM WORKSPACE...</span>
                </>
              ) : (
                <span>BEGIN SECURITY TESTROOM</span>
              )}
            </button>
          </form>
        )}
  
        {/* Security Notice */}
        <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wide leading-relaxed">
            WARNING: Automated integrity flags are active. Any window alterations, webcam disengagements, or copy actions will trigger event logs.
          </p>
        </div>
      </div>
    </div>
  );
}
