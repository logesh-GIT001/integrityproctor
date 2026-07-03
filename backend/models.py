from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="invited")  # invited, testing, completed
    trust_score = Column(Float, default=100.0)
    technical_score = Column(Float, default=0.0)
    ai_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    answers = relationship("CandidateAnswer", back_populates="candidate", cascade="all, delete-orphan")
    events = relationship("IntegrityEvent", back_populates="candidate", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)  # mcq, coding
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    difficulty = Column(String, default="medium")  # easy, medium, hard
    points = Column(Integer, default=10)
    choices = Column(Text, nullable=True)  # JSON-serialized list for MCQ
    sample_code = Column(Text, nullable=True)  # starter code template for coding questions
    test_cases = Column(Text, nullable=True)  # JSON-serialized list of input/output dicts
    correct_answer = Column(String, nullable=True)  # correct option letter for MCQ

    answers = relationship("CandidateAnswer", back_populates="question", cascade="all, delete-orphan")

class CandidateAnswer(Base):
    __tablename__ = "candidate_answers"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    mcq_answer = Column(String, nullable=True)
    coding_submission = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    points_earned = Column(Integer, default=0)
    graded_at = Column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate", back_populates="answers")
    question = relationship("Question", back_populates="answers")

class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    event_type = Column(String, nullable=False)  # tab_switch, fullscreen_exit, copy_paste, window_blur, face_absent, face_multiple, yolo_phone, gaze_away
    timestamp = Column(DateTime, default=datetime.utcnow)
    confidence = Column(Float, default=1.0)
    evidence_snapshot_path = Column(String, nullable=True)
    details = Column(Text, nullable=True)  # JSON or text description

    candidate = relationship("Candidate", back_populates="events")
