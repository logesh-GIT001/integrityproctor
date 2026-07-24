import os
import json
import shutil
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_
from sqlalchemy.orm import Session
import httpx

from database import engine, Base, get_db, SessionLocal
from models import Candidate, Question, CandidateAnswer, IntegrityEvent, Setting
from schemas import (
    CandidateCreate,
    CandidateResponse,
    QuestionResponse,
    AnswerSubmit,
    AnswerResponse,
    IntegrityEventCreate,
    IntegrityEventResponse,
    CandidateReport,
)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Integrity Proctor API")

# Configure uploads directory inside static folder
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files to serve candidate audio uploads
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

async def upload_file_to_supabase(file_bytes: bytes, filename: str, mime_type: str) -> str | None:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        return None
    
    supabase_url = supabase_url.rstrip("/")
    bucket_name = "proctor-uploads"
    upload_url = f"{supabase_url}/storage/v1/object/{bucket_name}/{filename}"
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": mime_type
            }
            response = await client.post(upload_url, content=file_bytes, headers=headers, timeout=20.0)
            if response.status_code == 200:
                return f"{supabase_url}/storage/v1/object/public/{bucket_name}/{filename}"
            else:
                print(f"Supabase Storage Upload failed ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"Error uploading to Supabase: {str(e)}")
    return None


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
                correct_answer="[4, 3, 2, 1]",
                time_limit=45,
                domain="Backend"
            ),
            Question(
                type="mcq",
                title="Complexity of Binary Search",
                description="What is the worst-case time complexity of the Binary Search algorithm on a sorted list of size n?",
                difficulty="medium",
                points=10,
                choices=json.dumps(["O(1)", "O(log n)", "O(n)", "O(n log n)"]),
                correct_answer="O(log n)",
                time_limit=60,
                domain="General"
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
                ]),
                time_limit=300,
                domain="Frontend"
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
                ]),
                time_limit=None,
                domain="Backend"
            )
        ]
        db.add_all(questions)
        db.commit()

# Run seed on start
with SessionLocal() as db:
    seed_questions(db)
    if db.query(Setting).filter(Setting.key == "overall_time_limit").count() == 0:
        db.add(Setting(key="overall_time_limit", value="1200"))
        db.commit()
    if db.query(Setting).filter(Setting.key == "max_strikes").count() == 0:
        db.add(Setting(key="max_strikes", value="3"))
        db.commit()

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
    "tab_switch": 15.0,
    "fullscreen_exit": 20.0,
    "window_blur": 8.0,
    "copy_paste": 5.0,
    "face_absent": 25.0,          # Camera/face absent: major penalty
    "face_multiple": 30.0,        # Multiple faces: major penalty
    "gaze_away": 10.0,            # Gaze away: medium penalty
    "yolo_phone": 40.0,           # Phone detected: critical penalty
    "speaking_no_movement": 25.0, # Voice detection anomaly: major penalty
    "periodic_snapshot": 0.0
}

# --- Candidate Endpoints ---

@app.post("/candidates/", response_model=CandidateResponse)
def create_candidate(candidate_in: CandidateCreate, db: Session = Depends(get_db)):
    db_candidate = db.query(Candidate).filter(Candidate.email == candidate_in.email).first()
    import uuid
    if db_candidate:
        if not db_candidate.sec_id:
            db_candidate.sec_id = f"SEC-{uuid.uuid4().hex[:10].upper()}"
        # Update name if changed under the same email
        db_candidate.name = candidate_in.name
        # Reset existing candidate session for re-run with new overall_time_limit setting
        db_candidate.status = "invited"
        db_candidate.trust_score = 100.0
        db_candidate.technical_score = 0.0
        db_candidate.ai_summary = None
        db_candidate.started_at = None
        db_candidate.completed_at = None
        db_candidate.overall_time_limit = candidate_in.overall_time_limit
        db_candidate.domain = candidate_in.domain
        db.commit()
        db.refresh(db_candidate)
        return db_candidate
    
    new_candidate = Candidate(
        sec_id=f"SEC-{uuid.uuid4().hex[:10].upper()}",
        name=candidate_in.name,
        email=candidate_in.email,
        status="invited",
        overall_time_limit=candidate_in.overall_time_limit,
        domain=candidate_in.domain
    )
    db.add(new_candidate)
    db.commit()
    db.refresh(new_candidate)
    return new_candidate

def find_candidate(identifier: str, db: Session) -> Candidate:
    # Try looking up by sec_id first
    cand = db.query(Candidate).filter(Candidate.sec_id == identifier).first()
    if cand:
        return cand
    # Fallback to integer id lookup
    if identifier.isdigit():
        cand = db.query(Candidate).filter(Candidate.id == int(identifier)).first()
        if cand:
            return cand
    return None

@app.get("/candidates/", response_model=List[CandidateResponse])
def list_candidates(db: Session = Depends(get_db)):
    return db.query(Candidate).all()

@app.get("/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

@app.post("/candidates/{candidate_id}/start")
def start_assessment(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    if candidate.status == "completed":
        raise HTTPException(status_code=400, detail="This assessment has already been completed.")
    if candidate.status == "blocked":
        raise HTTPException(status_code=403, detail="Access denied. This candidate session has been blocked.")
        
    # Read overall time limit from global settings
    setting = db.query(Setting).filter(Setting.key == "overall_time_limit").first()
    overall_time_limit = int(setting.value) if (setting and setting.value) else None
    
    # Read max strikes from global settings
    setting_strikes = db.query(Setting).filter(Setting.key == "max_strikes").first()
    max_strikes = int(setting_strikes.value) if (setting_strikes and setting_strikes.value) else 3
    
    candidate.status = "testing"
    candidate.started_at = datetime.utcnow()
    candidate.trust_score = 100.0
    candidate.technical_score = 0.0
    candidate.ai_summary = None
    candidate.overall_time_limit = overall_time_limit
    
    # Clear previous answers and events
    candidate.answers.clear()
    candidate.events.clear()
    
    db.commit()
    
    # Get all questions matching candidate's domain OR "General"
    cand_domain = candidate.domain or "General"
    questions = db.query(Question).filter(
        or_(Question.domain == cand_domain, Question.domain == "General", Question.domain == None)
    ).all()
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
            "sample_code": q.sample_code,
            "time_limit": q.time_limit
        })
    return {
        "status": "started",
        "overall_time_limit": candidate.overall_time_limit,
        "max_strikes": max_strikes,
        "questions": response_questions
    }

@app.post("/candidates/{candidate_id}/submit-answer", response_model=AnswerResponse)
def submit_answer(candidate_id: str, submission: AnswerSubmit, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
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
    elif question.type == "paragraph":
        is_correct = True if (submission.coding_submission and len(submission.coding_submission.strip()) > 0) else False
        
    if is_correct:
        points_earned = question.points
        
    # Check if duplicate answer exists
    existing_ans = db.query(CandidateAnswer).filter(
        CandidateAnswer.candidate_id == candidate.id,
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
            candidate_id=candidate.id,
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
async def log_event(candidate_id: str, event_in: IntegrityEventCreate, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    snapshot_path = None
    if event_in.evidence_snapshot and event_in.evidence_snapshot.startswith("data:image/"):
        import base64
        import uuid
        try:
            # Decode base64 image
            header, encoded = event_in.evidence_snapshot.split(",", 1)
            data = base64.b64decode(encoded)
            
            filename = f"event_{uuid.uuid4().hex}.jpg"
            
            # Try to upload to Supabase Storage first
            supabase_path = await upload_file_to_supabase(data, f"snapshots/{filename}", "image/jpeg")
            if supabase_path:
                snapshot_path = supabase_path
            else:
                # Save file locally
                snapshots_dir = os.path.join(UPLOAD_DIR, "snapshots")
                os.makedirs(snapshots_dir, exist_ok=True)
                file_dest = os.path.join(snapshots_dir, filename)
                with open(file_dest, "wb") as f:
                    f.write(data)
                snapshot_path = f"/static/uploads/snapshots/{filename}"
        except Exception as e:
            print(f"Error saving snapshot: {str(e)}")
    
    # Create integrity event
    db_event = IntegrityEvent(
        candidate_id=candidate.id,
        event_type=event_in.event_type,
        timestamp=event_in.timestamp or datetime.utcnow(),
        confidence=event_in.confidence,
        details=event_in.details,
        evidence_snapshot_path=snapshot_path
    )
    db.add(db_event)
    
    # Calculate new trust score
    deduction = DEDUCTIONS.get(event_in.event_type, 5.0)
    candidate.trust_score = max(0.0, candidate.trust_score - deduction)
    
    db.commit()
    db.refresh(db_event)
    return db_event

async def run_ai_summary_generation(candidate, db: Session) -> str:
    # Gather logs for Llama summary
    events = db.query(IntegrityEvent).filter(IntegrityEvent.candidate_id == candidate.id).all()
    answers = db.query(CandidateAnswer).filter(CandidateAnswer.candidate_id == candidate.id).all()
    
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

    groq_key = os.getenv("GROQ_API_KEY")
    
    # 1. Try real Groq API Call
    if groq_key:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "max_tokens": 500,
                        "temperature": 0.2,
                        "messages": [{"role": "user", "content": prompt}]
                    },
                    timeout=15.0
                )
                if response.status_code == 200:
                    data = response.json()
                    summary = data["choices"][0]["message"]["content"]
                    candidate.ai_summary = summary
                    db.commit()
                    return summary
                else:
                    print(f"Groq API error ({response.status_code}): {response.text}")
        except Exception as e:
            print(f"Failed to connect to Groq API: {str(e)}")

    # 2. Fallback simulated AI analysis
    verdict = "PASS"
    if candidate.trust_score < 50:
        verdict = "REJECT (Critical Integrity Violations)"
    elif candidate.trust_score < 80:
        verdict = "FLAGGED (Review Required)"
        
    summary = f"[Simulated Proctor Analysis - Groq Key Offline/Failed]\n\n"
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
    return summary

@app.post("/candidates/{candidate_id}/complete")
async def complete_assessment(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    candidate.status = "completed"
    candidate.completed_at = datetime.utcnow()
    
    # Calculate final technical score percentage
    total_earned = sum(ans.points_earned for ans in candidate.answers)
    cand_domain = candidate.domain or "General"
    q_query = db.query(Question).filter(
        or_(Question.domain == cand_domain, Question.domain == "General", Question.domain == None)
    )
    total_possible = sum(q.points for q in q_query.all())
    
    # If no answers submitted or no questions exist, default to 0
    if total_possible > 0:
        candidate.technical_score = round((total_earned / total_possible) * 100, 1)
    else:
        candidate.technical_score = 0.0
        
    db.commit()

    # Automatically generate AI Proctor Verdict summary
    try:
        await run_ai_summary_generation(candidate, db)
    except Exception as e:
        print(f"Error in automatic AI summary generation: {str(e)}")

    return {"status": "completed", "trust_score": candidate.trust_score, "technical_score": candidate.technical_score}

@app.post("/candidates/{candidate_id}/upload-audio")
async def upload_audio(candidate_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    file_bytes = await file.read()
    filename = f"candidate_{candidate.id}.webm"
    
    # Try to upload to Supabase Storage first
    supabase_path = await upload_file_to_supabase(file_bytes, f"audio/{filename}", "audio/webm")
    if supabase_path:
        url_file_path = os.path.join(UPLOAD_DIR, f"candidate_{candidate.id}_audio_url.txt")
        with open(url_file_path, "w") as f:
            f.write(supabase_path)
        return {"status": "success", "file_path": supabase_path}
        
    # Fallback to local storage
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)
        
    return {"status": "success", "file_path": f"/static/uploads/candidate_{candidate.id}.webm"}

@app.get("/candidates/{candidate_id}/audio")
def get_audio(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    # Check if a Supabase URL was saved
    url_file_path = os.path.join(UPLOAD_DIR, f"candidate_{candidate.id}_audio_url.txt")
    if os.path.exists(url_file_path):
        with open(url_file_path, "r") as f:
            url = f.read().strip()
        return {"has_audio": True, "audio_url": url}
        
    # Fallback to local file checking
    file_path = os.path.join(UPLOAD_DIR, f"candidate_{candidate.id}.webm")
    if os.path.exists(file_path):
        return {"has_audio": True, "audio_url": f"/static/uploads/candidate_{candidate.id}.webm"}
    return {"has_audio": False}

@app.get("/candidates/{candidate_id}/report", response_model=CandidateReport)
def get_report(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    return CandidateReport(
        candidate=candidate,
        answers=candidate.answers,
        events=candidate.events
    )

@app.post("/candidates/{candidate_id}/ai-summary")
async def generate_ai_summary(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    summary = await run_ai_summary_generation(candidate, db)
    return {"summary": summary, "simulated": "[Simulated" in summary}

# --- Candidate Deletion & Status Management ---

@app.delete("/candidates/{candidate_id}")
def delete_candidate(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Clean up associated files if any
    file_path = os.path.join(UPLOAD_DIR, f"candidate_{candidate.id}.webm")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
            
    db.delete(candidate)
    db.commit()
    return {"status": "success", "message": f"Candidate {candidate_id} deleted successfully."}

@app.post("/candidates/{candidate_id}/toggle-block")
def toggle_block_candidate(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    if candidate.status == "blocked":
        # Check if they have completed answers to decide new status
        candidate.status = "completed" if len(candidate.answers) > 0 else "invited"
    else:
        candidate.status = "blocked"
        
    db.commit()
    db.refresh(candidate)
    return {"status": "success", "new_status": candidate.status}

@app.post("/candidates/{candidate_id}/reset")
def reset_candidate_session(candidate_id: str, db: Session = Depends(get_db)):
    candidate = find_candidate(candidate_id, db)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    candidate.status = "invited"
    candidate.trust_score = 100.0
    candidate.technical_score = 0.0
    candidate.ai_summary = None
    candidate.started_at = None
    candidate.completed_at = None
    
    # Clear answers and events
    candidate.answers.clear()
    candidate.events.clear()
    
    db.commit()
    return {"status": "success", "message": "Candidate session successfully reset."}

# --- AI Question Generator ---

def fallback_parse_question(prompt_text: str) -> dict:
    import re
    
    # Check if a time limit is requested in the prompt
    time_limit = None
    time_match = re.search(r"(\d+)\s*(?:sec|second|min|minute)s?", prompt_text, re.IGNORECASE)
    if time_match:
        val = int(time_match.group(1))
        if "min" in time_match.group(0).lower():
            time_limit = val * 60
        else:
            time_limit = val
            
    # Check if coding is requested
    is_coding = any(word in prompt_text.lower() for word in ["coding", "function", "write a function", "javascript", "python", "test cases", "program"])
    
    if is_coding:
        # Simple coding structure guesser
        title = "Coding Challenge"
        lines = [l.strip() for l in prompt_text.split("\n") if l.strip()]
        if lines:
            title = lines[0][:40] + ("..." if len(lines[0]) > 40 else "")
            
        sample_code = "def solution(*args):\n    # Write code here\n    pass"
        if "javascript" in prompt_text.lower() or "js" in prompt_text.lower():
            sample_code = "function solution() {\n    // Write code here\n}"
            
        return {
            "type": "coding",
            "title": title,
            "description": prompt_text,
            "difficulty": "medium",
            "points": 20,
            "choices": None,
            "correct_answer": None,
            "sample_code": sample_code,
            "test_cases": [
                {"args": [1], "expected": 1}
            ],
            "time_limit": time_limit
        }
    else:
        # Try to parse options for MCQ
        pattern = r"([A-D])[\)\.\s]+([^\n]+)"
        matches = re.findall(pattern, prompt_text)
        
        choices = []
        option_map = {}
        for letter, content in matches:
            content_clean = content.strip()
            choices.append(content_clean)
            option_map[letter.upper()] = content_clean
            
        # Deduce correct answer
        ans_match = re.search(r"(?:answer|correct|key)[\s:]*([A-D])", prompt_text, re.IGNORECASE)
        correct_answer = None
        if ans_match:
            correct_letter = ans_match.group(1).upper()
            correct_answer = option_map.get(correct_letter)
            
        if not correct_answer and choices:
            # Fallback to matching direct words in choices
            for choice in choices:
                if choice.lower() in prompt_text.lower() and "answer:" in prompt_text.lower():
                    correct_answer = choice
                    break
            if not correct_answer:
                correct_answer = choices[0]
                
        # Clean description: remove choices from the end to make it neat
        desc = prompt_text
        for letter, content in matches:
            desc = desc.replace(f"{letter}){content}", "").replace(f"{letter}.{content}", "").replace(f"{letter} {content}", "")
            
        if not choices:
            choices = ["True", "False"]
            correct_answer = "True"
            
        first_line = prompt_text.split("\n")[0].strip()
        title = first_line[:40] + ("..." if len(first_line) > 40 else "")
        if not title:
            title = "AI MCQ Question"
            
        return {
            "type": "mcq",
            "title": title,
            "description": desc.strip(),
            "difficulty": "medium",
            "points": 10,
            "choices": choices,
            "correct_answer": correct_answer,
            "sample_code": None,
            "test_cases": None,
            "time_limit": time_limit
        }

@app.post("/questions/generate")
async def generate_question(payload: dict, db: Session = Depends(get_db)):
    prompt_text = payload.get("prompt", "")
    if not prompt_text:
        raise HTTPException(status_code=400, detail="Prompt is required")
        
    groq_key = os.getenv("GROQ_API_KEY")
    question_data = None
    
    if groq_key:
        try:
            system_instruction = (
                "You are an expert technical interviewer. Parse the user's raw text (which may contain one or multiple questions) "
                "and output a JSON object containing a 'questions' key, which is a list of question objects. "
                "Each question object in the list must represent a single question and have exactly these keys:\n"
                "- 'type': 'mcq' or 'paragraph' or 'coding'\n"
                "- 'title': A short, clear title for the question (e.g. 'Vocabulary choose word', 'Grammar Agreement', etc.)\n"
                "- 'description': The full question text/description prompt\n"
                "- 'difficulty': 'easy', 'medium', or 'hard'\n"
                "- 'points': An integer representing difficulty points (e.g. 10 for easy, 20 for medium, 30 for hard)\n"
                "- 'choices': For mcq, a list of 4 string choices. For paragraph or coding, null.\n"
                "- 'correct_answer': For mcq, the EXACT text of the correct choice (which must be in the choices list). For paragraph or coding, null.\n"
                "- 'sample_code': For coding questions, provide starter template code (e.g., Python function definition with 'pass'). For mcq or paragraph, null.\n"
                "- 'test_cases': For coding questions, provide a list of test cases, each being an object like {'args': [...], 'expected': ...}. For mcq or paragraph, null.\n"
                "- 'time_limit': An integer representing the time limit in seconds for this specific question (e.g. 60 for MCQ, 300 for coding). Use null if no limit is specified.\n"
                "\nReturn ONLY valid JSON. Do not include markdown code block formatting (like ```json) or any conversational text."
            )
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "max_tokens": 6000,
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": system_instruction},
                            {"role": "user", "content": prompt_text}
                        ]
                    },
                    timeout=20.0
                )
                if response.status_code == 200:
                    resp_data = response.json()
                    ai_content = resp_data["choices"][0]["message"]["content"].strip()
                    question_data = json.loads(ai_content)
                else:
                    print(f"Groq API Error ({response.status_code}): {response.text}")
        except Exception as e:
            print(f"Error calling Groq for question generation: {str(e)}")
            
    # Process question_data into a list of items
    questions_list = []
    if question_data:
        if isinstance(question_data, dict):
            if "questions" in question_data and isinstance(question_data["questions"], list):
                questions_list = question_data["questions"]
            else:
                questions_list = [question_data]
        elif isinstance(question_data, list):
            questions_list = question_data

    # Fallback to single question parsing if nothing parsed
    if not questions_list:
        fallback_q = fallback_parse_question(prompt_text)
        questions_list = [fallback_q]

    saved_questions = []
    try:
        for q_item in questions_list:
            q_type = q_item.get("type", "mcq")
            if q_type not in ["mcq", "paragraph", "coding"]:
                # Default to paragraph/mcq if not clear
                q_type = "mcq" if q_item.get("choices") else "paragraph"
                
            q_title = q_item.get("title", "AI Generated Question")
            q_desc = q_item.get("description", "")
            if not q_desc:
                continue
                
            q_diff = q_item.get("difficulty", "medium")
            q_points = q_item.get("points", 10)
            q_time_limit = q_item.get("time_limit")
            
            choices_raw = q_item.get("choices")
            choices_json = json.dumps(choices_raw) if choices_raw else None
            
            sample_code = q_item.get("sample_code")
            
            t_cases = q_item.get("test_cases")
            t_cases_json = json.dumps(t_cases) if t_cases else None
            
            correct = q_item.get("correct_answer")
            
            q_domain = payload.get("domain", "General") or "General"
            new_q = Question(
                type=q_type,
                title=q_title,
                description=q_desc,
                difficulty=q_diff,
                points=q_points,
                choices=choices_json,
                sample_code=sample_code,
                test_cases=t_cases_json,
                correct_answer=correct,
                time_limit=q_time_limit,
                domain=q_domain
            )
            db.add(new_q)
            db.commit()
            db.refresh(new_q)
            saved_questions.append(new_q)
            
        if not saved_questions:
            raise Exception("No questions saved to database")
            
        first_q = saved_questions[0]
        first_choices = json.loads(first_q.choices) if first_q.choices else None
        
        return {
            "status": "success",
            "count": len(saved_questions),
            "question": {
                "id": first_q.id,
                "type": f"{len(saved_questions)} items",
                "title": f"Batch of {len(saved_questions)} generated questions",
                "description": first_q.description,
                "difficulty": first_q.difficulty,
                "points": first_q.points,
                "choices": first_choices,
                "sample_code": first_q.sample_code,
                "time_limit": first_q.time_limit
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database save error: {str(e)}")

@app.get("/questions")
def get_all_questions(db: Session = Depends(get_db)):
    questions = db.query(Question).all()
    res = []
    for q in questions:
        choices = json.loads(q.choices) if q.choices else None
        res.append({
            "id": q.id,
            "type": q.type,
            "title": q.title,
            "description": q.description,
            "difficulty": q.difficulty,
            "points": q.points,
            "choices": choices,
            "sample_code": q.sample_code,
            "time_limit": q.time_limit,
            "domain": q.domain
        })
    return res

@app.delete("/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(q)
    db.commit()
    return {"status": "success", "message": f"Question {question_id} deleted"}

@app.get("/questions/{question_id}")
def get_question(question_id: int, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    choices = json.loads(q.choices) if q.choices else None
    test_cases = json.loads(q.test_cases) if q.test_cases else None
    
    return {
        "id": q.id,
        "type": q.type,
        "title": q.title,
        "description": q.description,
        "difficulty": q.difficulty,
        "points": q.points,
        "choices": choices,
        "sample_code": q.sample_code,
        "test_cases": test_cases,
        "correct_answer": q.correct_answer,
        "time_limit": q.time_limit,
        "domain": q.domain
    }

@app.put("/questions/{question_id}")
def update_question(question_id: int, payload: dict, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    if "type" in payload:
        q.type = payload["type"]
    if "title" in payload:
        if not payload["title"]:
            raise HTTPException(status_code=400, detail="Title is required")
        q.title = payload["title"].strip()
    if "description" in payload:
        if not payload["description"]:
            raise HTTPException(status_code=400, detail="Description is required")
        q.description = payload["description"].strip()
    if "difficulty" in payload:
        q.difficulty = payload["difficulty"]
    if "points" in payload:
        try:
            q.points = int(payload["points"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Points must be an integer")
    
    if "choices" in payload:
        choices_raw = payload["choices"]
        q.choices = json.dumps(choices_raw) if choices_raw else None
        
    if "correct_answer" in payload:
        q.correct_answer = payload["correct_answer"]
        
    if "sample_code" in payload:
        q.sample_code = payload["sample_code"].strip() if payload["sample_code"] else None
        
    if "test_cases" in payload:
        t_cases = payload["test_cases"]
        q.test_cases = json.dumps(t_cases) if t_cases else None
        
    if "time_limit" in payload:
        time_limit_val = payload["time_limit"]
        if time_limit_val is not None and time_limit_val != "":
            try:
                q.time_limit = int(time_limit_val)
            except ValueError:
                q.time_limit = None
        else:
            q.time_limit = None
            
    if "domain" in payload:
        domain_val = payload["domain"]
        q.domain = domain_val.strip() if domain_val else "General"
        
    db.commit()
    db.refresh(q)
    
    choices = json.loads(q.choices) if q.choices else None
    test_cases = json.loads(q.test_cases) if q.test_cases else None
    return {
        "status": "success",
        "question": {
            "id": q.id,
            "type": q.type,
            "title": q.title,
            "description": q.description,
            "difficulty": q.difficulty,
            "points": q.points,
            "choices": choices,
            "sample_code": q.sample_code,
            "test_cases": test_cases,
            "correct_answer": q.correct_answer,
            "time_limit": q.time_limit,
            "domain": q.domain
        }
    }

@app.delete("/questions")
def delete_all_questions(db: Session = Depends(get_db)):
    db.query(Question).delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "All questions deleted"}

@app.post("/questions/delete-batch")
def delete_batch_questions(payload: dict, db: Session = Depends(get_db)):
    ids = payload.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No question IDs provided")
    db.query(Question).filter(Question.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"status": "success", "message": f"Deleted {len(ids)} questions"}

@app.get("/settings/{key}")
def get_setting(key: str, db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        return {"key": key, "value": None}
    return {"key": key, "value": setting.value}

@app.post("/settings/{key}")
def set_setting(key: str, payload: dict, db: Session = Depends(get_db)):
    val = payload.get("value")
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        setting.value = str(val) if val is not None else None
    else:
        setting = Setting(key=key, value=str(val) if val is not None else None)
        db.add(setting)
    db.commit()
    return {"key": key, "value": setting.value}

@app.post("/settings/clear-all")
def clear_all_records(db: Session = Depends(get_db)):
    db.query(Candidate).delete()
    db.commit()
    return {"status": "success", "message": "All candidate sessions, answers, and telemetry logs have been purged."}

@app.post("/questions")
def create_question_manual(payload: dict, db: Session = Depends(get_db)):
    q_type = payload.get("type", "mcq")
    q_title = payload.get("title")
    q_desc = payload.get("description")
    q_diff = payload.get("difficulty", "medium")
    q_points = int(payload.get("points", 10))
    q_time_limit = payload.get("time_limit")
    if q_time_limit is not None and q_time_limit != "":
        try:
            q_time_limit = int(q_time_limit)
        except:
            q_time_limit = None
    else:
        q_time_limit = None
            
    choices_raw = payload.get("choices")
    choices_json = json.dumps(choices_raw) if choices_raw else None
    
    sample_code = payload.get("sample_code")
    t_cases = payload.get("test_cases")
    t_cases_json = json.dumps(t_cases) if t_cases else None
    
    correct = payload.get("correct_answer")
    q_domain = payload.get("domain", "General") or "General"
    
    if not q_title or not q_desc:
        raise HTTPException(status_code=400, detail="Title and description are required")
        
    new_q = Question(
        type=q_type,
        title=q_title,
        description=q_desc,
        difficulty=q_diff,
        points=q_points,
        choices=choices_json,
        sample_code=sample_code,
        test_cases=t_cases_json,
        correct_answer=correct,
        time_limit=q_time_limit,
        domain=q_domain
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    
    return {
        "status": "success",
        "question": {
            "id": new_q.id,
            "type": new_q.type,
            "title": new_q.title,
            "description": new_q.description,
            "difficulty": new_q.difficulty,
            "points": new_q.points,
            "choices": choices_raw,
            "sample_code": new_q.sample_code,
            "time_limit": new_q.time_limit,
            "domain": new_q.domain
        }
    }
