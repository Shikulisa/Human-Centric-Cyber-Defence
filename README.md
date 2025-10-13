# 🛡️ Human-Centric Cyber Defence System  

## 💻 Overview  
**Human-Centric Cyber Defence** is a machine-learning-based Gmail extension that detects and flags phishing emails in real time.  
It integrates a **fine-tuned BERT model** with a **Flask backend API** and a **Chrome Extension frontend**, empowering users to identify phishing threats directly inside Gmail.  

> 🌍 Built to enhance user awareness and security through human–AI collaboration.  

---

## ⚙️ Tech Stack  
| Component | Technology |
|------------|-------------|
| **Frontend** | Chrome Extension (HTML, CSS, JavaScript) |
| **Backend** | Flask (Python) |
| **Machine Learning** | BERT (Transformers) + Logistic Regression |
| **Database** | SQLite (for storing user feedback) |
| **Environment** | Python 3.13, VS Code, GitHub |

---

## 🧠 How It Works  

### 1️⃣ Email Classification  
- When a user opens an email, the extension sends the email text to the Flask backend.  
- The backend’s BERT + Logistic Regression model classifies it as:  
  - ✅ **Legitimate**  
  - ⚠️ **Suspicious**  
  - 🚨 **Phishing**  

### 2️⃣ Inline Gmail Labels  
- A color-coded label appears next to each email:  
  - 🟢 Safe  
  - 🟡 Suspicious  
  - 🔴 Phishing  

### 3️⃣ Warning Banner  
- When opening a flagged email, a warning banner appears inside Gmail.  
- The user can report or delete phishing emails directly from the interface.  

### 4️⃣ Feedback Collection  
- Users can click 👍 or 👎 in the extension popup to confirm or correct classifications.  
- Feedback is stored in `feedback.db` for future model retraining and performance improvement.

---

## 🧩 System Architecture  
