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
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    web_dir = os.path.join(project_root, 'web')
    backup_file = os.path.join(web_dir, 'songs-data.js.bak')
    target_file = os.path.join(web_dir, 'songs-data.js')
    
    # Check if backup file exists
    if not os.path.exists(backup_file):
        print(f"Error: Backup file not found at: {backup_file}")
        sys.exit(1)
        
    print(f"Backup file found: {backup_file} ({os.path.getsize(backup_file)} bytes)")
    
    # If target file already exists, create a safety backup of it first
    if os.path.exists(target_file):
        safety_backup = target_file + ".pre_restore"
        print(f"Creating a safety backup of current songs-data.js at: {safety_backup}")
        shutil.copy2(target_file, safety_backup)
        
    # Copy backup to target
    print(f"Restoring backup to: {target_file}")
    shutil.copy2(backup_file, target_file)
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
