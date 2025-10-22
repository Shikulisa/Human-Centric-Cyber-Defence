# =====================================
# 📦 Flask Backend for Phishing Detector
# =====================================

from flask import Flask, request, jsonify
from transformers import BertTokenizer, BertModel
import joblib
import torch
import numpy as np
from flask_cors import CORS
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import SQLAlchemyError

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow Chrome Extension or frontend requests

# ============================
# Database setup
# ============================
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "feedback.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)

Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(Integer, primary_key=True)
    text = Column(String)
    label = Column(String)
    confidence = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)

# ============================
# Load models (BERT + LR)
# ============================
print("🔹 Loading models...")

bert_path = "./model/bert_base_uncased"
lr_path = "./model/logistic_regression.pkl"

tokenizer = BertTokenizer.from_pretrained(bert_path)
bert = BertModel.from_pretrained(bert_path)
lr_model = joblib.load(lr_path)

bert.eval()  # Freeze BERT for inference

print("✅ Models loaded successfully!")

# ============================
# Helper: get CLS embedding
# ============================
def get_cls_embedding(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=128
    )
    with torch.no_grad():
        outputs = bert(**inputs)
        cls_vector = outputs.last_hidden_state[:, 0, :].numpy()
    return cls_vector

# ============================
# API ROUTES
# ============================

@app.route('/')
def home():
    return jsonify({"message": "Phishing Detection API is running ✅"})

# ----------------------------
# Predict route
# ----------------------------
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    text = data['text']
    cls_embedding = get_cls_embedding(text)
    prediction = lr_model.predict(cls_embedding)[0]
    confidence = float(np.max(lr_model.predict_proba(cls_embedding)))

    result = {
        'text': text,
        'prediction': 'Phishing 🚨' if prediction == 1 else 'Legitimate ✅',
        'label': 'phishing' if prediction == 1 else 'legitimate',
        'confidence': round(confidence, 2)
    }

    return jsonify(result)

# ----------------------------
# Feedback route
# ----------------------------
@app.route('/feedback', methods=['POST'])
def feedback():
    data = request.get_json()
    if not data or 'text' not in data or 'label' not in data:
        return jsonify({'error': 'Invalid feedback data'}), 400

    text = data['text']
    label = data['label']
    confidence = data.get('confidence', 0.0)

    print(f"📬 Feedback received: '{text}' -> {label} (confidence={confidence})")

    session = SessionLocal()
    try:
        feedback_entry = Feedback(
            text=text,
            label=label,
            confidence=confidence,
            timestamp=datetime.utcnow()
        )
        session.add(feedback_entry)
        session.commit()
        print("✅ Feedback saved to database successfully!")
        return jsonify({'message': 'Feedback received and stored successfully!'}), 200
    except SQLAlchemyError as e:
        session.rollback()
        print("❌ Error saving feedback:", e)
        return jsonify({'error': 'Failed to store feedback.'}), 500
    finally:
        session.close()

# ----------------------------
# Fetch all feedbacks (optional)
# ----------------------------
@app.route('/feedbacks', methods=['GET'])
def get_feedbacks():
    session = SessionLocal()
    try:
        records = session.query(Feedback).all()
        feedback_list = [
            {
                "id": f.id,
                "text": f.text,
                "label": f.label,
                "confidence": f.confidence,
                "timestamp": f.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            }
            for f in records
        ]
        return jsonify(feedback_list), 200
    except SQLAlchemyError as e:
        print("❌ Error fetching feedbacks:", e)
        return jsonify({'error': 'Failed to fetch feedbacks.'}), 500
    finally:
        session.close()

 #===============================
 # Predict Batch - solving issue 2
 # ==============================       
@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    data = request.get_json()
    emails = data.get('emails', [])
    if not isinstance(emails, list) or not emails:
        return jsonify({'error': 'No emails provided'}), 400

    # Batch tokenize for speed
    inputs = tokenizer(
        emails,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=128
    )
    with torch.no_grad():
        outputs = bert(**inputs)
        cls_vectors = outputs.last_hidden_state[:, 0, :].numpy()

    preds = lr_model.predict(cls_vectors)
    probs = lr_model.predict_proba(cls_vectors)
    confs = probs.max(axis=1)

    results = []
    for i, p in enumerate(preds):
        results.append({
            "label": "phishing" if p == 1 else "legitimate",
            "human": "Phishing 🚨" if p == 1 else "Legitimate ✅",
            "confidence": float(round(confs[i], 2))
        })

    return jsonify({"results": results}), 200

# ============================
# Run server
# ============================
if __name__ == '__main__':
    app.run(debug=True)

