// src/types.ts

export type PredictionRow = {
  id: number; // MAKE SURE THIS EXISTS
  user: string
  sender: string
  email_snippet: string
  result: 'phishing' | 'legitimate'
  confidence: number
  timestamp: string
}

export type Metrics = {
  totalClassifications: number
  phishingDetected: number
  accuracyRate: number
  activeUsers: number
}

// from GET /version
export type VersionInfo = {
  bert_model: string
  lr_model: string
  threshold: number
  bert_last_modified: string
  lr_last_modified: string
}

// NEW: User type for the user-centric dashboard
export type User = {
  email: string
  last_activity: string
  total_emails: number
  phishing_count: number
  risk_score: number
}

// NEW: User predictions response type
export type UserPredictionsResponse = PredictionRow[]

// NEW: Users list response type
export type UsersResponse = User[]