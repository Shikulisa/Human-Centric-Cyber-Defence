import zipfile
import os
import sys

zip_path = "fine_tuned_bert.zip"
extract_to = "model"

# Make sure the zip is in the current folder
if not os.path.exists(zip_path):
    print(f"ERROR: '{zip_path}' not found in the current folder.")
    print("Make sure you placed fine_tuned_bert.zip inside the project folder.")
    sys.exit(1)

os.makedirs(extract_to, exist_ok=True)

with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_to)

print("✅ Model extracted successfully to:", os.path.abspath(extract_to))
