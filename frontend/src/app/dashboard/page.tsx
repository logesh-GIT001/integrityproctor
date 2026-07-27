"use client";

import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "@/config";

interface Candidate {
  id: number;
  sec_id?: string;
  name: string;
  email: string;
  status: string; // invited, testing, completed, blocked
  trust_score: number;
  technical_score: number;
  ai_summary: string | null;
  domain?: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Question {
  id: number;
  type: string;
  title: string;
  description: string;
  difficulty: string;
  points: number;
  choices: string[] | null;
}

interface Answer {
  id: number;
  question_id: number;
  mcq_answer: string | null;
  coding_submission: string | null;
  is_correct: boolean | null;
  points_earned: number;
  graded_at: string;
  question?: Question | null;
}

interface IntegrityEvent {
  id: number;
  event_type: string;
  timestamp: string;
  confidence: number;
  evidence_snapshot_path: string | null;
  details: string | null;
}

export default function Dashboard() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Candidate Data & Selection
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const [report, setReport] = useState<{
    candidate: Candidate;
    answers: Answer[];
    events: IntegrityEvent[];
  } | null>(null);

  // Loaders & Submissions
  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [audioMuted, setAudioMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Reset audio state when candidate/audioUrl changes
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error("Audio playback error:", err));
      setAudioPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setAudioCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setAudioDuration(audioRef.current.duration);
  };

  const handleAudioEnded = () => {
    setAudioPlaying(false);
    setAudioCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setAudioCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
    audioRef.current.volume = vol;
    setAudioVolume(vol);
    setAudioMuted(vol === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !audioMuted;
    audioRef.current.muted = newMuted;
    setAudioMuted(newMuted);
    if (newMuted) {
      audioRef.current.volume = 0;
    } else {
      audioRef.current.volume = audioVolume || 0.5;
    }
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "blocked">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Tab View state
  const [activeTab, setActiveTab] = useState<"telemetry" | "questions" | "settings">("telemetry");
  const [questionsSubTab, setQuestionsSubTab] = useState<"ai" | "manual">("ai");
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Admin Credentials Form state
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credentialsSavedMessage, setCredentialsSavedMessage] = useState<string | null>(null);
  const [credentialsErrorMessage, setCredentialsErrorMessage] = useState<string | null>(null);

  // Clear Database state
  const [clearingMessage, setClearingMessage] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // AI Question Generation Form
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [aiDomain, setAiDomain] = useState("General");
  const [customAiDomain, setCustomAiDomain] = useState("");
  const [generatedQuestionSuccess, setGeneratedQuestionSuccess] = useState<string | null>(null);
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [domainFilter, setDomainFilter] = useState<string>("All");

  // Invite Candidate Form States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDomain, setInviteDomain] = useState("General");
  const [customInviteDomain, setCustomInviteDomain] = useState("");
  const [inviteDuration, setInviteDuration] = useState(20);
  const [inviteSuccessData, setInviteSuccessData] = useState<any | null>(null);
  const [invitingCandidate, setInvitingCandidate] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const filteredQuestions = allQuestions.filter(q => {
    if (domainFilter === "All") return true;
    const qDomain = q.domain || "General";
    return qDomain.toLowerCase() === domainFilter.toLowerCase();
  });

  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Global Settings Form
  const [overallDuration, setOverallDuration] = useState(20); // in minutes
  const [enableOverallTimer, setEnableOverallTimer] = useState(true);
  const [maxStrikes, setMaxStrikes] = useState(3);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);

  // Manual Question Creator Form
  const [manualType, setManualType] = useState<"mcq" | "paragraph" | "coding">("mcq");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDomain, setManualDomain] = useState("General");
  const [customManualDomain, setCustomManualDomain] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDifficulty, setManualDifficulty] = useState("medium");
  const [manualPoints, setManualPoints] = useState(10);
  const [manualTimeLimit, setManualTimeLimit] = useState("");
  const [mcqChoices, setMcqChoices] = useState(["", "", "", ""]);
  const [mcqCorrect, setMcqCorrect] = useState("A");
  const [starterCode, setStarterCode] = useState("");
  const [testCasesStr, setTestCasesStr] = useState("");
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  // Verify auth and theme on mount
  useEffect(() => {
    const auth = sessionStorage.getItem("hr_logged_in");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
    const savedTheme = localStorage.getItem("dashboard_theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const storedUser = localStorage.getItem("admin_username") || "admin";
    const storedPass = localStorage.getItem("admin_password") || "password123";
    if (username.trim() === storedUser && password === storedPass) {
      sessionStorage.setItem("hr_logged_in", "true");
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError(`Invalid credentials. Try using ${storedUser} / ${storedPass}.`);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("hr_logged_in");
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
  };

  // 1. Fetch Candidates List
  const fetchCandidates = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
        if (data.length > 0 && selectedIdRef.current === null) {
          setSelectedId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load candidates", err);
    } finally {
      setLoadingList(false);
    }
  };

  // 2. Fetch Selected Candidate Report
  const fetchReport = async (candidateId: number, isPoll: boolean = false) => {
    if (!isPoll) {
      setLoadingReport(true);
      setAudioUrl(null);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${candidateId}/report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
      
      const audioRes = await fetch(`${API_BASE_URL}/candidates/${candidateId}/audio`);
      if (audioRes.ok) {
        const audioData = await audioRes.json();
        if (audioData.has_audio) {
          setAudioUrl(audioData.audio_url.startsWith("http") ? audioData.audio_url : `${API_BASE_URL}${audioData.audio_url}`);
        } else {
          setAudioUrl(null);
        }
      } else {
        setAudioUrl(null);
      }
    } catch (err) {
      console.error("Failed to load report", err);
    } finally {
      if (!isPoll) {
        setLoadingReport(false);
      }
    }
  };

  // 1b. Polling Candidates List
  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchCandidates();
    fetchAllQuestions();
    
    const interval = setInterval(() => {
      fetchCandidates();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // 2b. Polling Selected Candidate Report
  useEffect(() => {
    if (!isAuthenticated || selectedId === null) return;
    
    fetchReport(selectedId, false);
    
    const interval = setInterval(() => {
      fetchReport(selectedId, true);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [selectedId, isAuthenticated]);

  // 3. Trigger AI Summary
  const handleGenerateAISummary = async () => {
    if (!selectedId) return;
    setGeneratingAI(true);
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${selectedId}/ai-summary`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
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
        fetchCandidates();
      }
    } catch (err) {
      console.error("Failed to generate AI summary", err);
    } finally {
      setGeneratingAI(false);
    }
  };

  // 4. Toggle Candidate Block
  const handleToggleBlock = async (candidateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${candidateId}/toggle-block`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidateId ? { ...c, status: data.new_status } : c))
        );
        if (selectedId === candidateId) {
          setReport((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              candidate: {
                ...prev.candidate,
                status: data.new_status,
              },
            };
          });
        }
      }
    } catch (err) {
      console.error("Failed to toggle block status", err);
    }
  };

  const handleResetSession = async (candidateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to reset this candidate's exam session? This will clear all recorded answers, grading statuses, telemetry events, and reset their status to 'invited' so they can take the test again.")) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${candidateId}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        alert("Session successfully reset!");
        fetchCandidates();
        if (selectedId === candidateId) {
          setReport((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              candidate: {
                ...prev.candidate,
                status: "invited",
                trust_score: 100.0,
                technical_score: 0.0,
                started_at: null,
                completed_at: null,
              },
              answers: [],
              events: [],
            };
          });
        }
      } else {
        alert("Failed to reset session.");
      }
    } catch (err) {
      console.error(err);
      alert("Error connecting to server.");
    }
  };

  // 5. Delete Candidate Record
  const handleDeleteCandidate = async (candidateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this candidate's logs and data? This action cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${candidateId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        if (selectedId === candidateId) {
          setSelectedId(null);
          setReport(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete candidate", err);
    }
  };

  // 5b. Manage Questions Data
  const fetchAllQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const res = await fetch(`${API_BASE_URL}/questions`);
      if (res.ok) {
        const data = await res.json();
        setAllQuestions(data);
      }
    } catch (err) {
      console.error("Failed to load questions", err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleDeleteQuestion = async (qId: number) => {
    if (!confirm("Are you sure you want to delete this question? New candidates will not see it.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/questions/${qId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAllQuestions((prev) => prev.filter((q) => q.id !== qId));
        setSelectedQuestionIds((prev) => prev.filter((id) => id !== qId));
      } else {
        alert("Failed to delete question.");
      }
    } catch (err) {
      console.error("Failed to delete question", err);
    }
  };

  const toggleSelectQuestion = (qId: number) => {
    setSelectedQuestionIds(prev => 
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const handleSelectAllQuestions = (selectAll: boolean) => {
    if (selectAll) {
      const filteredIds = filteredQuestions.map(q => q.id);
      setSelectedQuestionIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    } else {
      const filteredIds = filteredQuestions.map(q => q.id);
      setSelectedQuestionIds(prev => prev.filter(id => !filteredIds.includes(id)));
    }
  };

  const handleDeleteSelectedQuestions = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedQuestionIds.length} selected questions?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/questions/delete-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedQuestionIds })
      });
      if (res.ok) {
        setSelectedQuestionIds([]);
        fetchAllQuestions();
      } else {
        alert("Failed to delete selected questions.");
      }
    } catch (err) {
      console.error("Failed to delete selected questions", err);
    }
  };

  const handleDeleteAllQuestions = async () => {
    if (!confirm("Are you sure you want to delete ALL questions from the active pool? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/questions`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSelectedQuestionIds([]);
        fetchAllQuestions();
      } else {
        alert("Failed to clear active question pool.");
      }
    } catch (err) {
      console.error("Failed to delete all questions", err);
    }
  };

  // Edit Question Handlers & State
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [isUpdatingQuestion, setIsUpdatingQuestion] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const handleStartEditQuestion = async (qId: number) => {
    setEditError(null);
    setEditSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/questions/${qId}`);
      if (res.ok) {
        const qData = await res.json();
        
        // Initialize MCQ correct answer index mapping
        let correctIdx = 0;
        let choices = qData.choices;
        if (qData.type === "mcq") {
          choices = qData.choices || ["", "", "", ""];
          const foundIdx = choices.indexOf(qData.correct_answer);
          correctIdx = foundIdx !== -1 ? foundIdx : 0;
        }
        
        // Initialize coding test cases string
        let testCasesStrVal = "";
        if (qData.type === "coding" && qData.test_cases) {
          testCasesStrVal = JSON.stringify(qData.test_cases, null, 2);
        }

        // Initialize domain dropdown mapping
        const standardDomains = ["General", "Frontend", "Backend", "Fullstack", "Data Science"];
        const qDomain = qData.domain || "General";
        const dropdownDomain = standardDomains.includes(qDomain) ? qDomain : "Other";
        const customDomain = dropdownDomain === "Other" ? qDomain : "";

        setEditingQuestion({
          ...qData,
          choices,
          correct_index: correctIdx,
          test_cases_str: testCasesStrVal,
          dropdown_domain: dropdownDomain,
          custom_domain: customDomain,
        });
      } else {
        alert("Failed to load question details for editing.");
      }
    } catch (err) {
      console.error("Failed to fetch question for editing", err);
      alert("Error connecting to server.");
    }
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    if (!editingQuestion.title?.trim() || !editingQuestion.description?.trim()) {
      setEditError("Title and description are required.");
      return;
    }

    if (editingQuestion.dropdown_domain === "Other" && !editingQuestion.custom_domain?.trim()) {
      setEditError("Please type a custom domain.");
      return;
    }

    setIsUpdatingQuestion(true);
    setEditError(null);
    setEditSuccess(null);

    const finalDomain = editingQuestion.dropdown_domain === "Other"
      ? editingQuestion.custom_domain.trim()
      : editingQuestion.dropdown_domain;

    let payload: any = {
      type: editingQuestion.type,
      title: editingQuestion.title.trim(),
      description: editingQuestion.description.trim(),
      difficulty: editingQuestion.difficulty,
      points: editingQuestion.points,
      time_limit: editingQuestion.time_limit ? parseInt(editingQuestion.time_limit.toString()) : null,
      domain: finalDomain || "General",
    };

    if (editingQuestion.type === "mcq") {
      if (editingQuestion.choices.some((choice: string) => !choice.trim())) {
        setEditError("Please fill out all choice options.");
        setIsUpdatingQuestion(false);
        return;
      }
      payload.choices = editingQuestion.choices.map((c: string) => c.trim());
      payload.correct_answer = payload.choices[editingQuestion.correct_index];
    } else if (editingQuestion.type === "coding") {
      payload.sample_code = editingQuestion.sample_code?.trim() || null;
      if (editingQuestion.test_cases_str?.trim()) {
        try {
          payload.test_cases = JSON.parse(editingQuestion.test_cases_str);
        } catch (e) {
          setEditError("Invalid JSON format in test cases field. Make sure it matches list of objects format.");
          setIsUpdatingQuestion(false);
          return;
        }
      } else {
        payload.test_cases = null;
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/questions/${editingQuestion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditSuccess("Question updated successfully!");
        setTimeout(() => {
          setEditingQuestion(null);
        }, 1000);
        fetchAllQuestions();
      } else {
        const err = await res.json();
        setEditError(err.detail || "Failed to update question.");
      }
    } catch (err) {
      console.error(err);
      setEditError("Error connecting to server.");
    } finally {
      setIsUpdatingQuestion(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/settings/overall_time_limit`);
      if (res.ok) {
        const data = await res.json();
        if (data.value) {
          const seconds = parseInt(data.value);
          setOverallDuration(Math.round(seconds / 60));
          setEnableOverallTimer(true);
        } else {
          setEnableOverallTimer(false);
        }
      }
      const strikesRes = await fetch(`${API_BASE_URL}/settings/max_strikes`);
      if (strikesRes.ok) {
        const data = await strikesRes.json();
        if (data.value) {
          setMaxStrikes(parseInt(data.value) || 3);
        }
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSavedMessage(null);
    const value = enableOverallTimer ? (overallDuration * 60).toString() : null;
    try {
      const res = await fetch(`${API_BASE_URL}/settings/overall_time_limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const strikesRes = await fetch(`${API_BASE_URL}/settings/max_strikes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: maxStrikes.toString() }),
      });
      if (res.ok && strikesRes.ok) {
        setSettingsSavedMessage("Overall test settings successfully saved & synced!");
        setTimeout(() => setSettingsSavedMessage(null), 4000);
      } else {
        setSettingsSavedMessage("Failed to save settings.");
      }
    } catch (err) {
      console.error("Failed to save settings", err);
      setSettingsSavedMessage("Failed to save settings.");
    }
  };

  const handleCreateManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualDescription) {
      setManualError("Title and description are required.");
      return;
    }

    if (manualDomain === "Other" && !customManualDomain.trim()) {
      setManualError("Please type a custom domain.");
      return;
    }

    setCreatingManual(true);
    setManualSuccess(null);
    setManualError(null);

    let payload: any = {
      type: manualType,
      title: manualTitle.trim(),
      description: manualDescription.trim(),
      difficulty: manualDifficulty,
      points: manualPoints,
      time_limit: manualTimeLimit ? parseInt(manualTimeLimit) : null,
      domain: manualDomain === "Other" ? customManualDomain.trim() : manualDomain,
    };

    if (manualType === "mcq") {
      if (mcqChoices.some((choice) => !choice.trim())) {
        setManualError("Please fill out all 4 choice options.");
        setCreatingManual(false);
        return;
      }
      payload.choices = mcqChoices.map(c => c.trim());
      const correctIdx = mcqCorrect.charCodeAt(0) - 65;
      payload.correct_answer = payload.choices[correctIdx];
    } else if (manualType === "coding") {
      payload.sample_code = starterCode.trim() || null;
      if (testCasesStr.trim()) {
        try {
          payload.test_cases = JSON.parse(testCasesStr);
        } catch (e) {
          setManualError("Invalid JSON format in test cases field. Make sure it matches list of objects format.");
          setCreatingManual(false);
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setManualSuccess("Question successfully created and published!");
        setManualTitle("");
        setManualDescription("");
        setManualTimeLimit("");
        setMcqChoices(["", "", "", ""]);
        setStarterCode("");
        setTestCasesStr("");
        setManualDomain("General");
        setCustomManualDomain("");
        fetchAllQuestions();
      } else {
        const err = await res.json();
        setManualError(err.detail || "Failed to create question.");
      }
    } catch (err) {
      console.error(err);
      setManualError("Error connecting to server.");
    } finally {
      setCreatingManual(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && activeTab === "questions") {
      fetchAllQuestions();
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
    }
  }, [isAuthenticated]);

  // 6. Submit AI Question Generator Form
  const handleGenerateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionPrompt.trim()) return;
    
    if (aiDomain === "Other" && !customAiDomain.trim()) {
      setGeneratedQuestionSuccess("Error: Please specify custom domain/track.");
      return;
    }

    setGeneratingQuestion(true);
    setGeneratedQuestionSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/questions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: questionPrompt, domain: aiDomain === "Other" ? customAiDomain.trim() : aiDomain }),
      });
      if (res.ok) {
        const data = await res.json();
        const count = data.count || 1;
        setGeneratedQuestionSuccess(
          count > 1 
            ? `Successfully processed batch! ${count} questions were created and added to the test portal.`
            : `Successfully processed! Question "${data.question.title}" (${data.question.type.toUpperCase()}) was created and added to the test portal.`
        );
        setQuestionPrompt("");
        setCustomAiDomain("");
        setAiDomain("General");
        fetchAllQuestions();
      } else {
        const err = await res.json();
        setGeneratedQuestionSuccess(`Server Error: ${err.detail || "Failed to process question."}`);
      }
    } catch (err) {
      console.error("Failed to generate question", err);
      setGeneratedQuestionSuccess("Error connecting to server. Please ensure the backend server is running.");
    } finally {
      setGeneratingQuestion(false);
    }
  };

  const handleInviteCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError("Name and email are required.");
      return;
    }
    if (inviteDomain === "Other" && !customInviteDomain.trim()) {
      setInviteError("Please specify a custom track.");
      return;
    }

    setInvitingCandidate(true);
    setInviteError(null);
    setInviteSuccessData(null);

    const payload = {
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      domain: inviteDomain === "Other" ? customInviteDomain.trim() : inviteDomain,
      overall_time_limit: inviteDuration * 60, // Convert minutes to seconds
    };

    try {
      const res = await fetch(`${API_BASE_URL}/candidates/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setInviteSuccessData(data);
        setIsInviteModalOpen(false);
        setInviteName("");
        setInviteEmail("");
        setInviteDomain("General");
        setCustomInviteDomain("");
        setInviteDuration(20);
        fetchCandidates();
      } else {
        const err = await res.json();
        setInviteError(err.detail || "Failed to generate invite code.");
      }
    } catch (err) {
      console.error(err);
      setInviteError("Error connecting to server.");
    } finally {
      setInvitingCandidate(false);
    }
  };

  const handleUpdateCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialsSavedMessage(null);
    setCredentialsErrorMessage(null);

    const storedPass = localStorage.getItem("admin_password") || "password123";
    if (currentPassword !== storedPass) {
      setCredentialsErrorMessage("Current password is incorrect.");
      return;
    }

    if (!newUsername.trim() || !newPassword) {
      setCredentialsErrorMessage("Username and password cannot be empty.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredentialsErrorMessage("Passwords do not match.");
      return;
    }
    localStorage.setItem("admin_username", newUsername.trim());
    localStorage.setItem("admin_password", newPassword);
    setCredentialsSavedMessage("HR Login Credentials updated successfully!");
    setNewUsername("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setCredentialsSavedMessage(null), 4000);
  };

  const handleClearDatabase = async () => {
    const storedPass = localStorage.getItem("admin_password") || "password123";
    const passwordInput = prompt("🔑 SECURITY VERIFICATION:\nPlease enter your admin password to authorize resetting all database records:");
    
    if (passwordInput === null) {
      return;
    }
    
    if (passwordInput !== storedPass) {
      alert("❌ Authentication failed: Incorrect password. Database reset aborted.");
      return;
    }

    if (!confirm("⚠️ WARNING: This will permanently delete all candidate test records, answers, and webcam snapshots! This action cannot be undone. Do you want to proceed?")) {
      return;
    }
    setIsClearing(true);
    setClearingMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/settings/clear-all`, {
        method: "POST",
      });
      if (res.ok) {
        setClearingMessage("All candidate records and proctoring databases have been purged.");
        setCandidates([]);
        setSelectedId(null);
        setReport(null);
        setTimeout(() => setClearingMessage(null), 5000);
      } else {
        setClearingMessage("Failed to purge database.");
      }
    } catch (err) {
      console.error(err);
      setClearingMessage("Error connecting to server to purge database.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    localStorage.setItem("dashboard_theme", newTheme);
  };

  const handleManualStrike = async () => {
    if (!selectedId) return;
    if (!confirm("Add a manual security strike to this candidate? This will deduct 10 points from their trust score.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/candidates/${selectedId}/log-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "speaking_no_movement",
          confidence: 1.0,
          details: "Manual integrity flag logged by HR reviewer during workspace auditing."
        })
      });
      if (res.ok) {
        fetchCandidates();
        fetchReport(selectedId, true);
      } else {
        alert("Failed to add manual strike.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // CSV Export Utility
  const exportToCSV = () => {
    const headers = ["ID", "Name", "Email", "Domain", "Status", "Trust Score", "Technical Score", "Created At", "Completed At"];
    const rows = candidates.map(c => [
      c.id,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${(c.domain || "General").replace(/"/g, '""')}"`,
      c.status,
      c.trust_score,
      c.technical_score,
      c.created_at,
      c.completed_at || "N/A"
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `candidates_summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper templates loader
  const loadTemplate = (type: "mcq" | "coding") => {
    if (type === "mcq") {
      setQuestionPrompt(
        "What does the JS expression `typeof NaN` return?\n" +
        "A) 'number'\n" +
        "B) 'NaN'\n" +
        "C) 'undefined'\n" +
        "D) 'object'\n" +
        "Correct Answer: A"
      );
    } else {
      setQuestionPrompt(
        "Write a Python function find_primes(n: int) -> list[int] that returns all prime numbers up to n.\n" +
        "Include starter code: `def find_primes(n: int) -> list[int]:`"
      );
    }
  };

  // Helper formatting functions
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " " + d.toLocaleDateString();
  };

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400 border-emerald-500/25 bg-emerald-500/5";
    if (score >= 50) return "text-amber-400 border-amber-500/25 bg-amber-500/5";
    return "text-rose-400 border-rose-500/25 bg-rose-500/5";
  };

  const getPresentedQuestionsCount = (candDomain: string | undefined | null) => {
    const domain = (candDomain || "General").trim().toLowerCase();
    return allQuestions.filter(q => {
      if (!q.domain || q.domain.trim() === "") {
        return true;
      }
      const qDomain = q.domain.trim().toLowerCase();
      return qDomain === domain || qDomain === "general";
    }).length;
  };

  const getTrustBadgeBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Filter Logic
  const filteredCandidates = candidates.filter((c) => {
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = c.status === "testing" || c.status === "invited";
    } else if (statusFilter === "completed") {
      matchesStatus = c.status === "completed";
    } else if (statusFilter === "blocked") {
      matchesStatus = c.status === "blocked";
    }

    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  // KPI calculations
  const totalCount = candidates.length;
  const activeCount = candidates.filter(c => c.status === "testing" || c.status === "invited").length;
  const completedCount = candidates.filter(c => c.status === "completed").length;
  const blockedCount = candidates.filter(c => c.status === "blocked").length;

  // --- UNAUTHENTICATED LOGIN SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen bg-[#070A13] items-center justify-center px-4 relative overflow-hidden font-sans">
        {/* Modern Tech Background Elements */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.4)_50%),linear-gradient(90deg,rgba(10,235,255,0.03),rgba(99,102,241,0.01),rgba(10,235,255,0.03))] bg-[size:100%_4px,4px_100%] pointer-events-none opacity-30"></div>
        <div className="absolute w-[600px] h-[600px] bg-gradient-to-tr from-cyan-500/10 to-indigo-500/5 blur-[120px] rounded-full top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 relative z-10 shadow-[0_0_50px_0_rgba(6,182,212,0.15)] transition-all duration-300">
          <div className="text-center mb-8 select-none">
            <div className="inline-flex items-center justify-center p-3.5 bg-cyan-950/40 border border-cyan-800/30 rounded-xl mb-4 text-cyan-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center space-x-2">
              <span>IntegrityProctor</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/30 px-2 py-0.5 rounded font-mono font-normal">
                SECURE ACCESS
              </span>
            </h1>
            <p className="text-slate-400 text-xs mt-2 font-mono">
              Provide credentials to verify system operations authority.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {loginError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-lg text-xs font-mono animate-pulse">
                <strong>[ERROR]</strong> {loginError}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                className="w-full bg-[#0B0F19] border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition font-mono text-sm placeholder:text-slate-700"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full bg-[#0B0F19] border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition font-mono text-sm placeholder:text-slate-700"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold uppercase tracking-wider py-3.5 px-6 rounded-xl text-xs transition duration-150 ease-in-out cursor-pointer shadow-lg shadow-cyan-500/20 flex items-center justify-center active:scale-[0.98]"
            >
              Sign In to HR Suite
            </button>
            <div className="text-center mt-4">
              <p className="text-[10px] text-slate-500 font-mono">
                Hint: admin / password123
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- AUTHENTICATED CONTROL PANEL ---
  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans transition-colors duration-300 ${
      theme === "light" ? "bg-slate-50 text-slate-800" : "bg-[#070A13] text-slate-100"
    }`}>
      
      {/* Top Header */}
      <header className={`px-6 py-4 flex items-center justify-between z-20 shrink-0 border-b transition-colors duration-300 ${
        theme === "light" ? "bg-white border-slate-200/80 shadow-sm" : "bg-slate-900/80 backdrop-blur-md border-slate-800/80"
      }`}>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center space-x-2.5">
            <span className={theme === "light" ? "text-slate-900 font-extrabold" : "bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent"}>IntegrityProctor</span>
            <span className={`text-[9px] border px-2 py-0.5 rounded font-mono font-medium tracking-wide ${
              theme === "light" ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-cyan-950/60 text-cyan-400 border-cyan-800/40"
            }`}>
              ADMIN CONTROL CENTER
            </span>
          </h1>
          <p className={`text-xs mt-0.5 font-mono ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
            Secure proctor node event streams, visual identity telemetry reports, and dynamic assessment designer.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={exportToCSV}
            className={`border text-xs px-3.5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-mono flex items-center space-x-2 ${
              theme === "light"
                ? "bg-slate-100 hover:bg-slate-200 border-slate-350 text-slate-700"
                : "bg-slate-800/50 hover:bg-slate-750 border border-slate-750 text-slate-300 hover:text-white"
            }`}
          >
            <span>📥 Export CSV</span>
          </button>
          
          <button
            onClick={fetchCandidates}
            className={`border text-xs px-3.5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-mono ${
              theme === "light"
                ? "bg-slate-100 hover:bg-slate-200 border-slate-350 text-slate-700"
                : "bg-slate-800/50 hover:bg-slate-750 border border-slate-750 text-slate-300 hover:text-white"
            }`}
          >
            Sync Data
          </button>

          <button
            onClick={handleLogout}
            className={`border text-xs px-3.5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-mono ${
              theme === "light"
                ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 font-bold"
                : "bg-rose-950/20 hover:bg-rose-900/40 border border-rose-900/30 text-rose-400 hover:text-rose-300"
            }`}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* KPI Stats Bar */}
      <section className={`px-6 py-4 flex items-center justify-between select-none shrink-0 gap-4 overflow-x-auto border-b transition-colors duration-300 ${
        theme === "light" ? "bg-white border-slate-200/80" : "bg-slate-900/30 border-b border-slate-850"
      }`}>
        <div className="grid grid-cols-4 gap-8 w-full max-w-5xl">
          
          {/* Card 1: Total */}
          <div className={`flex items-center space-x-4 pr-8 border-r ${theme === "light" ? "border-slate-200" : "border-slate-800/60"}`}>
            <div className={`p-3 border rounded-xl ${theme === "light" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-indigo-500/5 border border-indigo-500/10 text-indigo-400"}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-550 font-mono">Total Candidates</p>
              <h3 className={`text-xl font-bold font-mono mt-0.5 ${theme === "light" ? "text-slate-800" : "text-white"}`}>{totalCount}</h3>
            </div>
          </div>

          {/* Card 2: Active */}
          <div className={`flex items-center space-x-4 pr-8 border-r ${theme === "light" ? "border-slate-200" : "border-slate-800/60"}`}>
            <div className={`p-3 border rounded-xl ${theme === "light" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-cyan-500/5 border border-cyan-500/10 text-cyan-400"}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-550 font-mono">Active Rooms</p>
              <h3 className="text-xl font-bold font-mono text-cyan-500 mt-0.5">{activeCount}</h3>
            </div>
          </div>

          {/* Card 3: Completed */}
          <div className={`flex items-center space-x-4 pr-8 border-r ${theme === "light" ? "border-slate-200" : "border-slate-800/60"}`}>
            <div className={`p-3 border rounded-xl ${theme === "light" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-emerald-500/5 border border-emerald-500/10 text-emerald-400"}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-550 font-mono">Completed</p>
              <h3 className="text-xl font-bold font-mono text-emerald-500 mt-0.5">{completedCount}</h3>
            </div>
          </div>

          {/* Card 4: Blocked */}
          <div className="flex items-center space-x-4">
            <div className={`p-3 border rounded-xl ${theme === "light" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-rose-500/5 border border-rose-500/10 text-rose-400"}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-550 font-mono">Blocked Pools</p>
              <h3 className="text-xl font-bold font-mono text-rose-500 mt-0.5">{blockedCount}</h3>
            </div>
          </div>

        </div>

        {/* View Switcher Tabs */}
        <div className={`p-1 rounded-xl border font-mono text-xs shadow-inner flex transition-colors duration-300 ${
          theme === "light" ? "bg-slate-100 border-slate-200" : "bg-[#0B0F19] border-slate-800"
        }`}>
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`px-5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-bold ${
              activeTab === "telemetry" 
                ? theme === "light"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shadow-md" 
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📊 Candidate Telemetry
          </button>
          <button
            onClick={() => setActiveTab("questions")}
            className={`px-5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-bold ${
              activeTab === "questions" 
                ? theme === "light"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shadow-md" 
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            ✍️ AI Question Hub
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-5 py-2 rounded-lg transition-all duration-150 cursor-pointer font-bold ${
              activeTab === "settings" 
                ? theme === "light"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 shadow-md" 
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            ⚙️ Settings
          </button>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Queue and Filters (Only on Telemetry Tab) */}
        {activeTab === "telemetry" && (
          <aside className={`w-80 border-r flex flex-col overflow-hidden shrink-0 transition-colors duration-300 ${
            theme === "light" ? "bg-white border-slate-200" : "bg-slate-900/10 border-slate-800"
          }`}>
            
            {/* Sidebar Header with Invite Button */}
            <div className={`p-4 border-b flex justify-between items-center transition-colors duration-300 ${
              theme === "light" ? "bg-white border-slate-200" : "bg-[#0B0F19] border-slate-850"
            }`}>
              <span className={`text-[11px] font-bold font-mono uppercase tracking-wider ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                Candidates Queue
              </span>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider font-mono transition cursor-pointer flex items-center gap-1 hover:shadow-[0_0_8px_rgba(10,235,255,0.2)]"
              >
                ➕ Invite
              </button>
            </div>
            
            {/* Search Box */}
            <div className={`p-4 border-b transition-colors duration-300 ${
              theme === "light" ? "bg-slate-50 border-slate-200" : "bg-slate-900/20 border-slate-850"
            }`}>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search candidates..."
                  className={`w-full border rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono focus:ring-1 focus:ring-cyan-500 transition-all duration-200 ${
                    theme === "light"
                      ? "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400"
                      : "bg-[#0B0F19] border-slate-800 text-white placeholder:text-slate-600"
                  }`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Status Segment Filter */}
            <div className={`grid grid-cols-4 text-[10px] font-mono text-center select-none font-bold transition-colors duration-300 border-b ${
              theme === "light" ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#0B0F19]/60 border-slate-850 text-slate-400"
            }`}>
              <button
                onClick={() => setStatusFilter("all")}
                className={`py-2.5 border-r transition-all cursor-pointer ${
                  theme === "light" ? "border-slate-200 hover:bg-slate-100" : "border-slate-850/80 hover:bg-slate-900/40"
                } ${statusFilter === "all" ? "text-cyan-500 border-b-2 border-b-cyan-500 bg-white" : ""}`}
              >
                ALL
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`py-2.5 border-r transition-all cursor-pointer ${
                  theme === "light" ? "border-slate-200 hover:bg-slate-100" : "border-slate-850/80 hover:bg-slate-900/40"
                } ${statusFilter === "active" ? "text-cyan-500 border-b-2 border-b-cyan-500 bg-white" : ""}`}
              >
                ACTIVE
              </button>
              <button
                onClick={() => setStatusFilter("completed")}
                className={`py-2.5 border-r transition-all cursor-pointer ${
                  theme === "light" ? "border-slate-200 hover:bg-slate-100" : "border-slate-850/80 hover:bg-slate-900/40"
                } ${statusFilter === "completed" ? "text-emerald-500 border-b-2 border-b-emerald-500 bg-white" : ""}`}
              >
                DONE
              </button>
              <button
                onClick={() => setStatusFilter("blocked")}
                className={`py-2.5 transition-all cursor-pointer ${
                  theme === "light" ? "hover:bg-slate-100" : "hover:bg-slate-900/40"
                } ${statusFilter === "blocked" ? "text-rose-500 border-b-2 border-b-rose-500 bg-white" : ""}`}
              >
                BLOCKED
              </button>
            </div>

            {/* Candidates Scroll Queue */}
            <div className={`flex-1 overflow-y-auto divide-y transition-colors duration-300 ${
              theme === "light" ? "divide-slate-100 bg-slate-50/50" : "divide-slate-900 bg-slate-900/5"
            }`}>
              {loadingList ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <span className="h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></span>
                  <span className="text-slate-500 font-mono text-[10px] uppercase">Retrieving queue...</span>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="text-center text-slate-500 font-mono text-xs py-12">No records found.</div>
              ) : (
                filteredCandidates.map((cand) => {
                  const isActive = selectedId === cand.id;
                  return (
                    <div
                      key={cand.id}
                      onClick={() => {
                        setSelectedId(cand.id);
                        setActiveTab("telemetry");
                      }}
                      className={`w-full p-4 transition-all duration-200 flex flex-col space-y-3 cursor-pointer group relative border-l-2 ${
                        isActive 
                          ? theme === "light"
                            ? "bg-slate-150 border-l-cyan-500 shadow-sm"
                            : "bg-slate-900/85 border-l-cyan-500 shadow-md"
                          : theme === "light"
                          ? "border-l-transparent hover:bg-slate-100/40"
                          : "border-l-transparent hover:bg-slate-900/40"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-center space-x-3 min-w-0 pr-1">
                          {/* Beautiful Colored Avatar */}
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 select-none ${
                            cand.status === "blocked"
                              ? "bg-rose-950/20 border border-rose-800/40 text-rose-500"
                              : cand.status === "completed"
                              ? "bg-emerald-950/20 border border-emerald-800/40 text-emerald-500"
                              : "bg-cyan-950/20 border border-cyan-800/40 text-cyan-500"
                          }`}>
                            {getInitials(cand.name)}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`font-bold text-sm truncate transition-colors ${
                                theme === "light" ? "text-slate-800 group-hover:text-cyan-600" : "text-white group-hover:text-cyan-400"
                              }`}>{cand.name}</span>
                              {cand.domain && (
                                <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-medium border shrink-0 ${
                                  theme === "light" ? "bg-slate-105 text-slate-600 border-slate-200" : "bg-slate-900 text-slate-400 border-slate-800"
                                }`}>{cand.domain}</span>
                              )}
                            </div>
                            <span className={`text-[10px] truncate font-mono mt-0.5 ${
                              theme === "light" ? "text-slate-505" : "text-slate-500"
                            }`}>{cand.email}</span>
                            <span className={`text-[9px] font-mono mt-0.5 font-bold select-all ${
                              theme === "light" ? "text-indigo-600" : "text-cyan-400"
                            }`}>
                              Key: {cand.sec_id || `SEC-${cand.id}`}
                            </span>
                          </div>
                        </div>

                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0 border tracking-wider ${
                          cand.status === "completed" 
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                            : cand.status === "blocked"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}>
                          {cand.status}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1">
                        <span className={`border px-1.5 py-0.5 rounded ${
                          theme === "light" ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-slate-950 border-slate-800/60 text-slate-400"
                        }`}>Grading: {cand.technical_score}%</span>
                        <div className="flex items-center space-x-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${getTrustBadgeBg(cand.trust_score)}`}></span>
                          <span className={theme === "light" ? "text-slate-650" : "text-slate-300"}>Trust: {cand.trust_score}</span>
                        </div>
                      </div>

                      {/* Sliding Action Overlay Buttons */}
                      <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button
                          onClick={(e) => handleToggleBlock(cand.id, e)}
                          className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                            cand.status === "blocked"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/25"
                              : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/25"
                          }`}
                        >
                          {cand.status === "blocked" ? "Unblock" : "Block Candidate"}
                        </button>
                        <button
                          onClick={(e) => handleDeleteCandidate(cand.id, e)}
                          className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                            theme === "light"
                              ? "bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-350"
                              : "bg-slate-800 text-slate-300 border border-slate-750 hover:bg-slate-700"
                          }`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Right Main Screen */}
        <main className={`flex-1 flex flex-col overflow-hidden relative transition-colors duration-300 ${
          theme === "light" ? "bg-slate-100" : "bg-[#0A0D16]"
        }`}>
          
          {/* TAB 1: TELEMETRY REPORT DETAILS */}
          {activeTab === "telemetry" && (
            <>
              {loadingReport ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center space-y-4">
                    <span className="h-8 w-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></span>
                    <p className="font-mono text-slate-400 text-sm">Decoding proctored telemetry report...</p>
                  </div>
                </div>
              ) : !report ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-sm">
                  Select a candidate from the queue to load workspace records.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  {/* Detailed review Header */}
                  <div className={`flex justify-between items-center pb-4 border-b select-none transition-colors duration-300 ${
                    theme === "light" ? "border-slate-200" : "border-slate-800"
                  }`}>
                    <div>
                      <h1 className={`text-xl font-bold tracking-tight flex items-center gap-2 ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                        <span>{report.candidate.name}</span>
                        {report.candidate.domain && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                            theme === "light" ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-cyan-950/20 text-cyan-400 border-cyan-800/30"
                          }`}>{report.candidate.domain}</span>
                        )}
                      </h1>
                      <p className={`text-xs mt-1 font-mono ${theme === "light" ? "text-slate-505" : "text-slate-400"}`}>
                        Detailed session review & response log for ID: {report.candidate.id}
                      </p>
                    </div>
                    <button
                      onClick={() => { setSelectedId(null); setReport(null); }}
                      className={`border px-4.5 py-2 rounded-lg font-mono text-xs cursor-pointer flex items-center gap-1.5 transition duration-150 ${
                        theme === "light"
                          ? "bg-white border-slate-300 hover:bg-slate-50 text-slate-700 font-bold"
                          : "bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350"
                      }`}
                    >
                      ← Back to Dashboard
                    </button>
                  </div>

                  {/* Row 1: Profile + Security Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Candidate Profile Card */}
                    <div className={`border rounded-2xl p-6 relative overflow-hidden flex flex-col sm:flex-row items-center gap-6 transition-all duration-300 ${
                      theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                    }`}>
                      <div className="absolute w-[200px] h-[200px] bg-cyan-500/5 blur-[60px] rounded-full top-0 right-0 pointer-events-none"></div>
                      
                      {/* Circular Progress Bar */}
                      <div className="relative flex items-center justify-center shrink-0 select-none">
                        {(() => {
                          const radius = 32;
                          const circumference = 2 * Math.PI * radius;
                          const scorePercent = report.candidate.technical_score || 0;
                          const strokeOffset = circumference - (scorePercent / 100) * circumference;
                          return (
                            <>
                              <svg className="w-24 h-24 transform -rotate-90">
                                <circle cx="48" cy="48" r={radius} stroke={theme === "light" ? "#f1f5f9" : "#1e293b"} strokeWidth="8" fill="transparent" />
                                <circle
                                  cx="48"
                                  cy="48"
                                  r={radius}
                                  stroke="#4f46e5"
                                  strokeWidth="8"
                                  fill="transparent"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={strokeOffset}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute flex flex-col items-center">
                                <span className={`text-lg font-black ${theme === "light" ? "text-slate-800" : "text-white"}`}>{scorePercent}%</span>
                                <span className={`text-[8px] uppercase tracking-wider font-bold ${theme === "light" ? "text-slate-400" : "text-slate-500"}`}>score</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Profile Metadata */}
                      <div className={`flex-1 w-full space-y-2.5 font-mono text-[11px] transition-colors duration-300 ${
                        theme === "light" ? "text-slate-600" : "text-slate-300"
                      }`}>
                        <h3 className={`text-xs font-bold uppercase tracking-wider select-none flex items-center gap-1 ${
                          theme === "light" ? "text-slate-700" : "text-slate-400"
                        }`}>👤 Candidate Profile</h3>
                        <div className={`border-t pt-2 space-y-1.5 transition-colors duration-300 ${
                          theme === "light" ? "border-slate-200" : "border-slate-800/80"
                        }`}>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>FULL NAME</span>
                            <p className={`font-semibold text-xs font-sans mt-0.5 ${theme === "light" ? "text-slate-850" : "text-white"}`}>{report.candidate.name}</p>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>SESSION ID</span>
                            <p className="font-semibold text-indigo-600 mt-0.5">{report.candidate.sec_id || `SEC-${report.candidate.id}`}</p>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>INVITE LINK</span>
                            <button
                              type="button"
                              onClick={() => {
                                const inviteLink = `${window.location.origin}/?code=${report.candidate.sec_id || report.candidate.id}`;
                                navigator.clipboard.writeText(inviteLink);
                                alert("Copied Invite Link to clipboard:\n" + inviteLink);
                              }}
                              className="block mt-0.5 text-left text-cyan-500 hover:text-cyan-600 transition font-bold font-mono underline cursor-pointer"
                            >
                              📋 Copy Candidate Link
                            </button>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>EMAIL ADDRESS</span>
                            <p className={`font-semibold mt-0.5 ${theme === "light" ? "text-slate-855" : "text-white"}`}>{report.candidate.email}</p>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>ASSESSMENT TRACK</span>
                            <p className={`font-semibold mt-0.5 ${theme === "light" ? "text-slate-855" : "text-white"}`}>{report.candidate.domain || "General"}</p>
                          </div>
                           <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>STATUS</span>
                            <div className="mt-0.5">
                              {report.candidate.status === "blocked" ? (
                                <span className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">Blocked</span>
                              ) : report.candidate.status === "completed" ? (
                                <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">Completed</span>
                              ) : (
                                <span className="bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">Active</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>CORRECT RESPONSES</span>
                            <p className={`font-semibold mt-0.5 ${theme === "light" ? "text-slate-855" : "text-white"}`}>
                              🟢 {report.answers.filter((ans: any) => ans.is_correct).length} / {getPresentedQuestionsCount(report.candidate.domain) || report.answers.length} Correct
                            </p>
                          </div>
                          <div>
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>EXAM TIMINGS</span>
                            <p className={`text-[10px] mt-0.5 ${theme === "light" ? "text-slate-605" : "text-slate-400"}`}>
                              ⏱️ Started: {report.candidate.started_at ? new Date(report.candidate.started_at).toLocaleString() : "Pending"}
                            </p>
                            {report.candidate.completed_at && (
                              <p className={`text-[10px] mt-0.5 ${theme === "light" ? "text-slate-605" : "text-slate-400"}`}>
                                Finished: {new Date(report.candidate.completed_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className="pt-2.5 border-t border-slate-500/10 flex flex-wrap gap-2 select-none">
                            <button
                              type="button"
                              onClick={(e) => handleToggleBlock(report.candidate.id, e)}
                              className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1.5 rounded-md border transition cursor-pointer flex items-center gap-1 ${
                                report.candidate.status === "blocked"
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/25"
                                  : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/25"
                              }`}
                            >
                              {report.candidate.status === "blocked" ? "🟢 Unblock Candidate" : "🚫 Block Candidate"}
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => handleResetSession(report.candidate.id, e)}
                              className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1.5 rounded-md border transition cursor-pointer ${
                                theme === "light"
                                  ? "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/25"
                              }`}
                            >
                              🔄 Reset Session
                            </button>
                          </div>
                          <div className="pt-1.5 border-t border-slate-500/10 mt-1.5">
                            <span className={theme === "light" ? "text-slate-400 text-[9px] font-bold" : "text-slate-500 text-[9px] font-bold"}>AUDIO INTEGRITY FEED</span>
                            {audioUrl ? (
                              <div className={`mt-2 p-3 rounded-xl border transition-colors duration-300 ${
                                theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19]/80 border-slate-850"
                              }`}>
                                <audio
                                  ref={audioRef}
                                  src={audioUrl}
                                  onTimeUpdate={handleTimeUpdate}
                                  onLoadedMetadata={handleLoadedMetadata}
                                  onEnded={handleAudioEnded}
                                  className="hidden"
                                />
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={togglePlayPause}
                                    className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 ${
                                      theme === "light" ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                                    }`}
                                    title={audioPlaying ? "Pause Audio" : "Play Audio"}
                                  >
                                    {audioPlaying ? (
                                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500">
                                      <span className="truncate">🎙️ RECORDING ACTIVE</span>
                                      <span className="shrink-0">{formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={audioDuration || 0}
                                      step={0.1}
                                      value={audioCurrentTime}
                                      onChange={handleSeek}
                                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer outline-none ${
                                        theme === "light" ? "bg-slate-200 accent-indigo-600" : "bg-slate-800 accent-cyan-500"
                                      }`}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-500/10">
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={toggleMute} className="text-slate-500 hover:text-slate-400 cursor-pointer" title={audioMuted ? "Unmute" : "Mute"}>
                                      {audioMuted || audioVolume === 0 ? (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6L4.5 9H1.5v6h3l4.5 3.75V5.25z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                        </svg>
                                      )}
                                    </button>
                                    <input
                                      type="range"
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      value={audioMuted ? 0 : audioVolume}
                                      onChange={handleVolumeChange}
                                      className={`w-12 h-1 rounded-lg appearance-none cursor-pointer outline-none ${
                                        theme === "light" ? "bg-slate-200 accent-indigo-600" : "bg-slate-800 accent-cyan-500"
                                      }`}
                                    />
                                  </div>
                                  <a
                                    href={audioUrl}
                                    download={`candidate_${report.candidate.id}_recording.webm`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[8px] font-bold text-slate-500 hover:text-slate-400 flex items-center gap-1 transition-colors"
                                  >
                                    📥 DOWNLOAD
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-550 mt-1 font-mono italic">
                                No audio recording available for this session.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Proctoring Security Metrics Card */}
                    {(() => {
                      const totalStrikes = report.events.filter((e) => e.event_type !== "periodic_snapshot").length;
                      const gazeAwayFlags = report.events.filter((e) => e.event_type === "gaze_away").length;
                      const phoneDetections = report.events.filter((e) => e.event_type === "yolo_phone").length;
                      return (
                        <div className={`border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between font-mono text-xs transition-all duration-300 ${
                          theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                        }`}>
                          <div className="absolute w-[200px] h-[200px] bg-rose-500/5 blur-[60px] rounded-full top-0 right-0 pointer-events-none"></div>
                          
                          <div>
                            <h3 className={`text-xs font-bold uppercase tracking-wider pb-3 border-b mb-4 select-none flex items-center gap-1 transition-colors duration-300 ${
                              theme === "light" ? "text-slate-700 border-slate-200" : "text-slate-400 border-slate-800/80"
                            }`}>🛡️ Proctoring Security Metrics</h3>
                            
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              {/* Total Strikes */}
                              <div className={`border p-4 rounded-xl text-center transition-colors duration-300 ${
                                theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                              }`}>
                                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Total Strikes</p>
                                <p className={`text-xl font-bold mt-1.5 ${theme === "light" ? "text-slate-850" : "text-white"}`}>{totalStrikes} / 5</p>
                              </div>

                              {/* Gaze Away Flags */}
                              <div className={`border p-4 rounded-xl text-center transition-colors duration-300 ${
                                theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                              }`}>
                                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Gaze Away Flags</p>
                                <p className={`text-xl font-bold mt-1.5 ${theme === "light" ? "text-slate-850" : "text-white"}`}>{gazeAwayFlags}</p>
                              </div>
                            </div>

                            {/* Mobile Phone Detections */}
                            <div className={`border p-4 rounded-xl text-center mb-4 transition-colors duration-300 ${
                              theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                            }`}>
                              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Mobile Phone Detections</p>
                              <p className={`text-xl font-bold mt-1.5 ${theme === "light" ? "text-slate-850" : "text-white"}`}>{phoneDetections}</p>
                            </div>
                          </div>

                          <p className={`text-[10px] leading-relaxed p-2.5 rounded-lg border transition-colors duration-300 ${
                            theme === "light" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-slate-950/40 border-slate-850/50 text-slate-500"
                          }`}>
                            ⚠️ Lockouts only trigger immediately upon Mobile Phone detection. All other proctoring warnings increment the strike meter up to 5.
                          </p>
                          <button
                            onClick={handleManualStrike}
                            className="w-full mt-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 py-2 rounded-lg font-mono text-[10px] font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>⚠️ Add Manual Strike</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Detailed AI Verdict summary */}
                  <div className={`border rounded-2xl p-6 relative overflow-hidden flex flex-col transition-all duration-300 ${
                    theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                  }`}>
                    <div className={`flex justify-between items-center border-b pb-3 mb-4 select-none transition-colors duration-300 ${
                      theme === "light" ? "border-slate-200" : "border-slate-800/80"
                    }`}>
                      <span className={`font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        theme === "light" ? "text-slate-700" : "text-slate-400"
                      }`}>
                        🤖 AI Proctor Verdict Analysis
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition-colors duration-300 ${
                        theme === "light" ? "bg-slate-100 text-slate-600 border-slate-250" : "bg-cyan-950 text-cyan-400 border-cyan-800/40"
                      }`}>
                        LLAMA-3.3-70B
                      </span>
                    </div>

                    <div className={`text-xs leading-relaxed font-sans whitespace-pre-wrap ${
                      theme === "light" ? "text-slate-700" : "text-slate-300"
                    }`}>
                      {report.candidate.ai_summary ? (
                        report.candidate.ai_summary
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center space-y-3 font-mono">
                          <p className="text-[11px] text-slate-500 max-w-sm">
                            No AI telemetry evaluation exists for this candidate. Click to run LLM verification.
                          </p>
                          <button
                            onClick={handleGenerateAISummary}
                            disabled={generatingAI}
                            className={`font-bold uppercase tracking-wider text-[10px] px-5 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 ${
                              theme === "light" ? "bg-indigo-650 hover:bg-indigo-700 text-white" : "bg-cyan-signal hover:bg-cyan-400 text-slate-950"
                            }`}
                          >
                            {generatingAI ? "Running Audits..." : "Run AI Proctor Evaluation"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Exam Answers & Code Submissions */}
                  <div className={`border rounded-2xl p-6 transition-all duration-300 ${
                    theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                  }`}>
                    <div className={`flex justify-between items-center border-b pb-3 mb-4 select-none transition-colors duration-300 ${
                      theme === "light" ? "border-slate-200" : "border-slate-800/80"
                    }`}>
                      <h3 className={`font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        theme === "light" ? "text-slate-700" : "text-slate-400"
                      }`}>
                        📝 Exam Answers & Code Submissions
                      </h3>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors duration-300 ${
                        theme === "light" ? "bg-slate-105 text-slate-600 border-slate-250" : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}>
                        {report.answers.length} / {allQuestions.length || 5} Attempted
                      </span>
                    </div>

                    <div className="space-y-5">
                      {report.answers.length === 0 ? (
                        <div className="text-slate-505 font-mono text-xs py-8 text-center">
                          No question responses saved in candidate session.
                        </div>
                      ) : (
                        report.answers.map((answer, index) => {
                          const wordCount = answer.coding_submission ? answer.coding_submission.trim().split(/\s+/).filter(Boolean).length : 0;
                          return (
                            <div key={answer.id} className={`border rounded-xl p-5 space-y-3 transition-colors duration-300 ${
                              theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19]/40 border-slate-850"
                            }`}>
                              
                              {/* Title Details */}
                              <div className={`flex justify-between items-start border-b pb-2.5 transition-colors duration-300 ${
                                theme === "light" ? "border-slate-200" : "border-slate-850/60"
                              }`}>
                                <div className="space-y-1">
                                  <span className={`font-mono text-[10px] font-bold uppercase ${
                                    theme === "light" ? "text-slate-600" : "text-slate-400"
                                  }`}>
                                    Q{index + 1}. {answer.question?.title || `Question ID: ${answer.question_id}`}
                                  </span>
                                  {answer.question?.description && (
                                    <p className={`text-xs font-sans whitespace-pre-line ${
                                      theme === "light" ? "text-slate-700" : "text-slate-300"
                                    }`}>{answer.question.description}</p>
                                  )}
                                </div>
                                <div className="flex space-x-2 items-center font-mono shrink-0">
                                  {answer.question?.type === "paragraph" ? (
                                    <span className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                                      ✍️ Written Response ({wordCount} words)
                                    </span>
                                  ) : answer.question?.type === "mcq" ? (
                                    <span className="bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                                      MCQ Option
                                    </span>
                                  ) : (
                                    <span className="bg-indigo-500/10 text-indigo-650 border border-indigo-500/20 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                                      💻 Code Submission
                                    </span>
                                  )}
                                  <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                                    answer.is_correct 
                                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" 
                                      : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                  }`}>
                                    {answer.is_correct ? "PASSED" : "FAILED"}
                                  </span>
                                  <span className="text-xs text-slate-500 font-bold ml-1">
                                    +{answer.points_earned} pts
                                  </span>
                                </div>
                              </div>

                              {/* MCQ answer display */}
                              {answer.question?.type === "mcq" && (
                                <div className="space-y-2">
                                  <p className="text-xs font-mono">
                                    <span className="text-slate-500 font-bold">Candidate Answer:</span>{" "}
                                    <span className={`font-bold ${answer.is_correct ? "text-emerald-600" : "text-rose-600"}`}>
                                      {answer.mcq_answer || "No response recorded"}
                                    </span>
                                  </p>
                                  {answer.question.choices && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                                      {answer.question.choices.map((choice, cIdx) => {
                                        const isSelected = answer.mcq_answer === choice;
                                        return (
                                          <div
                                            key={cIdx}
                                            className={`px-3 py-1.5 rounded-lg border transition-colors duration-200 ${
                                              isSelected
                                                ? answer.is_correct
                                                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 font-bold"
                                                  : "border-rose-500 bg-rose-500/10 text-rose-700 font-bold"
                                                : theme === "light"
                                                ? "border-slate-200 bg-white text-slate-700"
                                                : "border-slate-800 bg-slate-900/40 text-slate-400"
                                            }`}
                                          >
                                            <span className="font-bold mr-1.5">{String.fromCharCode(65 + cIdx)})</span>
                                            {choice}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Paragraph text response */}
                              {answer.question?.type === "paragraph" && (
                                <div className="space-y-1.5 font-mono">
                                  <span className="text-[10px] text-slate-500">Response Text:</span>
                                  <p className={`rounded-xl p-3.5 text-xs font-sans leading-relaxed min-h-16 whitespace-pre-wrap border transition-colors duration-300 ${
                                    theme === "light" ? "bg-white border-slate-200 text-slate-800" : "bg-[#0B0F19] border-slate-850 text-slate-200"
                                  }`}>
                                    {answer.coding_submission || "No response recorded."}
                                  </p>
                                </div>
                              )}

                              {/* Coding Challenge response */}
                              {answer.question?.type === "coding" && (
                                <div className="space-y-1.5 font-mono">
                                  <span className="text-[10px] text-slate-500">Submitted Source Code:</span>
                                  <pre className={`rounded-xl p-4 text-xs overflow-x-auto max-h-60 leading-relaxed shadow-inner border transition-colors duration-300 ${
                                    theme === "light" ? "bg-white border-slate-200 text-slate-800" : "bg-[#0B0F19] border-slate-850 text-cyan-100"
                                  }`}>
                                    {answer.coding_submission || "# No response recorded."}
                                  </pre>
                                </div>
                              )}

                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Security Log & Snapshot Timeline */}
                  <div className={`border rounded-2xl p-6 transition-all duration-300 ${
                    theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                  }`}>
                    <h3 className={`font-mono text-xs font-bold uppercase tracking-wider border-b pb-3 mb-4 select-none flex items-center gap-1.5 transition-colors duration-300 ${
                      theme === "light" ? "text-slate-700 border-slate-200" : "text-slate-400 border-slate-800/80"
                    }`}>
                      🚨 Security Log & Timeline ({report.events.length} logs)
                    </h3>

                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                      {report.events.length === 0 ? (
                        <div className="text-slate-505 font-mono text-xs py-8 text-center">
                          Pristine test session integrity. No violations detected.
                        </div>
                      ) : (
                        report.events.map((event) => {
                          const isWarning = event.event_type !== "periodic_snapshot" && event.event_type !== "camera_offline";
                          return (
                            <div key={event.id} className={`border-l-2 pl-4 py-1 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 transition-colors duration-300 ${
                              event.event_type === "periodic_snapshot" 
                                ? theme === "light" ? "border-slate-300" : "border-slate-700" 
                                : "border-rose-500/70"
                            }`}>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono text-xs font-bold uppercase tracking-wider ${
                                    theme === "light" ? "text-slate-700" : "text-slate-200"
                                  }`}>
                                    {event.event_type.replace("_", " ")}
                                  </span>
                                  <span className="font-mono text-[9px] text-slate-500">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className={`text-xs mt-1 font-mono ${
                                  theme === "light" ? "text-slate-650" : "text-slate-400"
                                }`}>
                                  {event.details || "Telemetry flag logged."}
                                </p>
                              </div>

                              {/* Event Badge Badge */}
                              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase shrink-0 border ${
                                event.event_type === "periodic_snapshot"
                                  ? "bg-slate-800/40 text-slate-400 border-slate-700"
                                  : event.event_type === "gaze_away"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              }`}>
                                {event.event_type === "periodic_snapshot" ? "📸 STATUS SNAPSHOT" : event.event_type.replace("_", " ")}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Captured Security Screenshots & Photos */}
                  {(() => {
                    const photos = report.events.filter(e => e.evidence_snapshot_path);
                    return (
                      <div className={`border rounded-2xl p-6 transition-all duration-300 ${
                        theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                      }`}>
                        <div className={`flex justify-between items-center border-b pb-3 mb-4 select-none transition-colors duration-300 ${
                          theme === "light" ? "border-slate-200" : "border-slate-800/80"
                        }`}>
                          <h3 className={`font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                            theme === "light" ? "text-slate-700" : "text-slate-400"
                          }`}>
                            📸 Captured Security Screenshots & Photos
                          </h3>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors duration-300 ${
                            theme === "light" ? "bg-slate-100 text-slate-600 border-slate-250" : "bg-cyan-950 text-cyan-400 border border-cyan-855"
                          }`}>
                            {photos.length} photos
                          </span>
                        </div>

                        {photos.length === 0 ? (
                          <div className="text-slate-500 font-mono text-xs py-8 text-center">
                            No webcam evidence snapshots captured during this session.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {photos.map((photo) => (
                              <div key={photo.id} className={`border rounded-xl overflow-hidden shadow-sm flex flex-col justify-between font-mono text-[10px] transition-colors duration-300 ${
                                theme === "light" ? "bg-white border-slate-200" : "bg-[#0B0F19]/60 border-slate-850"
                              }`}>
                                <div className="aspect-video relative bg-slate-950">
                                  <img
                                    src={photo.evidence_snapshot_path && photo.evidence_snapshot_path.startsWith("http") ? photo.evidence_snapshot_path : `${API_BASE_URL}${photo.evidence_snapshot_path}`}
                                    alt={photo.event_type}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback on broken image load
                                      (e.target as any).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2'%3E%3Cpath d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 5l3 3m0 0l-3 3m3-3H9'/%3E%3C/svg%3E";
                                    }}
                                  />
                                </div>
                                <div className={`p-2 border-t transition-colors duration-300 ${
                                  theme === "light" ? "border-slate-200 bg-slate-50" : "border-slate-850/60 bg-slate-900/20"
                                }`}>
                                  <p className={`font-bold truncate uppercase ${
                                    theme === "light" ? "text-slate-700" : "text-slate-300"
                                  }`}>
                                    {photo.event_type === "periodic_snapshot" ? "STATUS SNAPSHOT" : photo.event_type.replace("_", " ")}
                                  </p>
                                  <p className="text-[9px] text-slate-500 mt-0.5">
                                    ⏱️ {new Date(photo.timestamp).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              )}
            </>
          )}

          {activeTab === "questions" && (
            <div className="flex-1 p-6 space-y-6 overflow-y-auto max-w-4xl mx-auto w-full">
              {/* Global Assessment Time Control Panel */}
              <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden font-mono text-xs transition-all duration-300 ${
                theme === "light" ? "bg-white border-slate-200" : "bg-slate-900/40 border-slate-800"
              }`}>
                <div className={`flex justify-between items-center border-b pb-3.5 mb-4 select-none transition-colors duration-300 ${
                  theme === "light" ? "border-slate-200" : "border-slate-800/80"
                }`}>
                  <div>
                    <h2 className={`text-sm font-bold tracking-tight flex items-center gap-2 ${
                      theme === "light" ? "text-slate-800" : "text-white"
                    }`}>⏱️ Global Assessment Settings</h2>
                    <p className={`text-[11px] mt-1 ${
                      theme === "light" ? "text-slate-500" : "text-slate-400"
                    }`}>
                      Configure overall session time limits and maximum strike allowances for candidates.
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border transition-colors duration-300 space-y-4 ${
                  theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                }`}>
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 select-none">
                      <input
                        id="dashboard-timer-toggle"
                        type="checkbox"
                        checked={enableOverallTimer}
                        onChange={(e) => setEnableOverallTimer(e.target.checked)}
                        className="h-4 w-4 accent-cyan-signal cursor-pointer"
                      />
                      <label htmlFor="dashboard-timer-toggle" className={`text-xs font-semibold cursor-pointer ${
                        theme === "light" ? "text-slate-700" : "text-slate-350"
                      }`}>
                        Enable Overall Test Time Limit
                      </label>
                    </div>

                    {enableOverallTimer && (
                      <div className="flex items-center gap-2">
                        <span className={theme === "light" ? "text-slate-655" : "text-slate-400"}>Duration:</span>
                        <input
                          type="number"
                          min={1}
                          max={180}
                          className={`rounded px-2.5 py-1 focus:outline-none transition w-16 text-center ${
                            theme === "light" 
                              ? "bg-white border border-slate-300 text-slate-855 focus:border-indigo-500" 
                              : "bg-slate-900 border border-slate-800 text-white focus:border-cyan-signal"
                          }`}
                          value={overallDuration}
                          onChange={(e) => setOverallDuration(parseInt(e.target.value) || 20)}
                        />
                        <span className={theme === "light" ? "text-slate-655" : "text-slate-400"}>minutes</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                    <div className="flex items-center gap-2 font-mono">
                      <span className={theme === "light" ? "text-slate-700 font-bold" : "text-slate-300 font-bold"}>⚠️ Max Strikes Allowed:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className={`rounded px-2.5 py-1 focus:outline-none transition w-14 text-center ${
                          theme === "light" 
                            ? "bg-white border border-slate-300 text-slate-855 focus:border-indigo-500" 
                            : "bg-slate-900 border border-slate-800 text-white focus:border-cyan-signal"
                        }`}
                        value={maxStrikes}
                        onChange={(e) => setMaxStrikes(parseInt(e.target.value) || 3)}
                      />
                      <span className={theme === "light" ? "text-slate-660" : "text-slate-400"}>proctor warnings before auto-lock</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      className={`px-5 py-1.8 rounded font-bold uppercase transition duration-150 cursor-pointer text-[10px] tracking-wider shrink-0 ${
                        theme === "light" ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-cyan-signal hover:bg-cyan-400 text-slate-950"
                      }`}
                    >
                      Save Settings
                    </button>
                  </div>
                </div>

                {settingsSavedMessage && (
                  <p className="text-emerald-500 text-[11px] mt-2.5 font-bold animate-pulse">{settingsSavedMessage}</p>
                )}
              </div>

              {/* Creator Mode Switcher */}
              <div className="flex border-b border-slate-800 font-mono text-xs select-none">
                <button
                  type="button"
                  onClick={() => setQuestionsSubTab("ai")}
                  className={`pb-2.5 px-4 font-bold border-b-2 transition-all cursor-pointer ${
                    questionsSubTab === "ai"
                      ? "border-cyan-signal text-cyan-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🧙‍♂️ AI Test Generator
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSubTab("manual")}
                  className={`pb-2.5 px-4 font-bold border-b-2 transition-all cursor-pointer ${
                    questionsSubTab === "manual"
                      ? "border-cyan-signal text-cyan-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📝 Manual Form Builder (Google Form Style)
                </button>
              </div>

              {/* MODE 1: AI TEST DESIGNER */}
              {questionsSubTab === "ai" && (
                <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
                  theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                }`}>
                  <div className="absolute w-[300px] h-[300px] bg-gradient-to-tr from-cyan-500/5 to-indigo-500/5 blur-[80px] rounded-full top-0 right-0 pointer-events-none"></div>

                  <div className={`flex justify-between items-center border-b pb-3.5 mb-6 relative z-10 select-none transition-colors duration-300 ${
                    theme === "light" ? "border-slate-200" : "border-slate-800/80"
                  }`}>
                    <div>
                      <h2 className={`text-lg font-bold tracking-tight ${theme === "light" ? "text-slate-800" : "text-white"}`}>AI Test Designer</h2>
                      <p className={`text-xs mt-1 font-mono ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                        Feed raw instructions. Llama-3.3 compiled outputs will configure options, starters, and test pools automatically.
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors duration-300 ${
                      theme === "light" ? "bg-slate-105 text-slate-600 border-slate-250" : "bg-cyan-950 text-cyan-400 border border-cyan-800/40"
                    }`}>
                      GROQ LLAMA-3.3 ACTIVE
                    </span>
                  </div>

                  <div className="flex space-x-3 mb-6 relative z-10 select-none">
                    <span className={`text-xs font-mono flex items-center pr-2 ${
                      theme === "light" ? "text-slate-700" : "text-slate-400"
                    }`}>Quick Templates:</span>
                    <button
                      type="button"
                      onClick={() => loadTemplate("mcq")}
                      className={`text-[10px] font-mono px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                        theme === "light" 
                          ? "bg-white hover:bg-slate-50 border-slate-300 text-slate-700 font-bold" 
                          : "bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700"
                      }`}
                    >
                      📄 Load MCQ Template
                    </button>
                    <button
                      type="button"
                      onClick={() => loadTemplate("coding")}
                      className={`text-[10px] font-mono px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                        theme === "light" 
                          ? "bg-white hover:bg-slate-50 border-slate-300 text-slate-700 font-bold" 
                          : "bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700"
                      }`}
                    >
                      💻 Load Coding Template
                    </button>
                  </div>

                  <form onSubmit={handleGenerateQuestion} className="space-y-5 relative z-10">
                    <div className="space-y-2">
                      <label className={`block text-xs uppercase font-bold tracking-wider font-mono ${
                        theme === "light" ? "text-slate-600" : "text-slate-400"
                      }`}>
                        Question & Assessment Requirements
                      </label>
                      <textarea
                        rows={8}
                        required
                        value={questionPrompt}
                        onChange={(e) => setQuestionPrompt(e.target.value)}
                        placeholder="Paste your raw text question here, or select a Quick Template above..."
                        className={`w-full border rounded-xl p-4 font-mono text-xs focus:outline-none transition leading-relaxed ${
                          theme === "light" 
                            ? "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400" 
                            : "bg-[#0B0F19] border-slate-800 text-slate-200 placeholder:text-slate-700"
                        }`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={`block text-[10px] uppercase font-bold tracking-wider font-mono ${
                        theme === "light" ? "text-slate-600" : "text-slate-400"
                      }`}>
                        Target Domain / Track
                      </label>
                      <select
                        value={aiDomain}
                        onChange={(e) => setAiDomain(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                          theme === "light" 
                            ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                            : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                        }`}
                      >
                        <option value="General">General</option>
                        <option value="Frontend">Frontend</option>
                        <option value="Backend">Backend</option>
                        <option value="Fullstack">Fullstack</option>
                        <option value="Data Science">Data Science</option>
                        <option value="Other">Other (Type custom role...)</option>
                      </select>

                      {aiDomain === "Other" && (
                        <div className="space-y-1 pt-1.5 animate-fadeIn">
                          <label className={`block text-[9px] uppercase font-bold tracking-wider font-mono ${
                            theme === "light" ? "text-slate-500" : "text-cyan-400"
                          }`}>
                            ✏️ Custom Domain Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Mobile Developer"
                            value={customAiDomain}
                            onChange={(e) => setCustomAiDomain(e.target.value)}
                            className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                              theme === "light" 
                                ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                                : "bg-[#0B0F19] border-cyan-900/40 text-slate-100 focus:border-cyan-500"
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={generatingQuestion}
                      className="w-full bg-gradient-to-r from-cyan-500 to-indigo-655 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold uppercase tracking-wider py-3.5 px-6 rounded-xl text-xs transition duration-150 ease-in-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {generatingQuestion ? (
                        <>
                          <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span className="font-mono text-xs uppercase tracking-wider text-white">AI Compiling Question parameters...</span>
                        </>
                      ) : (
                        <span className="font-mono text-xs uppercase tracking-wider text-white">Compile & Publish Question</span>
                      )}
                    </button>
                  </form>

                  {generatedQuestionSuccess && (
                    <div className={`mt-6 p-4 rounded-xl border text-xs font-mono transition-all duration-300 ${
                      generatedQuestionSuccess.startsWith("Successfully")
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/30"
                        : "bg-rose-950/20 text-rose-400 border-rose-900/30 animate-pulse"
                    }`}>
                      {generatedQuestionSuccess}
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: MANUAL QUESTION CREATOR */}
              {questionsSubTab === "manual" && (
                <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
                  theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
                }`}>
                  <div className="absolute w-[300px] h-[300px] bg-gradient-to-tr from-cyan-500/5 to-indigo-500/5 blur-[80px] rounded-full top-0 right-0 pointer-events-none"></div>

                  <div className={`flex justify-between items-center border-b pb-3.5 mb-6 relative z-10 select-none transition-colors duration-300 ${
                    theme === "light" ? "border-slate-200" : "border-slate-800/80"
                  }`}>
                    <div>
                      <h2 className={`text-lg font-bold tracking-tight ${theme === "light" ? "text-slate-850" : "text-white"}`}>Manual Question Builder</h2>
                      <p className={`text-xs mt-1 ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                        Configure questions step-by-step just like Google Forms.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateManualQuestion} className="space-y-4 relative z-10">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                        theme === "light" ? "text-slate-600" : "text-slate-400"
                      }`}>
                        Question Title
                      </label>
                      <input
                        type="text"
                        required
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="e.g. Written Reflection / Coding Challenge"
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all ${
                          theme === "light" 
                            ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                            : "bg-[#0B0F19] border-slate-800 text-slate-200 focus:border-cyan-500 focus:ring-cyan-500"
                        }`}
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                        theme === "light" ? "text-slate-600" : "text-slate-400"
                      }`}>
                        Question Description / Prompt
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={manualDescription}
                        onChange={(e) => setManualDescription(e.target.value)}
                        placeholder="Explain the problem constraints, MCQ options, or written reflection details..."
                        className={`w-full border rounded-xl p-4 text-xs focus:outline-none focus:ring-1 transition-all leading-relaxed ${
                          theme === "light" 
                            ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500 placeholder:text-slate-400" 
                            : "bg-[#0B0F19] border-slate-800 text-slate-200 focus:border-cyan-500 focus:ring-cyan-500 placeholder:text-slate-700"
                        }`}
                      />
                    </div>

                    {/* Type, Difficulty, Points, Time Limit, Domain Row */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div className="space-y-1.5">
                        <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-600" : "text-slate-400"
                        }`}>
                          Question Type
                        </label>
                        <select
                          value={manualType}
                          onChange={(e) => setManualType(e.target.value as any)}
                          className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                              : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                          }`}
                        >
                          <option value="mcq">Multiple Choice</option>
                          <option value="paragraph">Paragraph (Text Response)</option>
                          <option value="coding">Coding Challenge</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-600" : "text-slate-400"
                        }`}>
                          Difficulty
                        </label>
                        <select
                          value={manualDifficulty}
                          onChange={(e) => setManualDifficulty(e.target.value)}
                          className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                              : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                          }`}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-600" : "text-slate-400"
                        }`}>
                          Points
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={manualPoints}
                          onChange={(e) => setManualPoints(parseInt(e.target.value) || 10)}
                          className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                              : "bg-[#0B0F19] border-slate-800 text-slate-200 focus:border-cyan-500"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-600" : "text-slate-400"
                        }`}>
                          Time Limit (seconds)
                        </label>
                        <input
                          type="number"
                          min={5}
                          value={manualTimeLimit}
                          onChange={(e) => setManualTimeLimit(e.target.value)}
                          placeholder="No Limit"
                          className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500" 
                              : "bg-[#0B0F19] border-slate-800 text-slate-200 focus:border-cyan-500"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-600" : "text-slate-400"
                        }`}>
                          Domain
                        </label>
                        <select
                          value={manualDomain}
                          onChange={(e) => setManualDomain(e.target.value)}
                          className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-800 focus:border-indigo-500 focus:ring-indigo-500" 
                              : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                          }`}
                        >
                          <option value="General">General</option>
                          <option value="Frontend">Frontend</option>
                          <option value="Backend">Backend</option>
                          <option value="Fullstack">Fullstack</option>
                          <option value="Data Science">Data Science</option>
                          <option value="Other">Other (Type custom role...)</option>
                        </select>

                        {manualDomain === "Other" && (
                          <div className="space-y-1 pt-1 animate-fadeIn">
                            <label className={`block text-[9px] uppercase font-bold tracking-wider ${
                              theme === "light" ? "text-slate-500" : "text-cyan-400"
                            }`}>
                              ✏️ Custom Domain Name
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Mobile Developer"
                              value={customManualDomain}
                              onChange={(e) => setCustomManualDomain(e.target.value)}
                              className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                                theme === "light" 
                                  ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                                  : "bg-[#0B0F19] border-cyan-900/40 text-slate-100 focus:border-cyan-500"
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* MCQ Options Config */}
                    {manualType === "mcq" && (
                      <div className={`border p-4 rounded-xl space-y-4 transition-colors duration-300 ${
                        theme === "light" ? "bg-slate-50 border-slate-200" : "border-slate-800/80 bg-slate-950/40"
                      }`}>
                        <span className={`text-[10px] font-bold uppercase ${theme === "light" ? "text-indigo-650" : "text-cyan-400"}`}>Configure Choice Options</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {mcqChoices.map((choice, idx) => (
                            <div key={idx} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-colors duration-300 ${
                              theme === "light" ? "bg-white border-slate-200" : "bg-[#0B0F19] border-slate-850"
                            }`}>
                              <span className="font-bold text-slate-500">{String.fromCharCode(65 + idx)})</span>
                              <input
                                type="text"
                                required
                                value={choice}
                                onChange={(e) => {
                                  const updated = [...mcqChoices];
                                  updated[idx] = e.target.value;
                                  setMcqChoices(updated);
                                }}
                                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                className={`bg-transparent flex-1 focus:outline-none text-xs ${
                                  theme === "light" ? "text-slate-800 placeholder:text-slate-450" : "text-slate-200 placeholder:text-slate-600"
                                }`}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center space-x-3 pt-2">
                          <label className={theme === "light" ? "text-slate-700 font-bold" : "text-slate-400"}>Correct Answer Option:</label>
                          <select
                            value={mcqCorrect}
                            onChange={(e) => setMcqCorrect(e.target.value)}
                            className={`border rounded-lg px-3 py-1 text-xs focus:outline-none transition cursor-pointer ${
                              theme === "light" ? "bg-white border-slate-300 text-slate-800" : "bg-[#0B0F19] border-slate-800 text-slate-200"
                            }`}
                          >
                            <option value="A">Option A</option>
                            <option value="B">Option B</option>
                            <option value="C">Option C</option>
                            <option value="D">Option D</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Coding Options Config */}
                    {manualType === "coding" && (
                      <div className={`border p-4 rounded-xl space-y-4 transition-colors duration-300 ${
                        theme === "light" ? "bg-slate-50 border-slate-200" : "border-slate-800/80 bg-slate-950/40"
                      }`}>
                        <span className={`text-[10px] font-bold uppercase ${theme === "light" ? "text-indigo-650" : "text-cyan-400"}`}>Configure Coding STARTER CODE & Telemetry</span>
                        
                        <div className="space-y-1.5">
                          <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                            theme === "light" ? "text-slate-600" : "text-slate-500"
                          }`}>
                            Python starter code template (sample_code)
                          </label>
                          <textarea
                            rows={3}
                            value={starterCode}
                            onChange={(e) => setStarterCode(e.target.value)}
                            placeholder="e.g. def reverse_string(s: str) -> str:&#10;    # Write code here&#10;    pass"
                            className={`w-full border rounded-xl p-3 font-mono text-[11px] focus:outline-none transition ${
                              theme === "light" 
                                ? "bg-white border-slate-300 text-slate-800 placeholder:text-slate-450" 
                                : "bg-[#0B0F19] border-slate-800 text-slate-200 placeholder:text-slate-700"
                            }`}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className={`block text-[10px] uppercase font-bold tracking-wider ${
                            theme === "light" ? "text-slate-600" : "text-slate-500"
                          }`}>
                            Grading Test Cases (JSON format)
                          </label>
                          <textarea
                            rows={3}
                            value={testCasesStr}
                            onChange={(e) => setTestCasesStr(e.target.value)}
                            placeholder='e.g. [{"args": ["hello"], "expected": "olleh"}]'
                            className={`w-full border rounded-xl p-3 font-mono text-[11px] focus:outline-none transition ${
                              theme === "light" 
                                ? "bg-white border-slate-300 text-slate-800 placeholder:text-slate-450" 
                                : "bg-[#0B0F19] border-slate-800 text-slate-200 placeholder:text-slate-700"
                            }`}
                          />
                        </div>
                      </div>
                    )}

                    {/* Publish Button */}
                    <button
                      type="submit"
                      disabled={creatingManual}
                      className="w-full bg-gradient-to-r from-cyan-500 to-indigo-655 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold uppercase tracking-wider py-3.5 px-6 rounded-xl text-xs transition duration-150 ease-in-out cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {creatingManual ? (
                        <>
                          <span className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                          <span>Creating Question parameter node...</span>
                        </>
                      ) : (
                        <span>Publish & Seed Question</span>
                      )}
                    </button>
                  </form>

                  {manualSuccess && (
                    <div className="mt-4 p-4 rounded-xl border bg-emerald-950/20 text-emerald-400 border-emerald-900/30">
                      {manualSuccess}
                    </div>
                  )}

                  {manualError && (
                    <div className="mt-4 p-4 rounded-xl border bg-rose-950/20 text-rose-400 border-rose-900/30 animate-pulse">
                      {manualError}
                    </div>
                  )}
                </div>
              )}

              {/* Active Questions Pool List */}
              <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
                theme === "light" ? "bg-white border-slate-200 shadow-sm" : "bg-slate-900/40 border-slate-800"
              }`}>
                <div className={`flex justify-between items-center border-b pb-3.5 mb-6 relative z-10 select-none transition-colors duration-300 ${
                  theme === "light" ? "border-slate-200" : "border-slate-800/80"
                }`}>
                  <div>
                    <h2 className={`text-lg font-bold tracking-tight ${theme === "light" ? "text-slate-800" : "text-white"}`}>Active Assessment Pool</h2>
                    <p className={`text-xs mt-1 font-mono ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                      Current questions loaded on the secure candidate exam room.
                    </p>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-100 text-slate-600 border-slate-250" : "bg-indigo-950 text-indigo-400 border border-indigo-800/40"
                  }`}>
                    {allQuestions.length} Questions Active
                  </span>
                </div>

                {/* Domain Category Filter Tabs */}
                {allQuestions.length > 0 && (
                  <div className="mb-6 relative z-10 select-none animate-fadeIn">
                    <span className={`block text-[9px] uppercase font-bold tracking-wider mb-2 font-mono ${
                      theme === "light" ? "text-slate-500" : "text-cyan-400"
                    }`}>
                      📂 Filter by Domain Category
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {["All", ...Array.from(new Set(allQuestions.map(q => q.domain || "General")))].map((domain) => {
                        const count = domain === "All" 
                          ? allQuestions.length 
                          : allQuestions.filter(q => (q.domain || "General").toLowerCase() === domain.toLowerCase()).length;
                        const isActive = domainFilter.toLowerCase() === domain.toLowerCase();
                        
                        return (
                          <button
                            key={domain}
                            type="button"
                            onClick={() => setDomainFilter(domain)}
                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer ${
                              isActive
                                ? theme === "light"
                                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                  : "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-md shadow-cyan-500/10"
                                : theme === "light"
                                  ? "bg-slate-50 hover:bg-slate-100 border-slate-250 text-slate-650"
                                  : "bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-350"
                            }`}
                          >
                            {domain} <span className={`ml-1 text-[9px] px-1 py-0.2 rounded font-bold ${
                              isActive 
                                ? theme === "light" ? "bg-indigo-700 text-indigo-100" : "bg-cyan-900/40 text-cyan-300"
                                : theme === "light" ? "bg-slate-200 text-slate-600" : "bg-slate-800 text-slate-500"
                            }`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {allQuestions.length > 0 && (
                  <div className={`flex flex-wrap items-center justify-between gap-3 mb-6 p-3 rounded-xl border font-mono text-xs select-none transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-200" : "bg-slate-950/30 border-slate-800/80"
                  }`}>
                    <div className="flex items-center space-x-3">
                      <input
                        id="select-all-checkbox"
                        type="checkbox"
                        checked={filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestionIds.includes(q.id))}
                        onChange={(e) => handleSelectAllQuestions(e.target.checked)}
                        className="h-4 w-4 accent-cyan-signal cursor-pointer"
                      />
                      <label htmlFor="select-all-checkbox" className={`cursor-pointer font-bold ${
                        theme === "light" ? "text-slate-700" : "text-slate-400"
                      }`}>
                        {filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestionIds.includes(q.id)) ? "Deselect All" : "Select All"}
                      </label>
                      
                      {selectedQuestionIds.length > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors duration-300 ${
                          theme === "light" ? "bg-indigo-50 text-indigo-650 border-indigo-200" : "bg-cyan-950/40 text-cyan-400 border-cyan-800/40"
                        }`}>
                          {selectedQuestionIds.length} Selected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3">
                      {selectedQuestionIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDeleteSelectedQuestions}
                          className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 px-3.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition cursor-pointer"
                        >
                          🗑️ Delete Selected
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDeleteAllQuestions}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 px-3.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition cursor-pointer"
                      >
                        🔥 Delete All Questions
                      </button>
                    </div>
                  </div>
                )}

                {loadingQuestions ? (
                  <p className="text-slate-505 font-mono text-xs text-center py-8">Fetching active question nodes...</p>
                ) : allQuestions.length === 0 ? (
                  <p className="text-slate-505 font-mono text-xs text-center py-8">No questions in pool. Click templates or compile custom queries to seed.</p>
                ) : filteredQuestions.length === 0 ? (
                  <p className="text-slate-505 font-mono text-xs text-center py-8">No active questions match the selected filter category "{domainFilter}".</p>
                ) : (
                  <div className="space-y-4">
                    {filteredQuestions.map((q, idx) => (
                      <div key={q.id} className={`border rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-700/80 transition-all font-mono text-xs ${
                        theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850/60"
                      }`}>
                        <div className="flex items-center space-x-3.5 flex-1 w-full">
                          {/* Checkbox selector */}
                          <input
                            type="checkbox"
                            checked={selectedQuestionIds.includes(q.id)}
                            onChange={() => toggleSelectQuestion(q.id)}
                            className="h-4 w-4 accent-cyan-signal cursor-pointer shrink-0"
                          />
                          
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold text-sm tracking-tight ${theme === "light" ? "text-slate-800" : "text-white"}`}>{idx + 1}. {q.title}</span>
                              {q.domain && (
                                <span className={`border text-[10px] px-1.5 py-0.5 rounded uppercase font-bold transition-colors duration-300 ${
                                  theme === "light" ? "bg-indigo-50 border-indigo-200 text-indigo-750" : "bg-cyan-950/20 border-cyan-800/30 text-cyan-400"
                                }`}>{q.domain}</span>
                              )}
                              <span className={`border text-[10px] px-1.5 py-0.5 rounded uppercase font-bold transition-colors duration-300 ${
                                theme === "light" ? "bg-white border-slate-250 text-slate-700" : "bg-slate-900 border border-slate-800 text-slate-400"
                              }`}>{q.type}</span>
                              <span className={`border text-[10px] px-1.5 py-0.5 rounded uppercase transition-colors duration-300 ${
                                theme === "light" ? "bg-white border-slate-250 text-slate-700" : "bg-slate-900 border border-slate-800 text-slate-400"
                              }`}>{q.difficulty}</span>
                              <span className={`border text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors duration-300 ${
                                theme === "light" ? "bg-indigo-50 border-indigo-200 text-indigo-750" : "bg-slate-900 border border-slate-800 text-cyan-400"
                              }`}>{q.points} pts</span>
                              {q.time_limit ? (
                                <span className="bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 px-1.5 py-0.5 rounded font-bold">⏱️ {q.time_limit}s</span>
                              ) : (
                                <span className={`border text-[10px] px-1.5 py-0.5 rounded transition-colors duration-300 ${
                                  theme === "light" ? "bg-white border-slate-250 text-slate-400" : "bg-slate-900/60 border-slate-850 text-slate-500"
                                }`}>Untimed</span>
                              )}
                            </div>
                            <p className={`leading-relaxed max-w-2xl font-sans text-xs line-clamp-2 ${
                              theme === "light" ? "text-slate-650" : "text-slate-400"
                            }`}>{q.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditQuestion(q.id)}
                            className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-center font-bold ${
                              theme === "light"
                                ? "bg-indigo-50 hover:bg-indigo-100 border-indigo-250 text-indigo-750"
                                : "bg-cyan-950/20 hover:bg-cyan-900/40 border-cyan-900/30 text-cyan-400 hover:text-cyan-300"
                            }`}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-center font-bold ${
                              theme === "light"
                                ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-650"
                                : "bg-rose-950/20 hover:bg-rose-900/40 border-rose-900/30 text-rose-400 hover:text-rose-300"
                            }`}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Design tips */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none font-mono">
                <div className={`border rounded-xl p-5 transition-colors duration-300 ${
                  theme === "light" ? "bg-slate-50 border-slate-200" : "bg-slate-900/10 border-slate-800"
                }`}>
                  <span className={`text-[10px] font-bold uppercase ${theme === "light" ? "text-indigo-650" : "text-cyan-400"}`}>💡 MCQ STRUCTURE TIPS</span>
                  <p className={`text-[11px] mt-2.5 leading-relaxed ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>
                    Simply describe the question, then list choices (e.g. A, B, C, D). Mention which one is the correct answer explicitly in the text. Llama 3.3 will extract all structures and sync it with the DB.
                  </p>
                </div>
                <div className={`border rounded-xl p-5 transition-colors duration-300 ${
                  theme === "light" ? "bg-slate-50 border-slate-200" : "bg-slate-900/10 border-slate-800"
                }`}>
                  <span className={`text-[10px] font-bold uppercase ${theme === "light" ? "text-indigo-650" : "text-cyan-400"}`}>💡 CODING QUESTIONS TIPS</span>
                  <p className={`text-[11px] mt-2.5 leading-relaxed ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>
                    Provide instructions for the coding challenge, including the function signature. Llama 3.3 will automatically draft Javascript/Python template starters and set up grader telemetry.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS PANEL */}
          {activeTab === "settings" && (
            <div className="flex-1 p-6 space-y-6 overflow-y-auto max-w-4xl mx-auto w-full">
              <div className={`border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-colors duration-300 ${
                theme === "light" ? "bg-white border-slate-200" : "bg-slate-900/40 border-slate-800"
              }`}>
                <div className={`flex justify-between items-center border-b pb-3.5 mb-6 select-none ${
                  theme === "light" ? "border-slate-200" : "border-slate-800/80"
                }`}>
                  <div>
                    <h2 className={`text-lg font-bold tracking-tight ${theme === "light" ? "text-slate-800" : "text-white"}`}>⚙️ HR Control Settings</h2>
                    <p className={`text-xs mt-1 font-mono ${theme === "light" ? "text-slate-505" : "text-slate-400"}`}>
                      Manage HR dashboard credentials, theme choices, database operations, and manual proctoring rules.
                    </p>
                  </div>
                </div>

                {/* Grid of Settings sections */}
                <div className="space-y-6">
                  
                  {/* Section 1: Dashboard Theme switcher */}
                  <div className={`p-5 rounded-xl border transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                  }`}>
                    <h3 className={`text-xs font-bold font-mono uppercase tracking-wider mb-3 ${theme === "light" ? "text-slate-650" : "text-slate-400"}`}>
                      🎨 Interface Theme
                    </h3>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => handleThemeChange("light")}
                        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg border font-mono text-xs cursor-pointer transition-all duration-150 ${
                          theme === "light"
                            ? "bg-cyan-500/10 text-cyan-600 border-cyan-300 font-bold"
                            : "bg-slate-905 border-slate-800 text-slate-400 hover:bg-slate-850"
                        }`}
                      >
                        <span>🌞 Light Corporate Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleThemeChange("dark")}
                        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg border font-mono text-xs cursor-pointer transition-all duration-150 ${
                          theme === "dark"
                            ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/20 font-bold"
                            : "bg-white border-slate-200 text-slate-655 hover:bg-slate-50"
                        }`}
                      >
                        <span>🌙 Dark Professional Mode</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Update Credentials Form */}
                  <form onSubmit={handleUpdateCredentials} className={`p-5 rounded-xl border space-y-4 transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                  }`}>
                    <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${theme === "light" ? "text-slate-655" : "text-slate-400"}`}>
                      🔑 Update HR Login Credentials
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Change the username and password required to unlock this HR administration panel.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          Current Password
                        </label>
                        <input
                          type="password"
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light"
                              ? "bg-white border-slate-350 text-slate-800 focus:border-cyan-500 focus:ring-cyan-500"
                              : "bg-[#0B0F19] border-slate-800 text-white focus:border-cyan-500 focus:ring-cyan-500"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          New Username
                        </label>
                        <input
                          type="text"
                          required
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="e.g. admin"
                          className={`w-full border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light"
                              ? "bg-white border-slate-350 text-slate-800 focus:border-cyan-500 focus:ring-cyan-500"
                              : "bg-[#0B0F19] border-slate-800 text-white focus:border-cyan-500 focus:ring-cyan-500"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-550">
                          New Password
                        </label>
                        <input
                          type="password"
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light"
                              ? "bg-white border-slate-350 text-slate-800 focus:border-cyan-500 focus:ring-cyan-500"
                              : "bg-[#0B0F19] border-slate-800 text-white focus:border-cyan-500 focus:ring-cyan-500"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-550">
                          Confirm Password
                        </label>
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light"
                              ? "bg-white border-slate-350 text-slate-800 focus:border-cyan-500 focus:ring-cyan-500"
                              : "bg-[#0B0F19] border-slate-800 text-white focus:border-cyan-500 focus:ring-cyan-500"
                          }`}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg font-bold font-mono text-[10px] uppercase transition cursor-pointer"
                    >
                      Save Credentials
                    </button>

                    {credentialsSavedMessage && (
                      <p className="text-emerald-500 text-[11px] font-bold animate-pulse font-mono">{credentialsSavedMessage}</p>
                    )}
                    {credentialsErrorMessage && (
                      <p className="text-rose-500 text-[11px] font-bold animate-pulse font-mono">{credentialsErrorMessage}</p>
                    )}
                  </form>

                  {/* Section 3: Reset Database purger */}
                  <div className={`p-5 rounded-xl border space-y-4 transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                  }`}>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-rose-550">
                      🗑️ Dangerous Operations: Reset System Records
                    </h3>
                    <p className="text-[11px] text-slate-505">
                      Purges all telemetry session logs, candidate registers, answers, audio streams, and screenshots. Questions and global timers are retained.
                    </p>
                    
                    <button
                      type="button"
                      disabled={isClearing}
                      onClick={handleClearDatabase}
                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 px-4 py-2 rounded-lg font-bold font-mono text-[10px] uppercase transition cursor-pointer disabled:opacity-50"
                    >
                      {isClearing ? "Purging records..." : "Purge Candidate Records"}
                    </button>

                    {clearingMessage && (
                      <p className="text-emerald-500 text-[11px] font-bold animate-pulse font-mono">{clearingMessage}</p>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}

        </main>

        {/* Edit Question Modal */}
        {editingQuestion && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`max-w-2xl w-full rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] font-mono text-xs p-6 transition-all duration-300 ${
              theme === "light" 
                ? "bg-white border-slate-200 text-slate-800 shadow-xl" 
                : "bg-[#0F141F]/95 border-slate-800 text-slate-250 shadow-2xl"
            }`}>
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <div>
                  <h3 className={`text-base font-bold ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                    ✏️ Edit Question Details
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                    Fix typos, spelling mistakes, or update metadata.
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setEditingQuestion(null)}
                  className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEditedQuestion} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Question Type
                    </label>
                    <div className={`border rounded-xl px-3 py-2.5 font-bold uppercase select-none ${
                      theme === "light" ? "bg-slate-100 border-slate-250 text-slate-600" : "bg-[#090C12] border-slate-850 text-cyan-400"
                    }`}>
                      {editingQuestion.type}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Domain
                    </label>
                    <select
                      value={editingQuestion.dropdown_domain || "General"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingQuestion({ 
                          ...editingQuestion, 
                          dropdown_domain: val,
                          domain: val === "Other" ? (editingQuestion.custom_domain || "") : val
                        });
                      }}
                      className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                      }`}
                    >
                      <option value="General">General</option>
                      <option value="Frontend">Frontend</option>
                      <option value="Backend">Backend</option>
                      <option value="Fullstack">Fullstack</option>
                      <option value="Data Science">Data Science</option>
                      <option value="Other">Other (Type custom role...)</option>
                    </select>

                    {editingQuestion.dropdown_domain === "Other" && (
                      <div className="space-y-1 pt-1.5 animate-fadeIn">
                        <label className={`block text-[8px] uppercase font-bold tracking-wider ${
                          theme === "light" ? "text-slate-500" : "text-cyan-400"
                        }`}>
                          ✏️ Custom Domain Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mobile Developer"
                          value={editingQuestion.custom_domain || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingQuestion({ 
                              ...editingQuestion, 
                              custom_domain: val,
                              domain: val
                            });
                          }}
                          className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                            theme === "light" 
                              ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                              : "bg-[#0B0F19] border-cyan-900/40 text-slate-100 focus:border-cyan-500"
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                    Question Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editingQuestion.title || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, title: e.target.value })}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                      theme === "light" 
                        ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                        : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                    Description / Prompt Body
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={editingQuestion.description || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, description: e.target.value })}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-sans focus:outline-none focus:ring-1 transition-all ${
                      theme === "light" 
                        ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                        : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Difficulty
                    </label>
                    <select
                      value={editingQuestion.difficulty || "medium"}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, difficulty: e.target.value })}
                      className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                      }`}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Points Weight
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={editingQuestion.points}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, points: parseInt(e.target.value) || 0 })}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Time Limit (seconds)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Untimed"
                      value={editingQuestion.time_limit !== null && editingQuestion.time_limit !== undefined ? editingQuestion.time_limit : ""}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, time_limit: e.target.value !== "" ? parseInt(e.target.value) : null })}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                      }`}
                    />
                  </div>
                </div>

                {/* MCQ Options */}
                {editingQuestion.type === "mcq" && (
                  <div className={`space-y-3 p-4 rounded-xl border border-dashed transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-300" : "bg-[#090C12]/40 border-slate-800"
                  }`}>
                    <div className="flex justify-between items-center">
                      <label className={`block text-[9px] uppercase font-bold tracking-wider ${
                        theme === "light" ? "text-indigo-650" : "text-cyan-400"
                      }`}>
                        🎛️ MCQ Options & Correct Answer Selector
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {editingQuestion.choices.map((choice: string, idx: number) => {
                        const letter = String.fromCharCode(65 + idx);
                        return (
                          <div key={idx} className="space-y-1">
                            <label className="block text-[9px] text-slate-400 font-bold uppercase">
                              Option {letter}
                            </label>
                            <input
                              type="text"
                              required
                              value={choice}
                              onChange={(e) => {
                                const newChoices = [...editingQuestion.choices];
                                newChoices[idx] = e.target.value;
                                setEditingQuestion({ ...editingQuestion, choices: newChoices });
                              }}
                              placeholder={`Option ${letter} value`}
                              className={`w-full border rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:ring-1 transition-all ${
                                theme === "light" 
                                  ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                                  : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-1 pt-2">
                      <label className="block text-[9px] text-slate-400 font-bold uppercase">
                        Select Correct Answer Choice Letter
                      </label>
                      <select
                        value={editingQuestion.correct_index}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_index: parseInt(e.target.value) })}
                        className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                          theme === "light" 
                            ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                            : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                        }`}
                      >
                        {editingQuestion.choices.map((choice: string, idx: number) => {
                          const letter = String.fromCharCode(65 + idx);
                          return (
                            <option key={idx} value={idx}>
                              Option {letter} (Value: {choice || "(empty)"})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* Coding Fields */}
                {editingQuestion.type === "coding" && (
                  <div className={`space-y-3 p-4 rounded-xl border border-dashed transition-colors duration-300 ${
                    theme === "light" ? "bg-slate-50 border-slate-300" : "bg-[#090C12]/40 border-slate-800"
                  }`}>
                    <div className="space-y-1">
                      <label className={`block text-[9px] uppercase font-bold tracking-wider ${
                        theme === "light" ? "text-indigo-650" : "text-cyan-400"
                      }`}>
                        🐍 Starter Code Template
                      </label>
                      <textarea
                        rows={6}
                        value={editingQuestion.sample_code || ""}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, sample_code: e.target.value })}
                        placeholder="def solution():\n    # code goes here\n    pass"
                        className={`w-full border rounded-xl p-3 font-mono text-[10px] focus:outline-none focus:border-cyan-500 ${
                          theme === "light"
                            ? "bg-slate-100 border-slate-250 text-slate-800"
                            : "bg-[#05080E] border-slate-850 text-emerald-400"
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`block text-[9px] uppercase font-bold tracking-wider ${
                        theme === "light" ? "text-indigo-650" : "text-cyan-400"
                      }`}>
                        🧪 Test Cases JSON Format
                      </label>
                      <p className="text-[10px] text-slate-500 pb-1">
                        Provide a JSON array of test cases. Example: <code>{`[{"input": [2, 3], "output": 5}]`}</code>
                      </p>
                      <textarea
                        rows={5}
                        value={editingQuestion.test_cases_str || ""}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, test_cases_str: e.target.value })}
                        placeholder='[{"input": [2, 3], "output": 5}]'
                        className={`w-full border rounded-xl p-3 font-mono text-[10px] focus:outline-none focus:border-cyan-500 ${
                          theme === "light"
                            ? "bg-slate-100 border-slate-250 text-slate-800"
                            : "bg-[#05080E] border-slate-850 text-indigo-400"
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Error and Success Indicators */}
                {editError && (
                  <p className="text-rose-500 text-[11px] font-bold font-mono animate-pulse">{editError}</p>
                )}
                {editSuccess && (
                  <p className="text-emerald-500 text-[11px] font-bold font-mono animate-pulse">{editSuccess}</p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className={`px-4 py-2 rounded-xl border text-[10px] font-bold uppercase transition cursor-pointer ${
                      theme === "light"
                        ? "bg-slate-100 hover:bg-slate-200 border-slate-350 text-slate-700"
                        : "bg-[#0E121E] hover:bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingQuestion}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingQuestion ? "Saving Changes..." : "✓ Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Candidate Modal */}
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`max-w-md w-full rounded-2xl border shadow-2xl font-mono text-xs p-6 transition-all duration-300 ${
              theme === "light" 
                ? "bg-white border-slate-200 text-slate-800 shadow-xl" 
                : "bg-[#0F141F]/95 border-slate-800 text-slate-250 shadow-2xl"
            }`}>
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <div>
                  <h3 className={`text-base font-bold ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                    ✉️ Invite New Candidate
                  </h3>
                  <p className={`text-[10px] mt-0.5 ${theme === "light" ? "text-slate-505" : "text-slate-400"}`}>
                    Pre-register a candidate and generate their secure invite key.
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setInviteError(null);
                  }}
                  className="text-slate-400 hover:text-slate-250 text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleInviteCandidate} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                    Candidate Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Alice Smith"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                      theme === "light" 
                        ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                        : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. alice@company.com"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                      theme === "light" 
                        ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                        : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Assessment Track (Domain)
                    </label>
                    <select
                      value={inviteDomain}
                      onChange={(e) => setInviteDomain(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 transition-all cursor-pointer ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-855 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-250 focus:border-cyan-500"
                      }`}
                    >
                      <option value="General">General</option>
                      <option value="Frontend">Frontend</option>
                      <option value="Backend">Backend</option>
                      <option value="Fullstack">Fullstack</option>
                      <option value="Data Science">Data Science</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                      Time Limit (Minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      required
                      value={inviteDuration}
                      onChange={(e) => setInviteDuration(parseInt(e.target.value) || 20)}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-slate-800 text-slate-100 focus:border-cyan-500"
                      }`}
                    />
                  </div>
                </div>

                {inviteDomain === "Other" && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className={`block text-[8px] uppercase font-bold tracking-wider ${
                      theme === "light" ? "text-slate-500" : "text-cyan-400"
                    }`}>
                      ✏️ Custom Track Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. System Architect"
                      value={customInviteDomain}
                      onChange={(e) => setCustomInviteDomain(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 transition-all ${
                        theme === "light" 
                          ? "bg-white border-slate-350 text-slate-850 focus:border-indigo-500 focus:ring-indigo-500" 
                          : "bg-[#0B0F19] border-cyan-900/40 text-slate-100 focus:border-cyan-500"
                      }`}
                    />
                  </div>
                )}

                {inviteError && (
                  <p className="text-rose-500 text-[10px] font-bold font-mono animate-pulse">{inviteError}</p>
                )}

                <div className="flex items-center justify-end space-x-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInviteModalOpen(false);
                      setInviteError(null);
                    }}
                    className={`px-4 py-2 rounded-xl border text-[10px] font-bold uppercase transition cursor-pointer ${
                      theme === "light"
                        ? "bg-slate-100 border-slate-350 text-slate-750 hover:bg-slate-200"
                        : "bg-[#0E121E] border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={invitingCandidate}
                    className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 font-bold"
                  >
                    {invitingCandidate ? "Generating..." : "Generate Invite"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Success Details Modal */}
        {inviteSuccessData && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`max-w-md w-full rounded-2xl border shadow-2xl font-mono text-xs p-6 transition-all duration-300 ${
              theme === "light" 
                ? "bg-white border-slate-200 text-slate-800 shadow-xl" 
                : "bg-[#0F141F]/95 border-slate-800 text-slate-250 shadow-2xl"
            }`}>
              <div className="flex items-center space-x-2 border-b pb-4 mb-4 text-emerald-500">
                <span className="text-base font-bold">🎉 Invite Code Generated!</span>
              </div>

              <div className="space-y-4">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Pre-registration code generated for candidate assessment track. Share this unique invite key or direct link with the candidate:
                </p>

                <div className={`p-4 rounded-xl space-y-2 border ${
                  theme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#0B0F19] border-slate-850"
                }`}>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">CANDIDATE:</span>
                    <span className={`font-semibold ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                      {inviteSuccessData.name}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-[9px] text-slate-505 font-bold uppercase">EMAIL:</span>
                    <span className={`font-semibold ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                      {inviteSuccessData.email}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">TRACK:</span>
                    <span className="font-semibold text-cyan-400">{inviteSuccessData.domain}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">ACCESS KEY:</span>
                    <span className="font-bold text-indigo-500 select-all text-sm">{inviteSuccessData.sec_id || inviteSuccessData.id}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">
                    Direct Invite Link Url
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/?code=${inviteSuccessData.sec_id || inviteSuccessData.id}`}
                      className="flex-1 bg-[#05080E] border border-slate-850 text-cyan-400 rounded-xl px-3 py-2.5 font-mono text-[10px] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const inviteLink = `${window.location.origin}/?code=${inviteSuccessData.sec_id || inviteSuccessData.id}`;
                        navigator.clipboard.writeText(inviteLink);
                        alert("Copied Invite Link to clipboard:\n" + inviteLink);
                      }}
                      className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold font-mono text-[10px] px-3.5 py-2.5 rounded-xl uppercase tracking-wider transition cursor-pointer shrink-0"
                    >
                      📋 Copy Link
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setInviteSuccessData(null)}
                    className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
