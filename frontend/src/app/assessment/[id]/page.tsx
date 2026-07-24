"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FaceLandmarker as FaceLandmarkerType } from "@mediapipe/tasks-vision";
import { API_BASE_URL } from "@/config";

interface Question {
  id: number;
  type: "mcq" | "coding" | "paragraph";
  title: string;
  description: string;
  difficulty: string;
  points: number;
  choices: string[] | null;
  sample_code: string | null;
  time_limit?: number | null;
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [flaggedQuestions, setFlaggedQuestions] = useState<{ [qId: number]: boolean }>({});
  const [answers, setAnswers] = useState<{ [qId: number]: string }>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<{ [qId: number]: boolean }>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null); // in seconds, null means no limit
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState<number | null>(null); // per question
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingStatus, setGradingStatus] = useState<{ [qId: number]: "idle" | "grading" | "success" | "error" }>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [majorEventsCount, setMajorEventsCount] = useState(0);
  const [maxStrikes, setMaxStrikes] = useState(3);
  const majorEventsCountRef = useRef(0);
  const maxStrikesRef = useRef(3);
  
  // Theme & Camera Covered States
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [cameraCovered, setCameraCovered] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isTabActiveRef = useRef(true);
  const audioVolumeRef = useRef(0);
  const lastEventLoggedRef = useRef<{ [key: string]: number }>({});
  const blackFramesCountRef = useRef(0);
  const consecutivesRef = useRef<{ [key: string]: number }>({
    face_absent: 0,
    face_multiple: 0,
    gaze_away: 0,
    speaking_no_movement: 0,
  });

  // Theme Sync Effect
  useEffect(() => {
    const savedTheme = localStorage.getItem("assessment_theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    localStorage.setItem("assessment_theme", newTheme);
  };

  // Proctor status states
  const [proctorStatus, setProctorStatus] = useState<"calibrating" | "secure" | "warning" | "danger">("calibrating");
  const [proctorMessage, setProctorMessage] = useState("Initializing AI...");
  const [cameraActive, setCameraActive] = useState(true);

  // Helper to check if camera feed is black
  const checkIfCameraIsBlack = (video: HTMLVideoElement): boolean => {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 64;
      tempCanvas.height = 48;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalBrightness += (r + g + b) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 16);
        return avgBrightness < 8; // If avg brightness under 8, it's covered/black
      }
    } catch (e) {
      console.error("Error analyzing camera brightness:", e);
    }
    return false;
  };

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
        setTimeRemaining(startData.overall_time_limit);
        if (startData.max_strikes !== undefined) {
          setMaxStrikes(startData.max_strikes);
          maxStrikesRef.current = startData.max_strikes;
        }
        
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

          // --- Mouth Open Detection & Closed-mouth Speaking ---
          const topLipBottom = landmarks[13];
          const bottomLipTop = landmarks[14];
          const mouthOpenDistance = Math.abs(bottomLipTop.y - topLipBottom.y);
          const mouthOpenRatio = verticalHeight > 0 ? mouthOpenDistance / verticalHeight : 0.0;
          const isMouthOpen = mouthOpenRatio > 0.035;

          // If volume is high (voice detected) but mouth is closed (no mouth movement)
          if (audioVolumeRef.current > 15 && !isMouthOpen) {
            consecutivesRef.current.speaking_no_movement = (consecutivesRef.current.speaking_no_movement || 0) + 1;
            if (consecutivesRef.current.speaking_no_movement === 30) {
              triggerViolation("speaking_no_movement", "Acoustic Integrity Flag: Voice detected while candidate's mouth is closed.", "danger");
            }
          } else {
            consecutivesRef.current.speaking_no_movement = Math.max(0, (consecutivesRef.current.speaking_no_movement || 0) - 1);
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
        // 1. Request Webcam and Microphone access
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          webcamStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          addLog("Webcam & Microphone stream connected.", "info");
          webcamConnected = true;

          // Detect webcam unplugging or hardware disabling mid-test
          stream.getVideoTracks().forEach((track) => {
            track.onended = () => {
              addLog("Security Alert: Camera device was unplugged or disabled.", "danger");
              logIntegrityEvent("camera_offline", "Webcam hardware disconnected mid-exam.");
              incrementMajorEvent("Webcam unplugged/disabled mid-test");
            };
          });

          // Start MediaRecorder for audio recording
          try {
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            
            recorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                audioChunksRef.current.push(event.data);
              }
            };
            
            recorder.start(1000);
            addLog("Secure audio recording active.", "info");
          } catch (recErr) {
            console.error("Audio recording failed to start:", recErr);
            addLog("Audio recording disabled (unsupported format).", "warning");
          }

          // Ambient sound level analyzer for talking/noise detection
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            let highNoiseTicks = 0;
            const monitorAudio = () => {
              if (!active) {
                audioCtx.close();
                return;
              }
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const average = sum / dataArray.length;
              audioVolumeRef.current = average;
              
              // Threshold for voice/sustained sound (typically around 40-50 out of 255)
              if (average > 45) {
                highNoiseTicks++;
                if (highNoiseTicks === 60) { // ~3 seconds of continuous loud noise/voice
                  addLog("Audio Telemetry: Voice or loud background noise detected.", "warning");
                  logIntegrityEvent("voice_detected", "System flagged sustained voice/sound in testing environment.");
                }
              } else {
                highNoiseTicks = Math.max(0, highNoiseTicks - 1);
              }
              
              setTimeout(monitorAudio, 100);
            };
            monitorAudio();
          } catch (audioErr) {
            console.error("Audio analyzer failed to initialize:", audioErr);
          }
        } else {
          throw new Error("Webcam/Microphone interface not supported by browser.");
        }
      } catch (err: any) {
        addLog("Camera or Microphone access blocked/not found. Running in Offline Emulation mode.", "warning");
        logIntegrityEvent("face_absent", "Webcam/Microphone device offline or permission denied.");
        setProctorStatus("danger");
        setProctorMessage("MEDIA OFFLINE");
        setCameraActive(isCameraBypassed);
        if (!isCameraBypassed) {
          incrementMajorEvent("Camera/Microphone access blocked/not found");
        }
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
          let lastDetectionTime = 0;
          const detectFrame = () => {
            if (!active) return;
            
            const now = performance.now();
            if (now - lastDetectionTime >= 150) {
              lastDetectionTime = now;
              
              if (videoRef.current && videoRef.current.readyState >= 2 && landmarker) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                
                if (canvas) {
                  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                  }
                }

                const isBlack = checkIfCameraIsBlack(video);
                if (isBlack) {
                  blackFramesCountRef.current += 1;
                  if (blackFramesCountRef.current === 15) {
                    setCameraCovered(true);
                    addLog("Security Alert: Camera feed appears to be covered or completely dark.", "danger");
                    logIntegrityEvent("camera_covered", "Camera feed is black/covered.");
                  }
                } else {
                  if (blackFramesCountRef.current >= 15) {
                    setCameraCovered(false);
                    addLog("Security Info: Camera feed recovered.", "info");
                  }
                  blackFramesCountRef.current = 0;
                }

                const result = landmarker.detectForVideo(video, now);

                if (isBlack || blackFramesCountRef.current >= 15) {
                  setProctorStatus("danger");
                  setProctorMessage("CAMERA COVERED / BLACK");
                } else {
                  // Process results
                  checkIntegrity(result);
                }

                // Draw overlay
                const ctx = canvas?.getContext("2d");
                if (ctx && canvas) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  const isWarning = consecutivesRef.current.face_absent > 5 || 
                                   consecutivesRef.current.face_multiple > 5 || 
                                   consecutivesRef.current.gaze_away > 5 ||
                                   isBlack;
                                   
                  if (!isBlack && result.faceLandmarks && result.faceLandmarks.length > 0) {
                    for (const face of result.faceLandmarks) {
                      drawMesh(ctx, face, isWarning);
                    }
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
      // Bypassing landmarker.close() call to avoid WebAssembly heap/closeGraph abort errors
      // inside Next.js client-side page transitions. Memory is reclaimed on unmount/refresh.
      console.log("Cleaning up proctoring visual elements...");
      
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 3. Countdown Timer (Overall test - Optional)
  useEffect(() => {
    if (timeRemaining === null) return;

    if (timeRemaining <= 0) {
      addLog("Overall time limit reached. Auto-submitting assessment...", "danger");
      handleFinishExam();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // 3b. Sync Question specific Timer
  useEffect(() => {
    if (questions.length > 0 && currentIdx < questions.length) {
      const currentQ = questions[currentIdx];
      if (currentQ.time_limit) {
        setQuestionTimeRemaining(currentQ.time_limit);
      } else {
        setQuestionTimeRemaining(null);
      }
    }
  }, [currentIdx, questions]);

  // 3c. Question Timer Countdown
  useEffect(() => {
    if (questionTimeRemaining === null) return;

    if (questionTimeRemaining <= 0) {
      addLog(`Time limit reached for Question ${currentIdx + 1}. Auto-submitting...`, "warning");
      handleSubmitAnswer();
      
      // Auto move to next question or complete
      if (currentIdx < questions.length - 1) {
        setCurrentIdx((prev) => prev + 1);
      } else {
        addLog("Final question timed out. Completing assessment...", "info");
        handleFinishExam();
      }
      return;
    }

    const timer = setInterval(() => {
      setQuestionTimeRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [questionTimeRemaining, currentIdx, questions]);

  const captureWebcamSnapshot = (): string | null => {
    if (!videoRef.current) return null;
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = videoRef.current.videoWidth || 640;
      tempCanvas.height = videoRef.current.videoHeight || 480;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        // Draw the current video frame (flipped horizontally for natural mirroring)
        ctx.translate(tempCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
        return tempCanvas.toDataURL("image/jpeg", 0.7); // 70% quality, around 30KB
      }
    } catch (err) {
      console.error("Failed to capture webcam snapshot:", err);
    }
    return null;
  };

  // 4. Backend Integrity Log Helper
  const logIntegrityEvent = async (eventType: string, details: string) => {
    try {
      const snapshot = captureWebcamSnapshot();
      await fetch(`${API_BASE_URL}/candidates/${candidateIdRef.current}/log-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          confidence: 1.0,
          details: details,
          evidence_snapshot: snapshot,
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
        setIsFullscreen(false);
        addLog("Security Alert: Fullscreen exit detected", "warning");
        logIntegrityEvent("fullscreen_exit", "User exited secure fullscreen mode.");
        incrementMajorEvent("Exited secure fullscreen lock");
      } else {
        setIsFullscreen(true);
      }
    };

    setIsFullscreen(!!document.fullscreenElement);

    // Copy / Paste / Cut detection
    const handleCopy = (e: ClipboardEvent) => {
      addLog("Clipboard Event: Text copy attempt detected", "warning");
      logIntegrityEvent("copy_paste", `Copy event intercepted. Text: "${window.getSelection()?.toString().slice(0, 50)}..."`);
      incrementMajorEvent("Attempted text copy");
    };

    const handlePaste = (e: ClipboardEvent) => {
      addLog("Clipboard Event: Paste block triggered", "warning");
      logIntegrityEvent("copy_paste", "Paste event intercepted.");
      incrementMajorEvent("Attempted text paste");
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

  // Request fullscreen / engage secure lock
  const engageFullscreen = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          addLog("Secure Fullscreen lock engaged.", "info");
        })
        .catch((err) => {
          console.error("Fullscreen lock failed:", err);
          addLog("Security Error: Fullscreen access denied.", "danger");
        });
    } else {
      setIsFullscreen(true);
    }
  };

  // Handle answers input changes
  const handleAnswerChange = (val: string) => {
    const currentQ = questions[currentIdx];
    setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
  };

  const handleNext = async () => {
    await handleSubmitAnswer();
    setCurrentIdx((prev) => prev + 1);
  };

  const handlePrevious = async () => {
    await handleSubmitAnswer();
    setCurrentIdx((prev) => prev - 1);
  };

  // Submit single question answer
  const handleSubmitAnswer = async () => {
    const currentQ = questions[currentIdx];
    const val = answers[currentQ.id];

    // Determine if the candidate actually provided an answer
    const isActuallyAnswered = (() => {
      if (!val) return false;
      if (typeof val === "string" && val.trim() === "") return false;
      if (currentQ.type === "coding") {
        const starter = (currentQ.sample_code || "").trim();
        if (val.trim() === starter) return false;
      }
      return true;
    })();

    setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "grading" }));

    try {
      const response = await fetch(`${API_BASE_URL}/candidates/${candidateId}/submit-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: currentQ.id,
          mcq_answer: currentQ.type === "mcq" ? val : null,
          coding_submission: (currentQ.type === "coding" || currentQ.type === "paragraph") ? val : null,
        }),
      });

      if (!response.ok) throw new Error("Grading submission failed.");
      
      addLog(`Graded Answer for: "${currentQ.title}"`, "info");
      setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "success" }));
      setSubmittedAnswers((prev) => ({ ...prev, [currentQ.id]: isActuallyAnswered }));
    } catch (err: any) {
      addLog(`Grading Error: ${err.message}`, "danger");
      setGradingStatus((prev) => ({ ...prev, [currentQ.id]: "error" }));
    }
  };

  // Complete exam
  const handleFinishExam = async () => {
    setIsSubmitting(true);
    await handleSubmitAnswer();

    // Stop audio recording and upload to backend
    const uploadAudioPromise = new Promise<void>((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = async () => {
          if (audioChunksRef.current.length === 0) {
            resolve();
            return;
          }
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("file", audioBlob, "recording.webm");

          try {
            const uploadRes = await fetch(`${API_BASE_URL}/candidates/${candidateId}/upload-audio`, {
              method: "POST",
              body: formData,
            });
            if (uploadRes.ok) {
              console.log("Audio recording uploaded successfully.");
            } else {
              console.error("Audio recording upload failed.");
            }
          } catch (uploadErr) {
            console.error("Error uploading audio recording:", uploadErr);
          }
          resolve();
        };
        mediaRecorderRef.current.stop();
      } else {
        resolve();
      }
    });

    try {
      // Wait for audio upload to complete (with a 4s max timeout)
      await Promise.race([
        uploadAudioPromise,
        new Promise((r) => setTimeout(r, 4000))
      ]);

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

  // Track major security violations (auto-exit if count > maxStrikes)
  const incrementMajorEvent = (reason: string) => {
    majorEventsCountRef.current += 1;
    setMajorEventsCount(majorEventsCountRef.current);
    addLog(`Major Security Violation (${majorEventsCountRef.current}/${maxStrikesRef.current}): ${reason}`, "danger");
    if (majorEventsCountRef.current > maxStrikesRef.current) {
      addLog("CRITICAL FAILURE: Too many major security violations. Automatically ending assessment session...", "danger");
      handleFinishExam();
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
    <div className={`flex flex-col h-screen overflow-hidden relative transition-colors duration-300 ${
      theme === "light" ? "bg-slate-50 text-slate-900" : "bg-slate-950 text-slate-100"
    }`}>
      {/* Camera Covered / Black Feed Warning Banner */}
      {cameraCovered && (
        <div className="bg-red-650 text-white font-mono text-center py-2.5 px-4 text-xs font-bold animate-pulse z-40 relative flex items-center justify-center space-x-2 border-b border-red-500 shadow-[0_4px_12px_rgba(239,68,68,0.25)]">
          <span>⚠️ WARNING: SECURITY FLAG - CAMERA FEED IS COMPLETELY BLACK OR COVERED. PLEASE UNCOVER OR RESET YOUR WEBCAM IMMEDIATELY.</span>
        </div>
      )}

      {/* Secure Fullscreen Lock Overlay */}
      {!isFullscreen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-slate-950/95 items-center justify-center p-6 text-center backdrop-blur-sm">
          {/* Scanlines visual effect */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none opacity-40"></div>
          
          <div className="max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl relative z-10">
            <div className="flex items-center justify-center space-x-2 border-b border-slate-800 pb-4 mb-6">
              <span className="h-3 w-3 rounded-full bg-red-signal animate-pulse"></span>
              <span className="font-mono text-xs tracking-wider text-red-signal uppercase font-bold">Secure Lock Required</span>
            </div>
            
            <div className="mx-auto w-16 h-16 rounded-full bg-red-signal/10 border border-red-signal/30 flex items-center justify-center text-red-signal text-3xl mb-6 font-mono font-bold">
              [!]
            </div>
            
            <h2 className="text-xl font-bold tracking-tight text-white mb-2">Fullscreen Mode Required</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              This assessment is securely monitored. You must run the test in fullscreen mode to start or resume. Exiting fullscreen will log an integrity flag.
            </p>
            
            <button
              onClick={engageFullscreen}
              className="w-full bg-cyan-signal hover:bg-cyan-400 active:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider py-3.5 px-6 rounded-lg text-xs transition duration-150 ease-in-out cursor-pointer hover:shadow-[0_0_15px_rgba(10,235,255,0.4)]"
            >
              Engage Secure Lock & Start
            </button>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <header className={`flex items-center justify-between px-6 py-4 border-b transition-colors duration-300 ${
        theme === "light" ? "bg-white border-slate-200 text-slate-900" : "bg-slate-900 border-slate-800 text-white"
      }`}>
        <div>
          <h2 className={`text-lg font-bold flex items-center space-x-2 ${theme === "light" ? "text-slate-900" : "text-white"}`}>
            <span>Assessment Room</span>
            <span className={`text-xs border px-2 py-0.5 rounded font-mono ${
              theme === "light" 
                ? "bg-slate-100 text-indigo-600 border-slate-200" 
                : "bg-slate-850 text-cyan-signal border-slate-700"
            }`}>
              ACTIVE SESSION
            </span>
          </h2>
          <p className={`text-xs font-mono ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
            Candidate ID: {candidateId} {candidate && `| Name: ${candidate.name}`} {candidate?.domain && `| Track: ${candidate.domain}`}
          </p>
        </div>

        {majorEventsCount > 0 && (
          <div className="hidden md:flex items-center space-x-2 bg-red-500/10 border border-red-500/30 px-3.5 py-1.5 rounded-lg text-xs font-mono text-red-signal animate-pulse select-none">
            <span>⚠️ VIOLATION WARNING: {majorEventsCount}/{maxStrikes} MAJOR EVENTS</span>
          </div>
        )}

        {/* Timer & Controls Box */}
        <div className="flex items-center space-x-4">
          {/* Question specific timer */}
          {questionTimeRemaining !== null && (
            <div className={`flex items-center space-x-2.5 border px-3.5 py-1.5 rounded-lg text-xs font-mono select-none ${
              theme === "light" 
                ? "bg-amber-50 border-amber-200 text-amber-700" 
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}>
              <span>⏳ QUESTION TIMER: {formatTime(questionTimeRemaining)}</span>
            </div>
          )}

          {/* Overall test timer */}
          {timeRemaining !== null && (
            <div className={`flex items-center space-x-2.5 border px-3.5 py-1.5 rounded-lg text-xs font-mono select-none ${
              theme === "light" 
                ? "bg-slate-100 border-slate-200 text-slate-700" 
                : "bg-slate-800/40 border-slate-850 text-slate-300"
            }`}>
              <span className={`h-2 w-2 rounded-full ${timeRemaining < 180 ? 'bg-red-signal animate-pulse' : 'bg-green-signal animate-pulse'}`}></span>
              <span>TEST TIMER: {formatTime(timeRemaining)}</span>
            </div>
          )}

          {/* Theme Selector */}
          <button
            onClick={() => handleThemeChange(theme === "light" ? "dark" : "light")}
            className={`text-xs px-3 py-1.5 rounded cursor-pointer transition font-mono uppercase flex items-center space-x-1 border ${
              theme === "light" 
                ? "bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-700" 
                : "bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300"
            }`}
          >
            <span>{theme === "light" ? "🌙 Dark" : "🌞 Light"}</span>
          </button>

          <button
            onClick={engageFullscreen}
            className={`text-xs px-3 py-1.5 rounded cursor-pointer transition font-mono uppercase border ${
              theme === "light" 
                ? "bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-700" 
                : "bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300"
            }`}
          >
            Fullscreen
          </button>

          <button
            onClick={handleFinishExam}
            disabled={isSubmitting}
            className="bg-red-signal/20 hover:bg-red-signal/30 text-red-signal border border-red-signal/30 text-xs px-4 py-1.5 rounded font-bold uppercase tracking-wider cursor-pointer transition disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Finish"}
          </button>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Proctoring Panel (Control Room console) */}
        <aside className={`w-80 border-r flex flex-col overflow-hidden transition-colors duration-300 ${
          theme === "light" ? "bg-white border-slate-200" : "bg-slate-900/60 border-slate-800"
        }`}>
          {/* Webcam Block */}
          <div className={`p-4 border-b ${theme === "light" ? "border-slate-200" : "border-slate-800"}`}>
            <div className={`text-[10px] uppercase font-bold tracking-wider font-mono mb-2 ${
              theme === "light" ? "text-slate-400" : "text-slate-500"
            }`}>
              Proctor Camera Feed
            </div>
            <div className={`relative w-full aspect-video rounded-lg overflow-hidden border flex items-center justify-center transition-colors duration-300 ${
              theme === "light" ? "bg-slate-100 border-slate-200" : "bg-slate-950 border-slate-800"
            }`}>
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
              <div className={`absolute top-2 left-2 flex items-center space-x-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase border tracking-wider transition-colors duration-300 ${
                proctorStatus === "danger" 
                  ? "border-red-500/50 text-red-400" 
                  : proctorStatus === "warning" 
                  ? "border-amber-500/50 text-amber-400 font-bold" 
                  : "border-cyan-500/30 text-cyan-signal"
              } ${theme === "light" ? "bg-white/95 shadow-sm" : "bg-slate-950/90"}`}>
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
            <div className={`text-[10px] uppercase font-bold tracking-wider font-mono mb-2 ${
              theme === "light" ? "text-slate-400" : "text-slate-500"
            }`}>
              Real-time Integrity Console
            </div>
            <div className={`flex-1 rounded-lg border p-3 font-mono text-[10px] leading-relaxed overflow-y-auto space-y-2 flex flex-col-reverse transition-colors duration-300 ${
              theme === "light" ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-slate-950/90 border-slate-850 text-slate-300"
            }`}>
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-8">Initializing telemetry logs...</div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`border-b pb-1.5 transition-colors duration-300 ${
                      theme === "light" ? "border-slate-200" : "border-slate-900"
                    } ${
                      log.type === "danger"
                        ? "text-red-signal font-bold"
                        : log.type === "warning"
                        ? "text-amber-signal font-bold"
                        : theme === "light" ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    <span className="text-slate-500 mr-1.5">[{log.time}]</span>
                    {log.event}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Center Assessment Panel */}
        {questions.length === 0 ? (
          <main className={`flex-1 flex items-center justify-center transition-colors duration-300 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-955'}`}>
            <div className="flex flex-col items-center space-y-4">
              <span className="h-8 w-8 border-4 border-cyan-signal border-t-transparent rounded-full animate-spin"></span>
              <p className={`font-mono text-sm ${theme === 'light' ? 'text-slate-605' : 'text-slate-400'}`}>Decrypting exam payload...</p>
            </div>
          </main>
        ) : !cameraActive ? (
          <main className={`flex-1 flex flex-col items-center justify-center text-center p-8 relative z-50 transition-colors duration-300 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950'}`}>
            <div className={`max-w-md border rounded-xl p-8 shadow-2xl transition-colors duration-300 ${theme === 'light' ? 'bg-white border-red-200' : 'bg-slate-900 border-red-500/30'}`}>
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 text-3xl mb-6 animate-pulse">
                ✕
              </div>
              <h1 className={`text-xl font-bold tracking-tight mb-2 font-mono ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Webcam Access Required</h1>
              <p className={`text-sm mb-6 leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                This secured exam requires active webcam invigilation. 
                Camera access is currently blocked or unavailable. Please grant permissions and turn on your camera.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-red-500/20 hover:bg-red-500/35 text-red-405 border border-red-500/30 font-bold uppercase tracking-wider py-3 px-6 rounded-lg text-xs transition cursor-pointer font-mono"
              >
                Re-initialize Camera Link
              </button>
            </div>
          </main>
        ) : (
          <main className={`flex-1 flex flex-row overflow-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950'}`}>
            {/* Collapsible Questions Sidebar */}
            {isSidebarOpen && (
              <aside className={`w-64 border-r flex flex-col shrink-0 transition-colors duration-300 font-mono text-xs select-none ${
                theme === "light" 
                  ? "bg-white border-slate-200 text-slate-800 shadow-sm" 
                  : "bg-slate-900/40 border-slate-850 text-slate-250"
              }`}>
                <div className={`p-4 border-b flex justify-between items-center transition-colors duration-300 ${
                  theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                }`}>
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    📋 Question List
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="text-slate-500 hover:text-slate-350 p-1 cursor-pointer transition text-[10px] font-bold"
                    title="Hide Sidebar"
                  >
                    ← Hide
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {questions.map((q, idx) => {
                    const isSelected = currentIdx === idx;
                    const isAnswered = submittedAnswers[q.id];
                    const isFlagged = flaggedQuestions[q.id];
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIdx(idx)}
                        className={`w-full p-3 rounded-xl border text-left transition-all duration-200 flex flex-col gap-1.5 cursor-pointer relative ${
                          isSelected
                            ? theme === "light"
                              ? "bg-indigo-50/85 border-indigo-300 text-indigo-900 font-bold shadow-sm"
                              : "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold shadow-md shadow-cyan-500/5"
                            : isFlagged
                              ? theme === "light"
                                ? "bg-amber-50 border-amber-300 text-amber-900 shadow-sm"
                                : "bg-amber-500/5 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                              : isAnswered
                                ? theme === "light"
                                  ? "bg-green-50 border-green-200 text-slate-800"
                                  : "bg-green-950/5 border-green-900/20 text-slate-350 hover:bg-green-950/10"
                                : theme === "light"
                                  ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                                  : "bg-[#0B0F19]/40 hover:bg-slate-900/60 border-slate-850 text-slate-400 hover:text-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[10px] font-bold">
                            Question {idx + 1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isFlagged && (
                              <span className="text-[10px]" title="Flagged for review">🚩</span>
                            )}
                            <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase border ${
                              isAnswered
                                ? "bg-green-500/10 text-green-450 border-green-500/20"
                                : isFlagged
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-slate-500/10 text-slate-400 border-slate-850"
                            }`}>
                              {isAnswered ? "✓ Done" : isFlagged ? "Review" : "Pending"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="truncate text-[10px] w-full font-bold">
                          {q.title}
                        </div>

                        <div className="flex items-center gap-1.5 text-[8px] text-slate-500 font-bold">
                          <span className="uppercase">{q.type}</span>
                          <span>•</span>
                          <span className="uppercase">{q.difficulty}</span>
                          <span>•</span>
                          <span>{q.points} PTS</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

            {/* Main Current Question View Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {!isSidebarOpen && (
                <div className={`px-6 py-2.5 border-b flex items-center transition-colors duration-300 ${
                  theme === "light" ? "bg-white border-slate-200" : "bg-[#0B0F19] border-slate-850"
                }`}>
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className={`px-3 py-1 text-xs font-mono rounded border flex items-center gap-1.5 transition cursor-pointer font-bold ${
                      theme === "light"
                        ? "bg-slate-50 hover:bg-slate-100 border-slate-250 text-slate-700"
                        : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-350"
                    }`}
                  >
                    📂 Show Questions List ({questions.filter(q => submittedAnswers[q.id]).length}/{questions.length} done)
                  </button>
                </div>
              )}

              {/* Current Question View */}
              <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className={`flex items-start justify-between border-b pb-4 mb-4 ${theme === 'light' ? 'border-slate-200' : 'border-slate-850'}`}>
                <div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
                    <span>Question {currentIdx + 1} of {questions.length} | {currentQuestion.points} Points</span>
                    {currentQuestion.time_limit && questionTimeRemaining !== null && (
                      <span className="text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded">
                        ⏳ {formatTime(questionTimeRemaining)} left
                      </span>
                    )}
                  </span>
                  <h3 className={`text-xl font-bold mt-1 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{currentQuestion.title}</h3>
                </div>
                <div className="flex items-center space-x-2 shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setFlaggedQuestions(prev => ({
                        ...prev,
                        [currentQuestion.id]: !prev[currentQuestion.id]
                      }));
                    }}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                      flaggedQuestions[currentQuestion.id]
                        ? "bg-amber-550/20 text-amber-400 border border-amber-500/35 hover:bg-amber-500/25 shadow-sm"
                        : theme === "light"
                          ? "bg-slate-50 hover:bg-slate-100 border border-slate-250 text-slate-600"
                          : "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400"
                    }`}
                  >
                    {flaggedQuestions[currentQuestion.id] ? "🚩 Flagged" : "🏳️ Flag for Review"}
                  </button>
                  
                  <span className={`px-2 py-1 text-[9px] font-mono font-bold tracking-wider rounded uppercase border ${
                    currentQuestion.difficulty === 'easy'
                      ? 'bg-green-signal/10 text-green-signal border-green-signal/20'
                      : 'bg-amber-signal/10 text-amber-signal border-amber-signal/20'
                  }`}>
                    {currentQuestion.difficulty}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className={`text-sm leading-relaxed mb-6 font-sans whitespace-pre-line ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                          className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition select-none ${
                            isSelected
                              ? theme === "light"
                                ? "border-indigo-500 bg-indigo-50/50 text-slate-905"
                                : "border-cyan-signal/60 bg-cyan-signal/5 text-white"
                              : theme === "light"
                              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50"
                              : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                          }`}
                        >
                          <span className={`h-6 w-6 rounded border flex items-center justify-center text-xs font-mono font-bold ${
                            isSelected 
                              ? theme === "light"
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-cyan-signal text-slate-950 border-cyan-signal' 
                              : theme === "light"
                              ? 'border-slate-300 text-slate-500'
                              : 'border-slate-700 text-slate-500'
                          }`}>
                            {letter}
                          </span>
                          <span className="text-sm font-mono">{choice}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : currentQuestion.type === "paragraph" ? (
                  <div className={`flex-1 flex flex-col border rounded-lg overflow-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                    <div className={`px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-500 select-none border-b ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                      <span>Written Response</span>
                      <span>Text Mode</span>
                    </div>
                    <textarea
                      className={`flex-1 text-sm p-4 w-full h-full focus:outline-none resize-none leading-relaxed transition-colors duration-300 ${theme === 'light' ? 'bg-white text-slate-800' : 'bg-slate-950 text-slate-200'}`}
                      value={answers[currentQuestion.id] || ""}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Type your response here..."
                    />
                  </div>
                ) : (
                  <div className={`flex-1 flex flex-col border rounded-lg overflow-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                    {/* Code Editor Header */}
                    <div className={`px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-500 select-none border-b ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                      <span>main.py</span>
                      <span>Python 3.x</span>
                    </div>
                    {/* Textarea Code Editor */}
                    <textarea
                      spellCheck={false}
                      className={`flex-1 font-mono text-sm p-4 w-full h-full focus:outline-none resize-none leading-relaxed transition-colors duration-300 ${theme === 'light' ? 'bg-white text-slate-800' : 'bg-slate-950 text-slate-200'}`}
                      value={answers[currentQuestion.id] || ""}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Write your python function here..."
                    />
                  </div>
                )}
              </div>

              {/* grading feedback panel */}
              <div className={`mt-6 flex items-center justify-between p-4 border rounded-lg transition-colors duration-300 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-850'
              }`}>
                <div className={`text-xs font-mono ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                  {gradingStatus[currentQuestion.id] === "grading" ? (
                    <span className="text-cyan-signal animate-pulse font-bold">Running test suite cases...</span>
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
                      onClick={handlePrevious}
                      className={`font-mono text-xs px-4 py-2 rounded cursor-pointer transition border ${
                        theme === 'light' 
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-700' 
                          : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300'
                      }`}
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
                      onClick={handleNext}
                      className={`font-mono text-xs px-4 py-2 rounded cursor-pointer transition border ${
                        theme === 'light' 
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-700' 
                          : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300'
                      }`}
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
          </div>
        </main>
        )}
      </div>
    </div>
  );
}
