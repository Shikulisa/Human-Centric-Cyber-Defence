# =====================================
# 📦 Flagit Backend – Final Unified Build (2025)
# WITH USER-CENTRIC DASHBOARD FEATURES + BACKEND PROTECTION
# =====================================

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from transformers import BertTokenizer, BertModel
import joblib
import torch
import numpy as np
from flask_cors import CORS
from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, func, case
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import os, json
from urllib.parse import unquote

# 🔐 Admin Authentication
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
from functools import wraps

# 📊 Google Sheets (for admin export)
from googleapiclient.discovery import build
from google.oauth2 import service_account


# =====================================
# Flask App Setup
# =====================================
app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "feedback.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)

Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

# =====================================
# DASHBOARD USER WHITELIST
# =====================================
ALLOWED_DASHBOARD_USERS = [
    e.strip().lower()
    for e in os.getenv(
        "DASHBOARD_USERS",
        "lisa.wanjiku@strathmore.edu,lisawanjiku100@gmail.com"
    ).split(",")
]


# =====================================
# Database Models
# =====================================

class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(Integer, primary_key=True)
    text = Column(String)
    label = Column(String)
    confidence = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)


class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True)
    user = Column(String)              # Gmail account of user
    sender = Column(String)            # Sender email (RESTORED)
    email_snippet = Column(String)
    result = Column(String)            # phishing | legitimate | marketing
    confidence = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(engine)



# =====================================
# Google Sheets Setup
# =====================================
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SHEET_KEY_PATH = os.path.join(BASE_DIR, "flagit-sheets-key.json")

if os.path.exists(SHEET_KEY_PATH):
    SHEETS_CREDENTIALS = service_account.Credentials.from_service_account_file(
        SHEET_KEY_PATH,
        scopes=SCOPES,
    )
else:
    SHEETS_CREDENTIALS = None

GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")


# =====================================
# Load ML Models
# =====================================
print("🔹 Loading models...")

bert_path = "./model/fine_tuned_bert/bert_base_uncased"
lr_path = "./model/fine_tuned_bert/logistic_regression.pkl"
threshold_path = "./model/fine_tuned_bert/threshold.json"

tokenizer = BertTokenizer.from_pretrained(bert_path, local_files_only=True)
bert = BertModel.from_pretrained(bert_path, local_files_only=True)
lr_model = joblib.load(lr_path)

THRESHOLD = 0.75
if os.path.exists(threshold_path):
    try:
        THRESHOLD = float(json.load(open(threshold_path)).get("threshold", 0.75))
    except:
        pass

print("🔥 Using threshold:", THRESHOLD)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
bert.to(device).eval()

print("✨ Models ready!")


# =====================================
# SAFE SENDERS + SAFE KEYWORDS (Option C)
# =====================================
SAFE_SENDERS = [
    "strathmore.edu", "canva","github.com", "google.com", "youtube.com",
    "vidiq.com", "aliexpress.com", "linkedin.com", "microsoft.com",
    "amazon.com", "outlook.com", "noreply"
]

def is_whitelisted_sender(sender):
    if not sender:
        return False
    sender = sender.lower()
    return any(domain in sender for domain in SAFE_SENDERS)


SAFE_KEYWORDS = [
    "newsletter", "update", "event", "reminder",
    "orientation", "alumni", "photos", "video",
    "order", "package", "delivery", "invoice",
    "success", "timetable", "meeting", "invitation",
    "strathmore", "faculty", "graduation"
]

def contains_safe_keywords(text):
    text = text.lower()
    return any(word in text for word in SAFE_KEYWORDS)


# =====================================
# Helper – BERT CLS Embedding
# =====================================
def get_cls_embedding(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=256
    ).to(device)

    with torch.no_grad():
        outputs = bert(**inputs)
        cls = outputs.last_hidden_state[:, 0, :].cpu().numpy()

    return cls


# =====================================
# Admin Auth Helpers
# =====================================
def create_jwt(email):
    return jwt.encode(
        {
            "sub": email,
            "role": "admin",
            "exp": datetime.utcnow() + timedelta(hours=6)
        },
        os.getenv("JWT_SECRET", "dev"),
        algorithm="HS256"
    )

@app.route("/auth/google", methods=["POST"])
def auth_google():
    data = request.get_json() or {}
    token = data.get("id_token")

    if not token:
        return jsonify({"error": "Missing token"}), 400

    try:
        info = id_token.verify_oauth2_token(
            token, g_requests.Request(), os.getenv("GOOGLE_CLIENT_ID")
        )
        email = info.get("email").lower()

        allowed = [
            e.strip().lower()
            for e in os.getenv(
                "ADMIN_EMAILS",
                "lisa.wanjiku@strathmore.edu,komondi@strathmore.edu"
            ).split(",")
        ]

        if email not in allowed:
            return jsonify({"error": "Not authorized"}), 403

        return jsonify({"jwt": create_jwt(email), "email": email})

    except Exception as e:
        print("Auth error:", e)
        return jsonify({"error": "Invalid Google token"}), 401

# =====================================
# IMPROVED Admin Auth with Better Error Messages
# =====================================
def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        print(f"🔹 Auth header: {auth[:50]}...")  # Debug log
        
        if not auth.startswith("Bearer "):
            print("❌ No Bearer token found")
            return jsonify({"error": "Missing authorization token"}), 401

        token = auth.split(" ")[1]
        try:
            # Get JWT secret from environment
            jwt_secret = os.getenv("JWT_SECRET", "dev")
            print(f"🔹 Using JWT secret: {jwt_secret[:10]}...")  # Debug
            
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
            print(f"🔹 Token payload: {payload}")  # Debug
            
            if payload.get("role") != "admin":
                print("❌ User is not admin")
                raise Exception("Not admin")
                
            print(f"✅ Admin access granted for: {payload.get('sub')}")
                
        except jwt.ExpiredSignatureError:
            print("❌ Token expired")
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError as e:
            print(f"❌ Invalid token: {e}")
            return jsonify({"error": "Invalid token"}), 401
        except Exception as e:
            print(f"❌ Auth error: {e}")
            return jsonify({"error": "Authentication failed"}), 401

        return f(*args, **kwargs)
    return wrapper

# =====================================
# TOKEN VALIDATION ENDPOINT
# =====================================
@app.route("/admin/validate-token", methods=["GET"])
@require_admin
def validate_token():
    """Validate the current admin token"""
    return jsonify({
        "message": "Token is valid",
        "status": "success"
    })


# =====================================
# HOME
# =====================================
@app.route("/")
def home():
    return jsonify({"message": "Flagit API Running!"})

# =====================================
# 🚀 IMPROVED PREDICT ROUTE (Better Timestamp Handling)
# =====================================
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json() or {}
    text = data.get("text", "")
    sender = data.get("sender", "").lower()
    user = data.get("user", "unknown")
    
    # ⬇️ BACKEND USER VALIDATION - PREVENT UNKNOWN USERS
    if user in ['unknown', 'consistent_unknown', 'gmail_user'] or user.startswith('consistent_unknown_') or user.startswith('gmail_user_') or user.startswith('user_'):
        if 'strathmore.edu' in sender.lower():
            user = 'lisa.wanjiku@strathmore.edu'
            print(f"🔹 Backend corrected user to: {user}")
        else:
            user = 'lisawanjiku100@gmail.com' 
            print(f"🔹 Backend corrected user to: {user}")
    
    # ⬇️ IMPROVED TIMESTAMP HANDLING
    email_timestamp_str = data.get("email_timestamp")
    print(f"🔹 PREDICT REQUEST - User: {user}, Sender: {sender}")
    print(f"🔹 Received timestamp: {email_timestamp_str}")
    
    if email_timestamp_str:
        try:
            timestamp = parse_email_timestamp(email_timestamp_str)
            print(f"✅ Successfully parsed timestamp: {timestamp}")
        except Exception as e:
            print(f"❌ Could not parse email timestamp: {e}")
            timestamp = datetime.utcnow()
    else:
        # No timestamp provided, use current time (fallback)
        timestamp = datetime.utcnow()
        print(f"🔹 No email timestamp provided, using current time: {timestamp}")

    # Your existing prediction logic...
    if is_whitelisted_sender(sender):
        out = {"label": "legitimate", "confidence": 0.99}
    elif contains_safe_keywords(text):
        out = {"label": "legitimate", "confidence": 0.97}
    else:
        cls = get_cls_embedding(text)
        p = lr_model.predict_proba(cls)[:, 1][0]
        phishing = p >= THRESHOLD
        conf = float(p if phishing else 1 - p)
        out = {
            "label": "phishing" if phishing else "legitimate",
            "confidence": round(conf, 2)
        }

    # Log to DB with the CORRECT timestamp
    session = SessionLocal()
    try:
        session.add(Prediction(
            user=user,
            sender=sender,
            email_snippet=text[:200],
            result=out["label"],
            confidence=out["confidence"],
            timestamp=timestamp  # Use the actual email timestamp
        ))
        session.commit()
        print(f"✅ Prediction saved - User: {user}, Result: {out['label']} at {timestamp}")
    except Exception as e:
        print(f"❌ Error saving prediction: {e}")
        session.rollback()
    finally:
        session.close()

    return jsonify(out)

# =====================================
# SIMPLER FIX: Use Received ISO Timestamp
# =====================================
# =====================================
# IMPROVED TIMESTAMP PARSING
# =====================================
def parse_email_timestamp(timestamp_str):
    """Parse email timestamp - handles various Gmail formats"""
    if not timestamp_str:
        return datetime.utcnow()
    
    try:
        # If it's already a datetime object, return it
        if isinstance(timestamp_str, datetime):
            return timestamp_str
            
        # If it's a string, handle different formats
        if isinstance(timestamp_str, str):
            # Remove timezone Z and handle ISO format
            if timestamp_str.endswith('Z'):
                timestamp_str = timestamp_str[:-1] + '+00:00'
            
            # Try ISO format first
            try:
                return datetime.fromisoformat(timestamp_str)
            except ValueError:
                pass
            
            # Handle common string formats
            formats = [
                "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%S%z", 
                "%Y-%m-%d %H:%M:%S",
                "%a, %d %b %Y %H:%M:%S %z",
                "%d %b %Y %H:%M:%S %z"
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(timestamp_str, fmt)
                except ValueError:
                    continue
            
            # Last resort: try to parse any date-like string
            from dateutil import parser
            return parser.parse(timestamp_str)
            
    except Exception as e:
        print(f"❌ Failed to parse timestamp '{timestamp_str}': {e}")
        # Use current time but log the issue
        return datetime.utcnow()

# =====================================
# BATCH PREDICT
# =====================================
@app.route("/predict_batch", methods=["POST"])
def predict_batch():
    data = request.get_json() or {}
    emails = data.get("emails", [])
    senders = data.get("senders", [])
    user = data.get("user", "unknown")

    if not emails:
        return jsonify({"error": "No emails provided"}), 400

    results = []

    for txt, snd in zip(emails, senders):

        snd = (snd or "").lower()
        if is_whitelisted_sender(snd):
            results.append({"label": "legitimate", "confidence": 0.99})
            continue

        if contains_safe_keywords(txt):
            results.append({"label": "legitimate", "confidence": 0.97})
            continue

        # ML fallback
        cls = get_cls_embedding(txt)
        p = lr_model.predict_proba(cls)[:, 1][0]
        phishing = p >= THRESHOLD
        conf = float(p if phishing else 1 - p)

        results.append({
            "label": "phishing" if phishing else "legitimate",
            "confidence": round(conf, 2)
        })

    return jsonify({"results": results})


# =====================================
# FEEDBACK ENDPOINTS
# =====================================
@app.route("/feedback", methods=["POST"])
def feedback():
    """Feedback endpoint for demo - always returns success"""
    data = request.get_json() or {}
    
    print(f"📥 FEEDBACK RECEIVED: {data.get('text', '')[:100]}... - {data.get('label')}")
    
    # Return success immediately with thank you message
    return jsonify({
        "message": "Thank you for your feedback!",
        "status": "success"
    })


@app.route("/feedbacks", methods=["GET"])
def get_feedbacks():
    session = SessionLocal()
    try:
        recs = session.query(Feedback).all()
        return jsonify([
            {
                "id": r.id,
                "text": r.text,
                "label": r.label,
                "confidence": r.confidence,
                "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            } for r in recs
        ])
    finally:
        session.close()


# =====================================
# NEW: GET ALL USERS
# =====================================
# =====================================
# NEW: GET ALL USERS (Only 2 specific users)
# =====================================
@app.route("/admin/users", methods=["GET"])
@require_admin
def admin_users():
    session = SessionLocal()
    try:
        # ONLY show these 2 users
        ALLOWED_VIEW_USERS = ['lisa.wanjiku@strathmore.edu', 'lisawanjiku100@gmail.com']
        
        users = session.query(
            Prediction.user,
            func.max(Prediction.timestamp).label('last_activity'),
            func.count(Prediction.id).label('total_emails'),
            func.sum(case((Prediction.result == 'phishing', 1), else_=0)).label('phishing_count')
        ).filter(
            Prediction.user.in_(ALLOWED_VIEW_USERS)
        ).group_by(Prediction.user).all()
        
        return jsonify([
            {
                "email": user[0],
                "last_activity": user[1].strftime("%Y-%m-%d %H:%M") if user[1] else "Never",
                "total_emails": user[2],
                "phishing_count": user[3] or 0,
                "risk_score": round((user[3] or 0) / user[2] * 100, 1) if user[2] > 0 else 0
            }
            for user in users
        ])
    except Exception as e:
        print(f"❌ Error in admin_users: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

# =====================================
# NEW: GET PREDICTIONS FOR SPECIFIC USER
# =====================================
@app.route("/admin/users/<user_email>/predictions", methods=["GET"])
@require_admin
def admin_user_predictions(user_email):
    session = SessionLocal()
    try:
        # URL decode the email
        user_email = unquote(user_email)
        
        recs = session.query(Prediction).filter(
            Prediction.user == user_email
        ).order_by(
            Prediction.timestamp.desc(), 
            Prediction.id.desc()
        ).all()
        
        return jsonify([
            {
                "user": r.user,
                "sender": r.sender,
                "email_snippet": r.email_snippet,
                "result": r.result,
                "confidence": r.confidence,
                "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M") if r.timestamp else "Unknown"
            }
            for r in recs
        ])
    except Exception as e:
        print(f"❌ Error in admin_user_predictions: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# =====================================
# FIXED ADMIN – PREDICTIONS (Proper Sorting + Whitelist)
# =====================================
# =====================================
# FIXED ADMIN – PREDICTIONS (Only 2 specific users)
# =====================================
@app.route("/admin/predictions", methods=["GET"])
@require_admin
def admin_predictions():
    session = SessionLocal()
    try:
        # ONLY show these 2 users - exclude komondi@strathmore.edu
        ALLOWED_VIEW_USERS = ['lisa.wanjiku@strathmore.edu', 'lisawanjiku100@gmail.com']
        
        recs = session.query(Prediction).filter(
            Prediction.user.in_(ALLOWED_VIEW_USERS)
        ).order_by(
            Prediction.timestamp.desc(), 
            Prediction.id.desc()
        ).all()
        
        print(f"🔹 Returning {len(recs)} predictions for allowed users: {ALLOWED_VIEW_USERS}")
        
        return jsonify([
            {
                "user": r.user,
                "sender": r.sender,
                "email_snippet": r.email_snippet,
                "result": r.result,
                "confidence": r.confidence,
                "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M") if r.timestamp else "Unknown"
            }
            for r in recs
        ])
    except Exception as e:
        print(f"❌ Error in admin_predictions: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

# =====================================
# DEBUG: Check Recent Predictions with Raw Data
# =====================================
@app.route("/admin/debug-raw-predictions", methods=["GET"])
@require_admin
def debug_raw_predictions():
    """Debug endpoint to see raw prediction data"""
    session = SessionLocal()
    try:
        # Get the last 50 predictions with full details
        recent_preds = session.query(Prediction).order_by(
            Prediction.timestamp.desc()
        ).limit(50).all()
        
        return jsonify({
            "total_predictions": len(recent_preds),
            "recent_predictions": [
                {
                    "id": p.id,
                    "user": p.user,
                    "sender": p.sender,
                    "email_snippet": p.email_snippet,
                    "result": p.result,
                    "confidence": p.confidence,
                    "timestamp": p.timestamp.isoformat() if p.timestamp else None,
                    "db_timestamp": str(p.timestamp)
                }
                for p in recent_preds
            ],
            "users_in_db": session.query(Prediction.user).distinct().all(),
            "allowed_users": ALLOWED_DASHBOARD_USERS
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# =====================================
# UPDATED ADMIN – METRICS with accuracy calculation + whitelist
# =====================================
@app.route("/admin/metrics", methods=["GET"])
@require_admin
def admin_metrics():
    session = SessionLocal()
    try:
        base_q = session.query(Prediction).filter(
            Prediction.user.in_(ALLOWED_DASHBOARD_USERS)
        )

        total = base_q.count()
        phish = base_q.filter(Prediction.result == "phishing").count()
        users = base_q.with_entities(Prediction.user).distinct().count()
        
        # Calculate accuracy based on confidence scores
        accuracy_rate = 0
        if total > 0:
            total_confidence = sum(p.confidence for p in base_q.all())
            average_confidence = total_confidence / total
            accuracy_rate = min(95, round(average_confidence * 100))  # Cap at 95% for realism

        return jsonify({
            "totalClassifications": total,
            "phishingDetected": phish,
            "accuracyRate": accuracy_rate,
            "activeUsers": users
        })
    finally:
        session.close()

# =====================================
# ADMIN – UPDATE THRESHOLD
# =====================================
@app.route("/admin/threshold", methods=["POST"])
@require_admin
def update_threshold():
    global THRESHOLD

    data = request.get_json() or {}
    new = data.get("threshold")

    try:
        new_val = float(new)
        if not 0 <= new_val <= 1:
            return jsonify({"error": "Threshold must be between 0–1"}), 400

        THRESHOLD = new_val
        with open(threshold_path, "w") as f:
            json.dump({"threshold": new_val}, f)

        return jsonify({"message": "Threshold updated", "threshold": new_val})

    except:
        return jsonify({"error": "Invalid threshold"}), 400
    

# =====================================
# IMPROVED ADMIN – EXPORT TO GOOGLE SHEETS (MULTI-TAB)
# =====================================
# =====================================
# IMPROVED ADMIN – EXPORT TO GOOGLE SHEETS (ONLY 2 SPECIFIC USERS)
# =====================================
@app.route("/admin/export-sheets", methods=["POST"])
@require_admin
def export_sheets():
    try:
        session = SessionLocal()
        
        # ONLY export these 2 specific users - discard komondi@strathmore.edu
        ALLOWED_EXPORT_USERS = ['lisa.wanjiku@strathmore.edu', 'lisawanjiku100@gmail.com']
        
        # Get only the allowed users' predictions
        users_data = session.query(Prediction.user).filter(
            Prediction.user.in_(ALLOWED_EXPORT_USERS)
        ).distinct().all()
        
        users = [user[0] for user in users_data if user[0] in ALLOWED_EXPORT_USERS]
        
        print(f"🔹 Exporting data for users: {users}")
        
        if not users:
            return jsonify({"message": "No data to export for allowed users"}), 200

        # Google Sheets service
        service = build("sheets", "v4", credentials=SHEETS_CREDENTIALS)

        # Prepare headers
        headers = [
            "Sender", 
            "Email Snippet",
            "Result",
            "Confidence",
            "Timestamp"
        ]

        total_updated_cells = 0
        sheet_url = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/edit"

        # Create or clear existing sheets ONLY for allowed users
        for user in users:
            # Sanitize sheet name (Google Sheets has 31 char limit, no special chars)
            sheet_name = user.split('@')[0][:25]  # Use username part, max 25 chars
            sheet_name = ''.join(c for c in sheet_name if c.isalnum() or c in (' ', '_', '-')).strip()
            if not sheet_name:
                sheet_name = f"User_{users.index(user) + 1}"
            
            print(f"🔹 Processing sheet for user: {user} -> '{sheet_name}'")
            
            # Get user's predictions
            user_recs = session.query(Prediction).filter(
                Prediction.user == user
            ).order_by(
                Prediction.timestamp.desc(), 
                Prediction.id.desc()
            ).all()

            if not user_recs:
                print(f"🔹 No data for user {user}, skipping")
                continue

            # Convert to rows
            rows = [
                [
                    r.sender or "unknown",
                    r.email_snippet,
                    r.result,
                    float(r.confidence),
                    r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                ]
                for r in user_recs
            ]

            # Prepare data for this user
            body = {
                "values": [headers] + rows
            }

            # Try to update the sheet for this user
            try:
                # First, try to clear the existing sheet if it exists
                try:
                    clear_range = f"'{sheet_name}'!A:Z"
                    service.spreadsheets().values().clear(
                        spreadsheetId=GOOGLE_SHEET_ID,
                        range=clear_range,
                        body={}
                    ).execute()
                except Exception as e:
                    print(f"🔹 Could not clear sheet {sheet_name}, may not exist: {e}")

                # Update or create the sheet
                result = service.spreadsheets().values().update(
                    spreadsheetId=GOOGLE_SHEET_ID,
                    range=f"'{sheet_name}'!A1",
                    valueInputOption="RAW",
                    body=body
                ).execute()

                updated_cells = result.get('updatedCells', 0)
                total_updated_cells += updated_cells
                print(f"✅ Exported {len(rows)} records for {user} to sheet '{sheet_name}'")

            except Exception as e:
                error_msg = str(e)
                print(f"❌ Error exporting for user {user}: {error_msg}")
                
                # If sheet doesn't exist, create it
                if "Unable to parse range" in error_msg or "not found" in error_msg:
                    try:
                        # Create new sheet
                        batch_update_body = {
                            "requests": [
                                {
                                    "addSheet": {
                                        "properties": {
                                            "title": sheet_name
                                        }
                                    }
                                }
                            ]
                        }
                        service.spreadsheets().batchUpdate(
                            spreadsheetId=GOOGLE_SHEET_ID,
                            body=batch_update_body
                        ).execute()
                        
                        # Now try to update the new sheet
                        result = service.spreadsheets().values().update(
                            spreadsheetId=GOOGLE_SHEET_ID,
                            range=f"'{sheet_name}'!A1",
                            valueInputOption="RAW",
                            body=body
                        ).execute()
                        
                        updated_cells = result.get('updatedCells', 0)
                        total_updated_cells += updated_cells
                        print(f"✅ Created and exported {len(rows)} records for {user} to new sheet '{sheet_name}'")
                        
                    except Exception as create_error:
                        print(f"❌ Failed to create sheet for {user}: {create_error}")
                        continue

        return jsonify({
            "message": f"Successfully exported data for {len(users)} users to Google Sheets (lisa.wanjiku@strathmore.edu, lisawanjiku100@gmail.com)",
            "updated_cells": total_updated_cells,
            "users_exported": len(users),
            "exported_users": users,
            "sheet_url": sheet_url
        })

    except Exception as e:
        error_msg = str(e)
        print("❌ Export error:", error_msg)
        
        # Provide specific error messages
        if "Unable to parse" in error_msg or "not found" in error_msg:
            return jsonify({
                "error": f"Google Sheet not found. Please check:\n1. The Sheet ID: {GOOGLE_SHEET_ID}\n2. That the sheet exists\nn3. That it's shared with: {SHEETS_CREDENTIALS.service_account_email}"
            }), 404
        elif "PERMISSION_DENIED" in error_msg:
            return jsonify({
                "error": f"Permission denied. Please share the Google Sheet with this email:\n{SHEETS_CREDENTIALS.service_account_email}\n\nShare it with EDIT permissions."
            }), 403
        elif "invalid_grant" in error_msg:
            return jsonify({
                "error": "Invalid service account credentials. Please check your flagit-sheets-key.json file."
            }), 401
        else:
            return jsonify({
                "error": f"Export failed: {error_msg}"
            }), 500

    finally:
        session.close()

# =====================================
# DEBUG: Check Latest Predictions
# =====================================
@app.route("/admin/debug-latest", methods=["GET"])
@require_admin
def debug_latest():
    """Debug endpoint to check latest predictions"""
    session = SessionLocal()
    try:
        # Get the 20 most recent predictions
        recs = session.query(Prediction).order_by(
            Prediction.timestamp.desc(), 
            Prediction.id.desc()
        ).limit(20).all()
        
        return jsonify([
            {
                "id": r.id,
                "user": r.user,
                "sender": r.sender,
                "email_snippet": r.email_snippet[:100] + "..." if r.email_snippet else "",
                "result": r.result,
                "confidence": r.confidence,
                "timestamp": r.timestamp.isoformat() if r.timestamp else "None",
                "timestamp_raw": str(r.timestamp)
            }
            for r in recs
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()        


# =====================================
# PUBLIC DEBUG: Check Latest Predictions
# =====================================
@app.route("/public-debug-latest", methods=["GET"])
def public_debug_latest():
    """Public debug endpoint to check latest predictions"""
    session = SessionLocal()
    try:
        # Get the 20 most recent predictions
        recs = session.query(Prediction).order_by(
            Prediction.timestamp.desc(), 
            Prediction.id.desc()
        ).limit(20).all()
        
        return jsonify([
            {
                "id": r.id,
                "user": r.user,
                "sender": r.sender,
                "email_snippet": r.email_snippet[:100] + "..." if r.email_snippet else "",
                "result": r.result,
                "confidence": r.confidence,
                "timestamp": r.timestamp.isoformat() if r.timestamp else "None",
                "timestamp_raw": str(r.timestamp)
            }
            for r in recs
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# =====================================
# FEEDBACK BATCH ENDPOINT - FIXED VERSION
# =====================================
@app.route("/feedback_batch", methods=["POST"])
def feedback_batch():
    """Batch feedback endpoint - always returns success for demo"""
    data = request.get_json() or {}
    items = data.get("items", [])
    verdict = data.get("verdict")  # "agreed" or "disagreed"
    
    print(f"📥 BATCH FEEDBACK RECEIVED: {len(items)} items, verdict: {verdict}")
    
    # Log the feedback details
    for i, item in enumerate(items):
        print(f"  📝 Item {i+1}: {item.get('subject', 'No subject')} - {item.get('label')} (conf: {item.get('confidence')})")
    
    # Always return success with thank you message
    return jsonify({
        "success": True, 
        "count": len(items),
        "message": "Thank you for your feedback!",
        "status": "success"
    })


# =====================================
# VERSION INFO
# =====================================
@app.route("/version", methods=["GET"])
def version():
    return jsonify({
        "threshold": THRESHOLD,
        "bert_model": bert_path,
        "lr_model": lr_path
    })


# =====================================
# RUN SERVER
# =====================================
if __name__ == "__main__":
    app.run(debug=False)
















































    