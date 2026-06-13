#!/usr/bin/env python3
"""
restore_backup.py
Restores the default songs data from the backup file ('web/songs-data.js.bak')
to 'web/songs-data.js' and regenerates the bundled app & Android assets.
"""

import os
import shutil
import sys

def main():
    import json
    import datetime
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    web_dir = os.path.join(project_root, 'web')
    songs_db_dir = os.path.join(project_root, 'songs_db')
    backup_file = os.path.join(songs_db_dir, 'songbook_backup.json')
    target_file = os.path.join(web_dir, 'songs-data.js')
    
    # Check if backup file exists
    if not os.path.exists(backup_file):
        print(f"Error: Backup source of truth file not found at: {backup_file}")
        sys.exit(1)
        
    print(f"Backup source of truth file found: {backup_file} ({os.path.getsize(backup_file)} bytes)")
    
    # Load JSON content
    with open(backup_file, 'r', encoding='utf-8') as f:
        songs = json.load(f)
    print(f"Loaded {len(songs)} songs from backup.")
    
    # If target file already exists, create a safety backup of it first
    if os.path.exists(target_file):
        safety_backup = target_file + ".pre_restore"
        print(f"Creating a safety backup of current songs-data.js at: {safety_backup}")
        shutil.copy2(target_file, safety_backup)
        
    # Write to target_file formatted as JavaScript
    print(f"Restoring backup to: {target_file}")
    timestamp = datetime.datetime.now().isoformat()
    with open(target_file, 'w', encoding='utf-8') as f:
        f.write(f"window.defaultSongsVersion = '{timestamp}';\n")
        f.write("window.defaultSongs = ")
        json.dump(songs, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print("Restore successful!")
    
    # Trigger standalone HTML bundling
    print("\nTriggering standalone HTML bundling...")
    try:
        if script_dir not in sys.path:
            sys.path.append(script_dir)
        import bundle_app
        bundle_app.main()
    except Exception as e:
        print(f"Warning: Failed to run bundle_app: {e}")
        
    # Trigger Android assets synchronization
    print("\nTriggering Android assets synchronization...")
    try:
        import sync_android
        sync_android.main()
    except Exception as e:
        print(f"Warning: Failed to run sync_android: {e}")

if __name__ == '__main__':
    main()
