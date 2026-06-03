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
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8080
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
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

    def do_POST(self):
        if self.path == '/api/save-song':
            self.handle_save_song()
        else:
            self.send_error(404, "Endpoint not found")

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
