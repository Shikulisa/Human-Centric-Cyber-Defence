# clean_database_aggressive.py - REMOVE ALL DUPLICATES
import sqlite3
import hashlib
import os
import re

def clean_whitespace(text):
    """Clean whitespace and special characters for better comparison"""
    if not text:
        return ""
    # Remove extra whitespace, special chars, and normalize
    cleaned = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with one
    cleaned = re.sub(r'[͏\u200b\u200c\u200d]', '', cleaned)  # Remove invisible chars
    cleaned = cleaned.strip()
    return cleaned

def clean_duplicates_aggressive():
    db_path = "feedback.db"
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all predictions
    cursor.execute("SELECT id, user, sender, email_snippet, timestamp, result, confidence FROM predictions")
    all_preds = cursor.fetchall()
    
    print(f"📊 Total predictions in database: {len(all_preds)}")
    
    seen = set()
    to_delete = []
    kept_records = []
    
    for pred_id, user, sender, snippet, timestamp, result, confidence in all_preds:
        # CLEAN the snippet aggressively for comparison
        cleaned_snippet = clean_whitespace(snippet)
        
        # Create unique identifier based on CLEANED content
        # Use sender + first 100 chars of cleaned snippet
        comparison_string = f"{user}_{sender}_{cleaned_snippet[:100]}"
        email_hash = hashlib.md5(comparison_string.encode()).hexdigest()
        
        if email_hash in seen:
            to_delete.append(pred_id)
            print(f"🗑️  DUPLICATE: {sender} - {cleaned_snippet[:60]}...")
        else:
            seen.add(email_hash)
            kept_records.append({
                'id': pred_id,
                'sender': sender,
                'snippet': cleaned_snippet[:60],
                'timestamp': timestamp
            })
    
    if to_delete:
        print(f"\n🚀 DELETING {len(to_delete)} DUPLICATE ENTRIES...")
        print(f"📊 KEEPING {len(kept_records)} UNIQUE PREDICTIONS")
        
        # Show what we're keeping
        print("\n📋 KEEPING THESE UNIQUE RECORDS:")
        for i, record in enumerate(kept_records[:10]):  # Show first 10
            print(f"  {i+1}. {record['sender']} - {record['snippet']}...")
        if len(kept_records) > 10:
            print(f"  ... and {len(kept_records) - 10} more")
        
        # Delete duplicates
        placeholders = ','.join('?' for _ in to_delete)
        cursor.execute(f"DELETE FROM predictions WHERE id IN ({placeholders})", to_delete)
        conn.commit()
        
        print(f"\n✅ SUCCESSFULLY DELETED {len(to_delete)} DUPLICATE ENTRIES")
        print(f"📈 DATABASE NOW HAS {len(kept_records)} UNIQUE PREDICTIONS")
        
        # Verify the cleanup
        cursor.execute("SELECT COUNT(*) FROM predictions")
        remaining = cursor.fetchone()[0]
        print(f"🔍 VERIFICATION: Database now has {remaining} records")
        
    else:
        print("✅ No duplicates found")
    
    conn.close()

def analyze_duplicates():
    """Analyze what kinds of duplicates we have"""
    db_path = "feedback.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT sender, COUNT(*) as count FROM predictions GROUP BY sender HAVING count > 1")
    duplicate_senders = cursor.fetchall()
    
    print("\n🔍 DUPLICATE ANALYSIS:")
    print("=" * 50)
    for sender, count in duplicate_senders:
        print(f"📧 {sender}: {count} records")
        
        # Show snippets for this sender
        cursor.execute("SELECT email_snippet FROM predictions WHERE sender = ? LIMIT 3", (sender,))
        snippets = cursor.fetchall()
        for i, (snippet,) in enumerate(snippets):
            print(f"   {i+1}. {snippet[:80]}...")
        print()
    
    conn.close()

if __name__ == "__main__":
    print("🧹 STARTING AGGRESSIVE DATABASE CLEANUP...")
    print("=" * 60)
    
    # First analyze what we have
    analyze_duplicates()
    
    print("\n" + "=" * 60)
    print("🔄 CLEANING DUPLICATES...")
    print("=" * 60)
    
    clean_duplicates_aggressive()
    print("\n🎉 CLEANUP COMPLETE!")