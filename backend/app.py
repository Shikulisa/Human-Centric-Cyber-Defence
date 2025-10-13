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

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow Chrome Extension or frontend requests

# ============================
# Database setup
# ============================
engine = create_engine("sqlite:///feedback.db", echo=False)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

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
        'confidence': round(confidence, 2)
    }
    return jsonify(result)

@app.route('/feedback', methods=['POST'])
def feedback():
    data = request.get_json()
    text = data.get('text')
    label = data.get('label')

    print(f"📬 Feedback received: '{text}' -> {label}")
    return jsonify({'message': 'Feedback received. Thank you!'}), 200

# ============================
# Run server
# ============================
if __name__ == '__main__':
    app.run(debug=True)
