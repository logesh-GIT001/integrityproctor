from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime

# Candidate
class CandidateCreate(BaseModel):
    name: str
    email: EmailStr

class CandidateResponse(BaseModel):
    id: int
    name: str
    email: str
    status: str
    trust_score: float
    technical_score: float
    ai_summary: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Question
class QuestionCreate(BaseModel):
    type: str  # mcq, coding
    title: str
    description: str
    difficulty: str = "medium"
    points: int = 10
    choices: Optional[List[str]] = None
    sample_code: Optional[str] = None
    test_cases: Optional[List[dict]] = None
    correct_answer: Optional[str] = None

class QuestionResponse(BaseModel):
    id: int
    type: str
    title: str
    description: str
    difficulty: str
    points: int
    choices: Optional[List[str]] = None
    sample_code: Optional[str] = None
    # We omit test_cases and correct_answer in standard response to prevent cheating

    class Config:
        from_attributes = True

# CandidateAnswer
class AnswerSubmit(BaseModel):
    question_id: int
    mcq_answer: Optional[str] = None
    coding_submission: Optional[str] = None

class AnswerResponse(BaseModel):
    id: int
    candidate_id: int
    question_id: int
    mcq_answer: Optional[str] = None
    coding_submission: Optional[str] = None
    is_correct: Optional[bool] = None
    points_earned: int
    graded_at: datetime

    class Config:
        from_attributes = True

# IntegrityEvent
class IntegrityEventCreate(BaseModel):
    event_type: str
    timestamp: Optional[datetime] = None
    confidence: float = 1.0
    details: Optional[str] = None

class IntegrityEventResponse(BaseModel):
    id: int
    candidate_id: int
    event_type: str
    timestamp: datetime
    confidence: float
    evidence_snapshot_path: Optional[str] = None
    details: Optional[str] = None

    class Config:
        from_attributes = True

# Full Report
class CandidateReport(BaseModel):
    candidate: CandidateResponse
    answers: List[AnswerResponse]
    events: List[IntegrityEventResponse]
