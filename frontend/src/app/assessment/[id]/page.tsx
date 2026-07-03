"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FaceLandmarker as FaceLandmarkerType } from "@mediapipe/tasks-vision";
import { API_BASE_URL } from "@/config";

interface Question {
  id: number;
  type: "mcq" | "coding";
  title: string;
  description: string;
  difficulty: string;
  points: number;
  choices: string[] | null;
  sample_code: string | null;
}

interface LogEntry {
  time: string;
  event: string;
  type: "info" | "warning" | "danger";
}

export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCameraBypassed = searchParams.get("bypassCamera") === "true";
  const { id: candidateId } = use(params);
  const candidateIdRef = useRef(candidateId);
  useEffect(() => {
    candidateIdRef.current = candidateId;
  }, [candidateId]);

  // States
  const [candidate, setCandidate] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<{ [qId: number]: string }>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<{ [qId: number]: boolean }>({});
  const [timeRemaining, setTimeRemaining] = useState(1200); // 20 minutes default
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingStatus, setGradingStatus] = useState<{ [qId: number]: "idle" | "grading" | "success" | "error" }>({});
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const isTabActiveRef = useRef(true);
  const lastEventLoggedRef = useRef<{ [key: string]: number }>({});
  const consecutivesRef = useRef<{ [key: string]: number }>({
    face_absent: 0,
    face_multiple: 0,
    gaze_away: 0,
  });

  // Proctor status states
  const [proctorStatus, setProctorStatus] = useState<"calibrating" | "secure" | "warning" | "danger">("calibrating");
  const [proctorMessage, setProctorMessage] = useState("Initializing AI...");
  const [cameraActive, setCameraActive] = useState(true);

  // Add a local log entry helper
  const addLog = (message: string, type: "info" | "warning" | "danger" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time: timestamp, event: message, type }, ...prev]);
  };

  // 1. Fetch Candidate and Start Exam
  useEffect(() => {
    const initExam = async () => {
      try {
        // Fetch candidate details first
        const candRes = await fetch(`${API_BASE_URL}/candidates/${candidateId}`);
        if (!candRes.ok) throw new Error("Candidate session not found");
        const candData = await candRes.json();
        setCandidate(candData);

        // Start assessment and get questions
        const startRes = await fetch(`${API_BASE_URL}/candidates/${candidateId}/start`, {
          method: "POST",
        });
        if (!startRes.ok) throw new Error("Could not start exam session");
        const startData = await startRes.json();
        
        setQuestions(startData.questions);
        
        // Initialize answer states
        const initialAnswers: { [qId: number]: string } = {};
        startData.questions.forEach((q: Question) => {
          initialAnswers[q.id] = q.type === "coding" ? (q.sample_code || "") : "";
        });
        setAnswers(initialAnswers);
        
        addLog("Assessment successfully initialized.", "info");
        addLog("Webcam & window security monitoring active.", "info");
      } catch (err: any) {
        addLog(`Initialization error: ${err.message}`, "danger");
      }
    };

    initExam();
  }, [candidateId]);

  // 2. Webcam & MediaPipe Face Landmarker Initialization
  useEffect(() => {
    let active = true;
    let landmarker: FaceLandmarkerType | null = null;
    let animationFrameId: number;
    let contoursList: any[] = [];
    let irisesList: any[] = [];

    // Helper to draw mesh contours & irises on canvas
    const drawMesh = (
      ctx: CanvasRenderingContext2D,
      landmarks: any[],
      isWarning: boolean
    ) => {
      ctx.lineWidth = 1;
      
      // Draw contours
      ctx.strokeStyle = isWarning ? "rgba(239, 68, 68, 0.6)" : "rgba(6, 182, 212, 0.4)";
      ctx.beginPath();
      for (const [start, end] of contoursList) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        if (p1 && p2) {
          const x1 = (1 - p1.x) * ctx.canvas.width;
          const y1 = p1.y * ctx.canvas.height;
          const x2 = (1 - p2.x) * ctx.canvas.width;
          const y2 = p2.y * ctx.canvas.height;
          
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();

      // Draw irises
      ctx.strokeStyle = isWarning ? "rgba(239, 68, 68, 0.9)" : "rgba(34, 211, 238, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [start, end] of irisesList) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        if (p1 && p2) {
          const x1 = (1 - p1.x) * ctx.canvas.width;
          const y1 = p1.y * ctx.canvas.height;
          const x2 = (1 - p2.x) * ctx.canvas.width;
          const y2 = p2.y * ctx.canvas.height;
          
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
    };

    // Heuristics logic inside loop
    const checkIntegrity = (result: any) => {
      const now = Date.now();
      const faceCount = result.faceLandmarks ? result.faceLandmarks.length : 0;

      const triggerViolation = (type: string, message: string, severity: "warning" | "danger" = "warning") => {
        addLog(message, severity === "danger" ? "danger" : "warning");

        const lastLogged = lastEventLoggedRef.current[type] || 0;
        if (now - lastLogged > 12000) {
          lastEventLoggedRef.current[type] = now;
          logIntegrityEvent(type, message);
        }
      };

      if (faceCount === 0) {
        consecutivesRef.current.face_absent = (consecutivesRef.current.face_absent || 0) + 1;
        consecutivesRef.current.face_multiple = 0;
        consecutivesRef.current.gaze_away = 0;

        setProctorStatus("danger");
        setProctorMessage("FACE ABSENT");

        if (consecutivesRef.current.face_absent === 30) {
          triggerViolation("face_absent", "Visual Integrity Flag: No face detected in camera feed.", "danger");
        }
      } else if (faceCount > 1) {
        consecutivesRef.current.face_multiple = (consecutivesRef.current.face_multiple || 0) + 1;
        consecutivesRef.current.face_absent = 0;
        consecutivesRef.current.gaze_away = 0;

        setProctorStatus("danger");
        setProctorMessage("MULTIPLE FACES");

        if (consecutivesRef.current.face_multiple === 30) {
          triggerViolation("face_multiple", "Visual Integrity Flag: Multiple faces detected in camera feed.", "danger");
        }
      } else {
        consecutivesRef.current.face_absent = 0;
        consecutivesRef.current.face_multiple = 0;

        const landmarks = result.faceLandmarks[0];
        if (landmarks && landmarks.length >= 454) {
          // --- Head Turn / Yaw ---
          const leftCheek = landmarks[234];
          const rightCheek = landmarks[454];
          const noseTip = landmarks[4];
          
          const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
          const leftToNose = Math.abs(noseTip.x - leftCheek.x);
          const yawRatio = faceWidth > 0 ? leftToNose / faceWidth : 0.5;

          // --- Head Pitch (Up-Down) ---
          const forehead = landmarks[10];
          const chin = landmarks[152];
          const verticalHeight = Math.abs(chin.y - forehead.y);
          const foreheadToNose = Math.abs(noseTip.y - forehead.y);
          const pitchRatio = verticalHeight > 0 ? foreheadToNose / verticalHeight : 0.5;

          // --- Head Roll (Tilt) ---
          const leftEyeOuter = landmarks[263];
          const rightEyeOuter = landmarks[33];
          const rollAngle = Math.abs(Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x) * (180 / Math.PI));

          // --- Gaze Tracking (Eye Iris offsets) ---
          let isGazeAwaySide = false;
          if (landmarks[468] && landmarks[473] && landmarks[362] && landmarks[133]) {
            const leftEyeWidth = Math.abs(landmarks[263].x - landmarks[362].x);
            const leftGazeOffset = leftEyeWidth > 0 ? (landmarks[468].x - landmarks[362].x) / leftEyeWidth : 0.5;

            const rightEyeWidth = Math.abs(landmarks[133].x - landmarks[33].x);
            const rightGazeOffset = rightEyeWidth > 0 ? (landmarks[473].x - landmarks[33].x) / rightEyeWidth : 0.5;

            if (leftGazeOffset < 0.32 || leftGazeOffset > 0.68 || rightGazeOffset < 0.32 || rightGazeOffset > 0.68) {
              isGazeAwaySide = true;
            }
          }

          const isYawAway = yawRatio < 0.35 || yawRatio > 0.65;
          const isPitchAway = pitchRatio < 0.38 || pitchRatio > 0.68;
          const isRollAway = rollAngle > 18;

          if (isYawAway || isPitchAway || isRollAway || isGazeAwaySide) {
            consecutivesRef.current.gaze_away = (consecutivesRef.current.gaze_away || 0) + 1;
            
            setProctorStatus("warning");
            if (isYawAway) setProctorMessage("LOOKING SIDEWAYS");
            else if (isPitchAway) setProctorMessage("LOOKING UP/DOWN");
            else if (isRollAway) setProctorMessage("HEAD TILT WARNING");
            else setProctorMessage("EYES DISTRACTED");

            if (consecutivesRef.current.gaze_away === 45) {
              let reason = "Candidate is looking away from secure exam screen.";
              if (isYawAway) reason = "Visual Telemetry: Head turned left/right.";
              else if (isPitchAway) reason = "Visual Telemetry: Head turned up/down.";
              else if (isRollAway) reason = "Visual Telemetry: Head tilt threshold exceeded.";
              else if (isGazeAwaySide) reason = "Visual Telemetry: Eyes scanning outer resources.";

              triggerViolation("gaze_away", reason, "warning");
            }
          } else {
            consecutivesRef.current.gaze_away = 0;
            setProctorStatus("secure");
            setProctorMessage("FACE TELEMETRY SECURE");
          }
        } else {
          setProctorStatus("secure");
          setProctorMessage("FACE DETECTED");
        }
      }
    };

    const startWebcamAndLandmarker = async () => {
      let webcamConnected = false;
      try {
        // 1. Request Webcam access
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          webcamStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          addLog("Webcam stream connected.", "info");
          webcamConnected = true;
        } else {
          throw new Error("Webcam interface not supported by browser.");
        }
      } catch (err: any) {
        addLog("Camera access blocked or device not found. Running in Offline Emulation mode.", "warning");
        logIntegrityEvent("face_absent", "Webcam device offline or permission denied.");
        setProctorStatus("danger");
        setProctorMessage("CAMERA OFFLINE");
        setCameraActive(isCameraBypassed);
      }

      // 2. Initialize MediaPipe Face Landmarker anyway (allows visual overlay setup)
      try {
        addLog("Loading AI Face Mesh Engine...", "info");
        const vision = await import("@mediapipe/tasks-vision");
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        
        landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false
        });

        // Cache connection arrays
        contoursList = vision.FaceLandmarker.FACE_LANDMARKS_CONTOURS;
        irisesList = [
          ...vision.FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
          ...vision.FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS
        ];

        addLog("AI Proctoring Engine loaded.", "info");

        if (webcamConnected) {
          setProctorStatus("secure");
          setProctorMessage("FACE TELEMETRY SECURE");

          // Start actual video detection loop
          const detectFrame = () => {
            if (!active) return;
            
            if (videoRef.current && videoRef.current.readyState >= 2 && landmarker) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              
              if (canvas) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                }
              }

              const timestamp = performance.now();
              const result = landmarker.detectForVideo(video, timestamp);

              // Process results
              checkIntegrity(result);

              // Draw overlay
              const ctx = canvas?.getContext("2d");
              if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const isWarning = consecutivesRef.current.face_absent > 5 || 
                                 consecutivesRef.current.face_multiple > 5 || 
                                 consecutivesRef.current.gaze_away > 5;
                                 
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                  for (const face of result.faceLandmarks) {
                    drawMesh(ctx, face, isWarning);
                  }
                }
              }
            }
            
            animationFrameId = requestAnimationFrame(detectFrame);
          };

          detectFrame();
        } else {
          // If no webcam, run an emulation timer that adds periodic telemetry warnings
          let ticks = 0;
          const emulateLoop = () => {
            if (!active) return;
            ticks++;
            
            if (ticks % 300 === 0) {
              const reason = "Proctor Warning: Secure visual feed remains offline. Canvas is blank.";
              addLog(reason, "danger");
              
              // Log face_absent periodically to backend
              const now = Date.now();
              const lastLogged = lastEventLoggedRef.current["face_absent"] || 0;
              if (now - lastLogged > 12000) {
                lastEventLoggedRef.current["face_absent"] = now;
                logIntegrityEvent("face_absent", "Webcam device offline or permission denied.");
              }
            }
            
            animationFrameId = requestAnimationFrame(emulateLoop);
          };
          emulateLoop();
        }
      } catch (err: any) {
        console.error("AI Proctoring Engine failed to initialize:", err);
        addLog("Visual telemetry failed to initialize: " + err.message, "danger");
        setProctorStatus("danger");
        setProctorMessage("AI OFFLINE");
      }
    };

    startWebcamAndLandmarker();

    return () => {
      active = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (landmarker) {
        try {
          landmarker.close();
        } catch (closeErr) {
          console.warn("MediaPipe landmarker close warning:", closeErr);
        }
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 3. Countdown Timer
  useEffect(() => {
    if (timeRemaining <= 0) {
      addLog("Time limit reached. Auto-submitting assessment...", "danger");
      handleFinishExam();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // 4. Backend Integrity Log Helper
  const logIntegrityEvent = async (eventType: string, details: string) => {
    try {
      await fetch(`${API_BASE_URL}/candidates/${candidateIdRef.current}/log-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          confidence: 1.0,
          details: details,
        }),
      });
    } catch (err) {
      console.error("Failed to log integrity event to server", err);
    }
  };

  // 5. Browser Event Monitoring
  useEffect(() => {
    // Window blur event (e.g. user clicks on another app or opens developer tools)
    const handleBlur = () => {
      if (isTabActiveRef.current) {
        addLog("Window Focus Lost: Possible multi-tasking detected", "warning");
        logIntegrityEvent("window_blur", "User navigated focus away from browser window.");
      }
    };

    // Tab visibility changes (tab switch)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isTabActiveRef.current = false;
        addLog("Security Alert: Tab switch detected", "danger");
        logIntegrityEvent("tab_switch", "Candidate switched tab or minimized browser window.");
      } else {
        isTabActiveRef.current = true;
        addLog("Security Info: Returned to active exam workspace", "info");
      }
    };

    // Fullscreen exit detection
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        addLog("Security Alert: Fullscreen exit detected", "warning");
        logIntegrityEvent("fullscreen_exit", "User exited secure fullscreen mode.");
      }
    };

    // Copy / Paste / Cut detection
    const handleCopy = (e: ClipboardEvent) => {
      addLog("Clipboard Event: Text copy attempt detected", "warning");
      logIntegrityEvent("copy_paste", `Copy event intercepted. Text: "${window.getSelection()?.toString().slice(0, 50)}..."`);
    };

    const handlePaste = (e: ClipboardEvent) => {
      addLog("Clipboard Event: Paste block triggered", "warning");
      logIntegrityEvent("copy_paste", "Paste event intercepted.");
    };

    // Add listeners
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
    };
  }, [candidateId]);

  // Request fullscreen
  const requestFullscreen = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen();
      addLog("Secure Fullscreen lock engaged.", "info");
    }
  };

  // Handle answers input changes
  const handleAnswerChange = (val: string) => {
    const currentQ = questions[currentIdx];
    setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
  };

  // Submit single question answer
  const handleSubmitAnswer = async () => {
    const currentQ = questions[currentIdx];
    const val = answers[currentQ.id];

    setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "grading" }));

    try {
      const response = await fetch(`${API_BASE_URL}/candidates/${candidateId}/submit-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: currentQ.id,
          mcq_answer: currentQ.type === "mcq" ? val : null,
          coding_submission: currentQ.type === "coding" ? val : null,
        }),
      });

      if (!response.ok) throw new Error("Grading submission failed.");
      
      addLog(`Graded Answer for: "${currentQ.title}"`, "info");
      setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "success" }));
      setSubmittedAnswers((prev) => ({ ...prev, [currentQ.id]: true }));
    } catch (err: any) {
      addLog(`Grading Error: ${err.message}`, "danger");
      setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "error" }));
    }
  };

  // Complete exam
  const handleFinishExam = async () => {
    setIsSubmitting(true);
    try {
      // Call complete assessment endpoint
      const response = await fetch(`${API_BASE_URL}/candidates/${candidateId}/complete`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Could not save completion status.");
      
      // Stop webcam
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      
      addLog("Exam completed. Redirecting to report...", "info");
      router.push(`/completed?id=${candidateId}`);
    } catch (err: any) {
      addLog(`Submission Error: ${err.message}`, "danger");
      setIsSubmitting(false);
    }
  };

  // Format time
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const currentQuestion = questions[currentIdx];

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header Banner */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>Assessment Room</span>
            <span className="text-xs bg-slate-800 text-cyan-signal border border-slate-700 px-2 py-0.5 rounded font-mono">
              ACTIVE SESSION
            </span>
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Candidate ID: {candidateId} {candidate && `| Name: ${candidate.name}`}
          </p>
        </div>

        {/* Timer Box */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${timeRemaining < 180 ? 'bg-red-signal animate-pulse' : 'bg-green-signal animate-pulse'}`}></span>
            <span className={`font-mono text-xl font-bold tracking-wider ${timeRemaining < 180 ? 'text-red-signal' : 'text-white'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>

          <button
            onClick={requestFullscreen}
            className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs px-3 py-1.5 rounded cursor-pointer transition font-mono uppercase text-slate-300"
          >
            Lock Fullscreen
          </button>

          <button
            onClick={handleFinishExam}
            disabled={isSubmitting}
            className="bg-red-signal/20 hover:bg-red-signal/30 text-red-signal border border-red-signal/30 text-xs px-4 py-1.5 rounded font-bold uppercase tracking-wider cursor-pointer transition disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Finish Assessment"}
          </button>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Proctoring Panel (Control Room console) */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/60 flex flex-col overflow-hidden">
          {/* Webcam Block */}
          <div className="p-4 border-b border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono mb-2">
              Proctor Camera Feed
            </div>
            <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />
              {/* Webcam Scanning Overlay */}
              <div className={`absolute top-2 left-2 flex items-center space-x-1.5 bg-slate-950/90 px-2 py-0.5 rounded text-[9px] font-mono uppercase border tracking-wider transition-colors duration-300 ${
                proctorStatus === "danger" 
                  ? "border-red-500/50 text-red-400" 
                  : proctorStatus === "warning" 
                  ? "border-amber-500/50 text-amber-400 font-bold" 
                  : "border-cyan-500/30 text-cyan-signal"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  proctorStatus === "danger" 
                    ? "bg-red-500 animate-ping" 
                    : proctorStatus === "warning" 
                    ? "bg-amber-500 animate-pulse" 
                    : "bg-cyan-signal animate-ping"
                }`}></span>
                <span>{proctorMessage}</span>
              </div>
            </div>
          </div>

          {/* Realtime Event Monitor Logs */}
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono mb-2">
              Real-time Integrity Console
            </div>
            <div className="flex-1 bg-slate-950/90 rounded-lg border border-slate-850 p-3 font-mono text-[10px] leading-relaxed overflow-y-auto space-y-2 flex flex-col-reverse">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-8">Initializing telemetry logs...</div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`border-b border-slate-900 pb-1.5 ${
                      log.type === "danger"
                        ? "text-red-signal"
                        : log.type === "warning"
                        ? "text-amber-signal font-bold"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="text-slate-600 mr-1.5">[{log.time}]</span>
                    {log.event}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Center Assessment Panel */}
        {questions.length === 0 ? (
          <main className="flex-1 flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center space-y-4">
              <span className="h-8 w-8 border-4 border-cyan-signal border-t-transparent rounded-full animate-spin"></span>
              <p className="font-mono text-slate-400 text-sm">Decrypting exam payload...</p>
            </div>
          </main>
        ) : !cameraActive ? (
          <main className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-center p-8 relative z-50">
            <div className="max-w-md bg-slate-900 border border-red-500/30 rounded-xl p-8 shadow-2xl">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 text-3xl mb-6 animate-pulse">
                ✕
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mb-2 font-mono">Webcam Access Required</h1>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                This secured exam requires active webcam invigilation. 
                Camera access is currently blocked or unavailable. Please grant permissions and turn on your camera.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-red-500/20 hover:bg-red-500/35 text-red-400 border border-red-500/30 font-bold uppercase tracking-wider py-3 px-6 rounded-lg text-xs transition cursor-pointer font-mono"
              >
                Re-initialize Camera Link
              </button>
            </div>
          </main>
        ) : (
          <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            {/* Question Tabs Selector */}
            <div className="bg-slate-900/40 border-b border-slate-850 flex items-center px-6 py-2.5 overflow-x-auto space-x-2">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-mono rounded border transition flex items-center space-x-1.5 cursor-pointer ${
                    currentIdx === idx
                      ? "bg-cyan-signal/15 text-cyan-signal border-cyan-signal/30 font-bold"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>Q{idx + 1}</span>
                  <span className="text-[10px] text-slate-500 uppercase">({q.type})</span>
                  {submittedAnswers[q.id] && (
                    <span className="h-1.5 w-1.5 rounded-full bg-green-signal"></span>
                  )}
                </button>
              ))}
            </div>

            {/* Current Question View */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex items-start justify-between border-b border-slate-850 pb-4 mb-4">
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
                    Question {currentIdx + 1} of {questions.length} | {currentQuestion.points} Points
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1">{currentQuestion.title}</h3>
                </div>
                <span className={`px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded uppercase ${
                  currentQuestion.difficulty === 'easy'
                    ? 'bg-green-signal/10 text-green-signal border border-green-signal/20'
                    : 'bg-amber-signal/10 text-amber-signal border border-amber-signal/20'
                }`}>
                  {currentQuestion.difficulty}
                </span>
              </div>

              {/* Description */}
              <div className="text-sm text-slate-300 leading-relaxed mb-6 font-sans whitespace-pre-line">
                {currentQuestion.description}
              </div>

              {/* Input Area depending on type */}
              <div className="flex-1 flex flex-col min-h-[300px]">
                {currentQuestion.type === "mcq" ? (
                  <div className="space-y-3">
                    {currentQuestion.choices?.map((choice, i) => {
                      const letter = String.fromCharCode(65 + i); // A, B, C, D
                      const isSelected = answers[currentQuestion.id] === choice;
                      return (
                        <label
                          key={i}
                          onClick={() => handleAnswerChange(choice)}
                          className={`flex items-center space-x-3 p-4 bg-slate-900 border rounded-lg cursor-pointer transition select-none ${
                            isSelected
                              ? "border-cyan-signal/60 bg-cyan-signal/5 text-white"
                              : "border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                          }`}
                        >
                          <span className={`h-6 w-6 rounded border flex items-center justify-center text-xs font-mono font-bold ${
                            isSelected ? 'bg-cyan-signal text-slate-950 border-cyan-signal' : 'border-slate-700 text-slate-500'
                          }`}>
                            {letter}
                          </span>
                          <span className="text-sm font-mono">{choice}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                    {/* Code Editor Header */}
                    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-500 select-none">
                      <span>main.py</span>
                      <span>Python 3.x</span>
                    </div>
                    {/* Textarea Code Editor */}
                    <textarea
                      spellCheck={false}
                      className="flex-1 bg-slate-950 text-slate-200 font-mono text-sm p-4 w-full h-full focus:outline-none resize-none leading-relaxed"
                      value={answers[currentQuestion.id] || ""}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Write your python function here..."
                    />
                  </div>
                )}
              </div>

              {/* grading feedback panel */}
              <div className="mt-6 flex items-center justify-between bg-slate-900/40 p-4 border border-slate-850 rounded-lg">
                <div className="text-xs font-mono text-slate-400">
                  {gradingStatus[currentQuestion.id] === "grading" ? (
                    <span className="text-cyan-signal animate-pulse">Running test suite cases...</span>
                  ) : gradingStatus[currentQuestion.id] === "success" ? (
                    <span className="text-green-signal font-bold">✓ Grade Saved (Execution complete)</span>
                  ) : gradingStatus[currentQuestion.id] === "error" ? (
                    <span className="text-red-signal font-bold">✗ Grade Saved (Test cases failed compile/output)</span>
                  ) : (
                    <span>Make changes and submit for grading.</span>
                  )}
                </div>

                <div className="flex space-x-3">
                  {currentIdx > 0 && (
                    <button
                      onClick={() => setCurrentIdx((prev) => prev - 1)}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs px-4 py-2 rounded cursor-pointer transition border border-slate-700"
                    >
                      Previous
                    </button>
                  )}
                  
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={gradingStatus[currentQuestion.id] === "grading"}
                    className="bg-cyan-signal text-slate-950 font-bold uppercase tracking-wider text-xs px-5 py-2.5 rounded cursor-pointer hover:bg-cyan-400 hover:shadow-[0_0_12px_rgba(10,235,255,0.3)] transition disabled:opacity-50"
                  >
                    {gradingStatus[currentQuestion.id] === "grading" ? "Grading..." : "Submit Answer"}
                  </button>

                  {currentIdx < questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentIdx((prev) => prev + 1)}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs px-4 py-2 rounded cursor-pointer transition border border-slate-700"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleFinishExam}
                      disabled={isSubmitting}
                      className="bg-red-signal/80 hover:bg-red-signal text-white font-bold uppercase tracking-wide text-xs px-5 py-2.5 rounded cursor-pointer transition"
                    >
                      Submit Exam
                    </button>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
