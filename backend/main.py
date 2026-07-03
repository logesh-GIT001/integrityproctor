import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import httpx

from backend.database import engine, Base, get_db, SessionLocal
from backend.models import Candidate, Question, CandidateAnswer, IntegrityEvent
from backend.schemas import (
    CandidateCreate, CandidateResponse, QuestionResponse,
    AnswerSubmit, AnswerResponse, IntegrityEventCreate,
    IntegrityEventResponse, CandidateReport
)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Integrity Proctor API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed Questions
def seed_questions(db: Session):
    if db.query(Question).count() == 0:
        questions = [
            Question(
                type="mcq",
                title="Python List Slicing",
                description="What is the result of `my_list[::-1]` where `my_list = [1, 2, 3, 4]`?",
                difficulty="easy",
                points=10,
                choices=json.dumps(["[4, 3, 2, 1]", "[1, 2, 3, 4]", "[4, 3, 2]", "IndexError"]),
                correct_answer="[4, 3, 2, 1]"
            ),
            Question(
                type="mcq",
                title="Complexity of Binary Search",
                description="What is the worst-case time complexity of the Binary Search algorithm on a sorted list of size n?",
                difficulty="medium",
                points=10,
                choices=json.dumps(["O(1)", "O(log n)", "O(n)", "O(n log n)"]),
                correct_answer="O(log n)"
            ),
            Question(
                type="coding",
                title="Reverse a String",
                description="Write a function `reverse_string(s: str) -> str` that takes a string `s` and returns it reversed. Do not use built-in reverse functions.",
                difficulty="easy",
                points=20,
                sample_code="def reverse_string(s: str) -> str:\n    # Write your code here\n    pass",
                test_cases=json.dumps([
                    {"args": ["hello"], "expected": "olleh"},
                    {"args": ["world"], "expected": "dlrow"},
                    {"args": ["antigravity"], "expected": "ytivargitna"},
                    {"args": ["a"], "expected": "a"},
                    {"args": ["Ready"], "expected": "ydaeR"}
                ])
            ),
            Question(
                type="coding",
                title="Sum of Even Numbers",
                description="Write a function `sum_evens(lst: list[int]) -> int` that returns the sum of all even numbers in the list `lst`.",
                difficulty="medium",
                points=20,
                sample_code="def sum_evens(lst: list[int]) -> int:\n    # Write your code here\n    pass",
                test_cases=json.dumps([
                    {"args": [[1, 2, 3, 4, 5, 6]], "expected": 12},
                    {"args": [[]], "expected": 0},
                    {"args": [[1, 3, 5]], "expected": 0},
                    {"args": [[-2, 4, 0]], "expected": 2},
                    {"args": [[10, 20, 31, 40]], "expected": 70}
                ])
            )
        ]
        db.add_all(questions)
        db.commit()

# Run seed on start
with SessionLocal() as db:
    seed_questions(db)

# Code grader helper
def grade_coding_solution(code_str: str, question: Question) -> bool:
    if not question.test_cases:
        return True
    
    test_cases = json.loads(question.test_cases)
    # Determine the function name from the sample code
    # e.g., "def reverse_string(s: str)" -> "reverse_string"
    func_name = None
    for line in question.sample_code.split("\n"):
        if line.strip().startswith("def "):
            func_name = line.strip().split("def ")[1].split("(")[0].strip()
            break
            
    if not func_name:
        return False

    # Execute inside a restricted namespace for simple demo
    local_env = {}
    try:
        exec(code_str, {}, local_env)
        func = local_env.get(func_name)
        if not func:
            return False
            
        for case in test_cases:
            args = case.get("args", [])
            expected = case.get("expected")
            # Call function
            result = func(*args)
            if result != expected:
                return False
        return True
    except Exception:
        return False

# Trust Score deduction dictionary
DEDUCTIONS = {
    "tab_switch": 10.0,
    "fullscreen_exit": 15.0,
    "window_blur": 5.0,
    "copy_paste": 5.0,
    "face_absent": 8.0,
    "face_multiple": 12.0,
    "gaze_away": 4.0,
    "yolo_phone": 20.0
}

# --- Candidate Endpoints ---

@app.post("/candidates/", response_model=CandidateResponse)
def create_candidate(candidate_in: CandidateCreate, db: Session = Depends(get_db)):
    db_candidate = db.query(Candidate).filter(Candidate.email == candidate_in.email).first()
    if db_candidate:
        return db_candidate
    
    new_candidate = Candidate(
        name=candidate_in.name,
        email=candidate_in.email,
        status="invited"
    )
    db.add(new_candidate)
    db.commit()
    db.refresh(new_candidate)
    return new_candidate

@app.get("/candidates/", response_model=List[CandidateResponse])
def list_candidates(db: Session = Depends(get_db)):
    return db.query(Candidate).all()

@app.get("/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

@app.post("/candidates/{candidate_id}/start")
def start_assessment(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    candidate.status = "testing"
    candidate.started_at = datetime.utcnow()
    candidate.trust_score = 100.0
    candidate.technical_score = 0.0
    candidate.ai_summary = None
    
    # Clear previous answers and events
    candidate.answers.clear()
    candidate.events.clear()
    
    db.commit()
    
    # Get all questions without answering criteria (safe questions)
    questions = db.query(Question).all()
    response_questions = []
    for q in questions:
        choices = json.loads(q.choices) if q.choices else None
        response_questions.append({
            "id": q.id,
            "type": q.type,
            "title": q.title,
            "description": q.description,
            "difficulty": q.difficulty,
            "points": q.points,
            "choices": choices,
            "sample_code": q.sample_code
        })
    return {"status": "started", "questions": response_questions}

@app.post("/candidates/{candidate_id}/submit-answer", response_model=AnswerResponse)
def submit_answer(candidate_id: int, submission: AnswerSubmit, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    question = db.query(Question).filter(Question.id == submission.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Grade answer
    is_correct = False
    points_earned = 0
    
    if question.type == "mcq":
        is_correct = (submission.mcq_answer == question.correct_answer)
    elif question.type == "coding":
        is_correct = grade_coding_solution(submission.coding_submission, question)
        
    if is_correct:
        points_earned = question.points
        
    # Check if duplicate answer exists
    existing_ans = db.query(CandidateAnswer).filter(
        CandidateAnswer.candidate_id == candidate_id,
        CandidateAnswer.question_id == submission.question_id
    ).first()
    
    if existing_ans:
        existing_ans.mcq_answer = submission.mcq_answer
        existing_ans.coding_submission = submission.coding_submission
        existing_ans.is_correct = is_correct
        existing_ans.points_earned = points_earned
        existing_ans.graded_at = datetime.utcnow()
        db_ans = existing_ans
    else:
        db_ans = CandidateAnswer(
            candidate_id=candidate_id,
            question_id=submission.question_id,
            mcq_answer=submission.mcq_answer,
            coding_submission=submission.coding_submission,
            is_correct=is_correct,
            points_earned=points_earned
        )
        db.add(db_ans)
        
    db.commit()
    db.refresh(db_ans)
    return db_ans

@app.post("/candidates/{candidate_id}/log-event", response_model=IntegrityEventResponse)
def log_event(candidate_id: int, event_in: IntegrityEventCreate, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Create integrity event
    db_event = IntegrityEvent(
        candidate_id=candidate_id,
        event_type=event_in.event_type,
        timestamp=event_in.timestamp or datetime.utcnow(),
        confidence=event_in.confidence,
        details=event_in.details
    )
    db.add(db_event)
    
    # Calculate new trust score
    deduction = DEDUCTIONS.get(event_in.event_type, 5.0)
    # Apply deduction factoring in confidence (optional refinement, here direct deduction)
    candidate.trust_score = max(0.0, candidate.trust_score - deduction)
    
    db.commit()
    db.refresh(db_event)
    return db_event

@app.post("/candidates/{candidate_id}/complete")
def complete_assessment(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    candidate.status = "completed"
    candidate.completed_at = datetime.utcnow()
    
    # Calculate final technical score percentage
    total_earned = sum(ans.points_earned for ans in candidate.answers)
    total_possible = sum(ans.question.points for ans in candidate.answers)
    
    # If no answers submitted, default to 0
    if total_possible > 0:
        candidate.technical_score = round((total_earned / total_possible) * 100, 1)
    else:
        candidate.technical_score = 0.0
        
    db.commit()
    return {"status": "completed", "trust_score": candidate.trust_score, "technical_score": candidate.technical_score}

@app.get("/candidates/{candidate_id}/report", response_model=CandidateReport)
def get_report(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    return CandidateReport(
        candidate=candidate,
        answers=candidate.answers,
        events=candidate.events
    )

@app.post("/candidates/{candidate_id}/ai-summary")
async def generate_ai_summary(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Gather logs for Claude summary
    events = db.query(IntegrityEvent).filter(IntegrityEvent.candidate_id == candidate_id).all()
    answers = db.query(CandidateAnswer).filter(CandidateAnswer.candidate_id == candidate_id).all()
    
    events_log = []
    for e in events:
        events_log.append(f"- {e.timestamp.strftime('%H:%M:%S')}: {e.event_type} (Confidence: {e.confidence:.2f}). Details: {e.details or 'None'}")
        
    answers_log = []
    for a in answers:
        answers_log.append(f"- Question {a.question_id} ({a.question.type}): Earned {a.points_earned}/{a.question.points} points. Correct: {a.is_correct}")

    event_summary_str = "\n".join(events_log) if events_log else "No anomalies detected."
    answer_summary_str = "\n".join(answers_log) if answers_log else "No questions answered."
    
    prompt = f"""
    You are an AI Proctor Assistant summarizing a candidate's test integrity and coding performance.
    
    Candidate Name: {candidate.name}
    Technical Score: {candidate.technical_score}%
    Trust Score: {candidate.trust_score}/100
    
    Integrity Event Logs:
    {event_summary_str}
    
    Performance Logs:
    {answer_summary_str}
    
    Provide a concise assessment (2-3 paragraphs max) summarizing:
    1. Overall trust level and whether flags suggest active cheating or simple environment noise.
    2. Technical performance.
    3. Final recommendation (Proceed, Watch closely, or Reject).
    """

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback simulated AI analysis
        verdict = "PASS"
        if candidate.trust_score < 50:
            verdict = "REJECT (Critical Integrity Violations)"
        elif candidate.trust_score < 80:
            verdict = "FLAGGED (Review Required)"
            
        summary = f"[Simulated Proctor Analysis - No API Key Set]\n\n"
        summary += f"Candidate {candidate.name} completed the assessment with a Technical Score of {candidate.technical_score}% and a final integrity Trust Score of {candidate.trust_score}/100. "
        
        if candidate.trust_score == 100:
            summary += "The integrity logs indicate a pristine testing session with zero anomalous browser behavior or webcam monitoring alerts. The candidate remained focused throughout the evaluation."
        else:
            summary += f"The integrity logs show {len(events)} recorded flags. Specifically, we logged event types: {', '.join(set(e.event_type for e in events))}. "
            if any(e.event_type == "tab_switch" for e in events):
                summary += "Frequent tab switches indicate candidate may have navigated away to seek outer resources or documentation. "
            if any(e.event_type in ["face_absent", "face_multiple"] for e in events):
                summary += "Webcam tracking alerts indicate periods where the candidate was absent from the frame or secondary individuals were present. "
                
        summary += f"\n\nTechnical grading reports that the candidate successfully answered {len([a for a in answers if a.is_correct])} out of {len(answers)} questions correctly. "
        summary += f"\n\n**Recommendation Verdict: {verdict}**"
        
        candidate.ai_summary = summary
        db.commit()
        return {"summary": summary, "simulated": True}
        
    try:
        # Real Anthropic API Call
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-5-sonnet-20240620",
                    "max_tokens": 500,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=15.0
            )
            if response.status_code == 200:
                data = response.json()
                summary = data["content"][0]["text"]
                candidate.ai_summary = summary
                db.commit()
                return {"summary": summary, "simulated": False}
            else:
                raise HTTPException(status_code=502, detail=f"Claude API error: {response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")
