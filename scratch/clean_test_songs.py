import json
import os

db_path = r"C:\dev\songbook\songs_db\songbook_backup.json"
songs_data_path = r"C:\dev\songbook\web\songs-data.js"
manual_edits_path = r"C:\dev\songbook\scripts\manual_edits.json"

# 1. Clean songbook_backup.json
if os.path.exists(db_path):
    with open(db_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    original_count = len(data)
    # Filter out test songs
    cleaned_data = [s for s in data if "Test Song Editor" not in s.get("title", "") and "Test Song" not in s.get("title", "")]
    new_count = len(cleaned_data)
    
    if original_count != new_count:
        print(f"Removing {original_count - new_count} test song(s) from {db_path}")
        with open(db_path, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
    else:
        print("No test songs found in songbook_backup.json")

# 2. Clean manual_edits.json
if os.path.exists(manual_edits_path):
    with open(manual_edits_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # manual_edits structure can be a dict where keys are IDs
    # Let's inspect manual_edits keys
    to_delete = []
    for k, s in data.items():
        if "Test Song Editor" in s.get("title", "") or "Test Song" in s.get("title", ""):
            to_delete.append(k)
            
    if to_delete:
        print(f"Removing test song(s) {to_delete} from manual_edits.json")
        for k in to_delete:
            del data[k]
        with open(manual_edits_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    else:
        print("No test songs found in manual_edits.json")

# 3. Clean web/songs-data.js
# We can regenerate songs-data.js by running restore_backup.py since it reads from songbook_backup.json
# Let's import or run scripts/restore_backup.py
print("Regenerating web/songs-data.js...")
import subprocess
subprocess.run(["python", r"C:\dev\songbook\scripts\restore_backup.py"])
