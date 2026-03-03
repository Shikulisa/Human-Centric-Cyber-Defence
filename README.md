# FLagit: Human-Centric Cyber Defence System

This project implements an end-to-end phishing detection system that integrates a machine learning model, a Chrome Extension that operates within Gmail, a Flask backend API, and an administrative dashboard for monitoring and system management.

---

## System Overview

The system consists of four main components:

### 1. Chrome Extension
Extracts email details from Gmail, sends them to the backend for classification, and displays phishing or legitimate labels directly in the inbox.

### 2. Flask Backend
Receives email data, generates predictions using a BERT–Logistic Regression model, applies rule-based heuristics, stores logs in SQLite, and exposes secure admin endpoints.

### 3. Machine Learning Model
Uses pretrained BERT base-uncased embeddings and a Logistic Regression classifier to perform phishing detection with high accuracy.

### 4. Admin Dashboard
React-based interface for viewing metrics, monitoring users, adjusting model thresholds, and exporting logs to Google Sheets.

---

## Key Features

- Real-time phishing detection in Gmail
- BERT-based embedding extraction
- Rule-based heuristics (safe senders and keywords)
- SQLite logging of predictions and feedback
- Google OAuth + JWT-based admin authentication
- Auto-refreshing analytics dashboard
- Threshold adjustment and Google Sheets export

---

## Project Structure
```
root/
│
├── backend/
│ ├── app.py
│ ├── feedback.db
│ ├── model/
│ │ └── fine_tuned_bert/
│ └── flagit-sheets-key.json
│
├── chrome-extension/
│ ├── manifest.json
│ ├── content.js
│ └── background.js
│
├── dashboard/
│ ├── src/
│ └── package.json
│
└── model-training/
└── notebooks and scripts
```


---

## Installation and Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py

## Chrome Extension

1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

---

## Dashboard

```bash
cd dashboard
npm install
npm run dev



