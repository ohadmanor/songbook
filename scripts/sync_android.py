#!/usr/bin/env python3
"""
sync_android.py
Synchronizes web app assets (HTML, CSS, JS, JSON) from the 'web/' directory
to the Android project's assets directory ('android/app/src/main/assets/www/').
"""

import os
import shutil

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    web_dir = os.path.join(project_root, 'web')
    assets_www_dir = os.path.join(project_root, 'android', 'app', 'src', 'main', 'assets', 'www')
    
    # Verify web dir exists
    if not os.path.exists(web_dir):
        print(f"Error: Web directory does not exist at {web_dir}")
        return
        
    # Clean target directory if exists
    if os.path.exists(assets_www_dir):
        print(f"Cleaning existing Android assets folder at: {assets_www_dir}")
        shutil.rmtree(assets_www_dir)
        
    # Create target directory
    os.makedirs(assets_www_dir)
    
    # Copy files
    print(f"Copying files from {web_dir} to {assets_www_dir}...")
    for item in os.listdir(web_dir):
        s = os.path.join(web_dir, item)
        d = os.path.join(assets_www_dir, item)
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)
            
    print("Synchronization complete! Web assets synced with Android project.")

if __name__ == '__main__':
    main()
