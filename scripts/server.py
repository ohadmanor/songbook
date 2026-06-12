#!/usr/bin/env python3
"""
server.py
A custom, lightweight Python development server that serves the web application
and processes client-side song edits to save them back to the local disk.
"""

import os
import sys
import json
import subprocess
import shutil
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8080
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        pass

# Ensure stdout uses UTF-8 to handle printing Hebrew characters in Windows command line/PowerShell
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
WEB_DIR = os.path.join(PROJECT_ROOT, 'web')
EDITS_FILE = os.path.join(SCRIPT_DIR, 'manual_edits.json')
PARSE_DOCS_SCRIPT = os.path.join(SCRIPT_DIR, 'parse_docs.py')

class SongbookRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Always serve files from the web/ directory
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/api/check-undo-available':
            self.handle_check_undo_available()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save-song':
            self.handle_save_song()
        elif self.path == '/api/delete-song':
            self.handle_delete_song()
        elif self.path == '/api/restore-backup':
            self.handle_restore_backup()
        elif self.path == '/api/undo-restore':
            self.handle_undo_restore()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_check_undo_available(self):
        js_file = os.path.join(WEB_DIR, 'songs-data.js')
        safety_backup = js_file + ".pre_restore"
        undo_available = os.path.exists(safety_backup)
        
        response = {"undoAvailable": undo_available}
        response_data = json.dumps(response).encode('utf-8')
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response_data)))
        self.end_headers()
        self.wfile.write(response_data)

    def handle_undo_restore(self):
        try:
            js_file = os.path.join(WEB_DIR, 'songs-data.js')
            safety_backup = js_file + ".pre_restore"
            edits_backup = EDITS_FILE + ".pre_restore"
            
            if not os.path.exists(safety_backup):
                self.send_error(400, "No pre-restore backup found on disk")
                return
                
            # Revert songs-data.js
            print(f"[Server] Reverting songs-data.js from safety backup: {safety_backup}")
            shutil.copy2(safety_backup, js_file)
            try:
                os.remove(safety_backup)
            except Exception as e:
                print(f"[Server] Warning: Failed to remove {safety_backup}: {e}")
            
            # Revert manual_edits.json
            if os.path.exists(edits_backup):
                print(f"[Server] Reverting manual_edits.json from safety backup: {edits_backup}")
                shutil.copy2(edits_backup, EDITS_FILE)
                try:
                    os.remove(edits_backup)
                except Exception as e:
                    print(f"[Server] Warning: Failed to remove {edits_backup}: {e}")
            elif os.path.exists(EDITS_FILE):
                # If there was no edits file prior to restore, we delete it
                try:
                    os.remove(EDITS_FILE)
                except Exception as e:
                    print(f"[Server] Warning: Failed to remove {EDITS_FILE}: {e}")
                
            # Trigger standalone HTML bundling
            print("[Server] Triggering standalone HTML bundling...")
            try:
                if SCRIPT_DIR not in sys.path:
                    sys.path.append(SCRIPT_DIR)
                import bundle_app
                bundle_app.main()
            except Exception as e:
                print(f"[Server] Error running bundle_app: {e}")
            
            # Trigger Android assets synchronization
            print("[Server] Triggering Android assets synchronization...")
            try:
                import sync_android
                sync_android.main()
            except Exception as e:
                print(f"[Server] Error running sync_android: {e}")
                
            response = {"status": "success", "message": "Database successfully reverted to pre-restore state."}
            response_data = json.dumps(response).encode('utf-8')
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_data)))
            self.end_headers()
            self.wfile.write(response_data)
        except Exception as e:
            print(f"[Server] Error handling undo-restore: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

    def handle_restore_backup(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            payload = None
            if content_length > 0:
                try:
                    post_data = self.rfile.read(content_length)
                    payload = json.loads(post_data.decode('utf-8'))
                except Exception as parse_err:
                    print(f"[Server] Failed to parse restore payload JSON: {parse_err}")
            
            if payload and "songs" in payload:
                songs_list = payload["songs"]
                print(f"\n[Server] Performing custom restore with {len(songs_list)} songs...")
                
                js_file = os.path.join(WEB_DIR, 'songs-data.js')
                
                # Create safety backup of current songs-data.js
                if os.path.exists(js_file):
                    safety_backup = js_file + ".pre_restore"
                    print(f"[Server] Creating safety backup of current songs-data.js at: {safety_backup}")
                    shutil.copy2(js_file, safety_backup)
                
                # Create safety backup of current manual_edits.json
                if os.path.exists(EDITS_FILE):
                    edits_backup = EDITS_FILE + ".pre_restore"
                    print(f"[Server] Creating safety backup of current manual_edits.json at: {edits_backup}")
                    shutil.copy2(EDITS_FILE, edits_backup)
                
                # Rebuild manual_edits.json based on restored songs
                new_edits = {}
                for song in songs_list:
                    song_id = song.get('id', '')
                    filename = song.get('filename')
                    
                    if song_id.startswith('custom_'):
                        new_edits[song_id] = song
                    elif song_id.startswith('song_') and song.get('modifiedByUser'):
                        key_name = filename if filename else song_id
                        new_edits[key_name] = song
                
                with open(EDITS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_edits, f, ensure_ascii=False, indent=2)
                print(f"[Server] Rebuilt manual_edits.json with {len(new_edits)} active user modifications/custom songs.")
                
                # Write new songs data
                import datetime
                new_version = datetime.datetime.now().isoformat()
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f"window.defaultSongsVersion = '{new_version}';\n")
                    f.write("window.defaultSongs = ")
                    json.dump(songs_list, f, ensure_ascii=False, indent=2)
                    f.write(";\n")
                print(f"[Server] Restored custom songs and updated songs-data.js (Version: {new_version})")
                
                # Trigger standalone HTML bundling
                print("[Server] Triggering standalone HTML bundling...")
                try:
                    if SCRIPT_DIR not in sys.path:
                        sys.path.append(SCRIPT_DIR)
                    import bundle_app
                    bundle_app.main()
                except Exception as e:
                    print(f"[Server] Error running bundle_app: {e}")
                
                # Trigger Android assets synchronization
                print("[Server] Triggering Android assets synchronization...")
                try:
                    import sync_android
                    sync_android.main()
                except Exception as e:
                    print(f"[Server] Error running sync_android: {e}")
                
                msg = f"Database restored from custom backup ({len(songs_list)} songs) and rebuilt successfully."
                response = {"status": "success", "message": msg, "version": new_version}
            else:
                # Fallback to local default backup file restoration
                backup_script = os.path.join(SCRIPT_DIR, 'restore_backup.py')
                print("\n[Server] Triggering backup restoration script...")
                
                # Run the restore_backup.py script
                result = subprocess.run([sys.executable, backup_script], capture_output=True, text=True, check=True)
                print(f"[Server] Restore script output:\n{result.stdout}")
                msg = "Songs database restored from default backup file on disk and rebuilt successfully."
                response = {"status": "success", "message": msg, "version": "unknown"}
            
            response_data = json.dumps(response).encode('utf-8')
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_data)))
            self.end_headers()
            self.wfile.write(response_data)
        except Exception as e:
            print(f"[Server] Error handling restore-backup: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

    def handle_save_song(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            song = json.loads(post_data.decode('utf-8'))
            
            id_val = song.get('id')
            title = song.get('title')
            artist = song.get('artist', 'Unknown Artist')
            key = song.get('key', '')
            is_rtl = song.get('isRTL', False)
            raw_text = song.get('rawText')
            filename = song.get('filename')
            
            if not id_val or not title or not raw_text:
                self.send_error(400, "Missing required fields (id, title, or rawText)")
                return
                
            # Load existing edits
            edits = {}
            if os.path.exists(EDITS_FILE):
                try:
                    with open(EDITS_FILE, 'r', encoding='utf-8') as f:
                        edits = json.load(f)
                except Exception as e:
                    print(f"Error loading edits file: {e}")
            
            # Key selection: filename for standard songs, id for custom songs
            key_name = filename if filename else id_val
            
            # Update edits entry
            edits[key_name] = {
                "id": id_val,
                "title": title,
                "artist": artist,
                "key": key,
                "isRTL": is_rtl,
                "rawText": raw_text
            }
            if filename:
                edits[key_name]["filename"] = filename
                
            # Write back edits file
            with open(EDITS_FILE, 'w', encoding='utf-8') as f:
                json.dump(edits, f, ensure_ascii=False, indent=2)
                
            print(f"\n[Server] Saved edits for song: '{title}' (Key: {key_name})")
            
            # Load and update web/songs-data.js directly to avoid expensive .docx re-parsing
            js_file = os.path.join(WEB_DIR, 'songs-data.js')
            songs_list = []
            if os.path.exists(js_file):
                try:
                    import re
                    with open(js_file, 'r', encoding='utf-8') as f:
                        js_content = f.read()
                    
                    # Extract defaultSongs JSON array
                    json_start = js_content.find("window.defaultSongs = ")
                    if json_start != -1:
                        json_str = js_content[json_start + len("window.defaultSongs = "):].strip()
                        if json_str.endswith(";"):
                            json_str = json_str[:-1].strip()
                        songs_list = json.loads(json_str)
                except Exception as e:
                    print(f"[Server] Error reading songs-data.js: {e}")

            # Find and update or append song
            found = False
            updated_song = {
                "id": id_val,
                "title": title,
                "artist": artist,
                "key": key,
                "isRTL": is_rtl,
                "rawText": raw_text
            }
            if filename:
                updated_song["filename"] = filename

            for i, s in enumerate(songs_list):
                if s.get('id') == id_val:
                    songs_list[i] = updated_song
                    found = True
                    break
            
            if not found:
                songs_list.append(updated_song)

            # Save updated songs-data.js back to disk
            import datetime
            new_version = datetime.datetime.now().isoformat()
            try:
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f"window.defaultSongsVersion = '{new_version}';\n")
                    f.write("window.defaultSongs = ")
                    json.dump(songs_list, f, ensure_ascii=False, indent=2)
                    f.write(";\n")
                print(f"[Server] Updated songs-data.js on disk (Version: {new_version})")
            except Exception as e:
                print(f"[Server] Error saving songs-data.js: {e}")

            # Trigger bundle_app.py directly to update songbook.html
            print("[Server] Triggering standalone HTML bundling...")
            try:
                if SCRIPT_DIR not in sys.path:
                    sys.path.append(SCRIPT_DIR)
                import bundle_app
                bundle_app.main()
            except Exception as e:
                print(f"[Server] Error running bundle_app: {e}")
            
            # Respond to client
            response = {"status": "success", "message": "Song saved directly to disk and bundled"}
            response_data = json.dumps(response).encode('utf-8')
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_data)))
            self.end_headers()
            self.wfile.write(response_data)
            
        except Exception as e:
            print(f"[Server] Error handling save-song: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

    def handle_delete_song(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            id_val = payload.get('id')
            
            if not id_val:
                self.send_error(400, "Missing required field (id)")
                return
                
            # Load existing edits
            edits = {}
            if os.path.exists(EDITS_FILE):
                try:
                    with open(EDITS_FILE, 'r', encoding='utf-8') as f:
                        edits = json.load(f)
                except Exception as e:
                    print(f"Error loading edits file: {e}")
            
            # Find and delete from edits
            key_to_delete = None
            for key, val in edits.items():
                if val.get('id') == id_val:
                    key_to_delete = key
                    break
            if key_to_delete:
                del edits[key_to_delete]
                # Write back edits file
                with open(EDITS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(edits, f, ensure_ascii=False, indent=2)
                print(f"[Server] Deleted song from edits: '{id_val}'")
            
            # Load and update web/songs-data.js
            js_file = os.path.join(WEB_DIR, 'songs-data.js')
            songs_list = []
            if os.path.exists(js_file):
                try:
                    with open(js_file, 'r', encoding='utf-8') as f:
                        js_content = f.read()
                    
                    # Extract defaultSongs JSON array
                    json_start = js_content.find("window.defaultSongs = ")
                    if json_start != -1:
                        json_str = js_content[json_start + len("window.defaultSongs = "):].strip()
                        if json_str.endswith(";"):
                            json_str = json_str[:-1].strip()
                        songs_list = json.loads(json_str)
                except Exception as e:
                    print(f"[Server] Error reading songs-data.js: {e}")

            # Filter out deleted song
            new_songs_list = [s for s in songs_list if s.get('id') != id_val]
            
            # Save updated songs-data.js back to disk
            import datetime
            new_version = datetime.datetime.now().isoformat()
            try:
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f"window.defaultSongsVersion = '{new_version}';\n")
                    f.write("window.defaultSongs = ")
                    json.dump(new_songs_list, f, ensure_ascii=False, indent=2)
                    f.write(";\n")
                print(f"[Server] Updated songs-data.js after deletion (Version: {new_version})")
            except Exception as e:
                print(f"[Server] Error saving songs-data.js: {e}")

            # Trigger bundle_app.py directly to update songbook.html
            print("[Server] Triggering standalone HTML bundling...")
            try:
                if SCRIPT_DIR not in sys.path:
                    sys.path.append(SCRIPT_DIR)
                import bundle_app
                bundle_app.main()
            except Exception as e:
                print(f"[Server] Error running bundle_app: {e}")
            
            # Respond to client
            response = {"status": "success", "message": "Song deleted from disk and bundled"}
            response_data = json.dumps(response).encode('utf-8')
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_data)))
            self.end_headers()
            self.wfile.write(response_data)
            
        except Exception as e:
            print(f"[Server] Error handling delete-song: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

def main():
    # Make sure web directory exists
    os.makedirs(WEB_DIR, exist_ok=True)
    
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, SongbookRequestHandler)
    print(f"\n========================================================")
    print(f"Custom Songbook Sync Server running at http://localhost:{PORT}")
    print(f"Serving web directory: {WEB_DIR}")
    print(f"Edits will be saved to: {EDITS_FILE}")
    print(f"========================================================\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        sys.exit(0)

if __name__ == '__main__':
    main()
