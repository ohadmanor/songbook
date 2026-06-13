#!/usr/bin/env python3
"""
parse_docs.py
Reads .docx files from the 'import_songs' directory, extracts lyrics and chords,
identifies Hebrew RTL vs English LTR, extracts song titles and metadata,
and compiles them into 'web/songs.json'.

No external dependencies are required. It parses the zip content of .docx natively.
"""

import os
import json
import re
import zipfile
import sys
import xml.etree.ElementTree as ET

# Ensure stdout uses UTF-8 to handle printing Hebrew filenames in Windows command line/PowerShell
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


# Unicode range for Hebrew characters
HEBREW_REGEX = re.compile(r'[\u0590-\u05FF]')

def detect_hebrew(text):
    """Returns True if the text contains Hebrew characters."""
    return bool(HEBREW_REGEX.search(text))

def clean_filename_to_title(filename):
    """Converts a file name like '01 - Let It Be.docx' to 'Let It Be'."""
    # Remove extension
    name, _ = os.path.splitext(filename)
    # Remove leading numbers and separators
    name = re.sub(r'^\d+[\s\-_]*', '', name)
    # Replace dashes/underscores with spaces
    name = name.replace('_', ' ').replace('-', ' ')
    # Normalize multiple spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def extract_paragraphs_from_docx(docx_path, song_id, output_media_dir):
    """
    Extracts text paragraphs and inline drawing images from a .docx file.
    Handles tables and columns by reading cells in row order.
    """
    paragraphs = []
    ns = {
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    }
    
    try:
        with zipfile.ZipFile(docx_path) as docx:
            xml_content = docx.read('word/document.xml')
            
            # Read relationship mapping to resolve image relationship IDs to filenames
            rel_map = {}
            try:
                rels_content = docx.read('word/_rels/document.xml.rels')
                rels_root = ET.fromstring(rels_content)
                for rel in rels_root:
                    rId = rel.attrib.get('Id')
                    target = rel.attrib.get('Target')
                    if rId and target:
                        rel_map[rId] = target
            except Exception:
                pass
            
            root = ET.fromstring(xml_content)
            body = root.find('w:body', ns)
            
            if body is None:
                return []

            media_counter = [0]

            # Helper to extract content (text and images) from a paragraph w:p node
            def get_content_from_p(p_node):
                text_parts = []
                for r in p_node.findall('.//w:r', ns):
                    for t in r.findall('.//w:t', ns):
                        if t.text:
                            text_parts.append(t.text)
                text = "".join(text_parts)
                
                # Check for drawings/images
                drawings = p_node.findall('.//w:drawing', ns)
                image_placeholders = []
                for d in drawings:
                    blips = d.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
                    for blip in blips:
                        embed_id = blip.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                        if embed_id in rel_map:
                            media_path = rel_map[embed_id]
                            zip_media_path = f"word/{media_path}"
                            if zip_media_path in docx.namelist():
                                media_counter[0] += 1
                                _, ext = os.path.splitext(media_path)
                                output_filename = f"{song_id}_img_{media_counter[0]}{ext}"
                                output_filepath = os.path.join(output_media_dir, output_filename)
                                
                                # Write image bytes to media folder
                                with open(output_filepath, 'wb') as out_f:
                                    out_f.write(docx.read(zip_media_path))
                                
                                web_relative_path = f"media/{output_filename}"
                                image_placeholders.append(f"[IMAGE: {web_relative_path}]")
                
                if image_placeholders:
                    if text.strip():
                        return text + "\n" + "\n".join(image_placeholders)
                    else:
                        return "\n".join(image_placeholders)
                return text

            # Traverse top-level elements of body in order
            for child in body:
                # 1. If it's a table
                if child.tag.endswith('tbl'):
                    col1_texts = []
                    col2_texts = []
                    for row in child.findall('.//w:tr', ns):
                        cells = row.findall('.//w:tc', ns)
                        if len(cells) >= 1:
                            for p in cells[0].findall('.//w:p', ns):
                                text = get_content_from_p(p)
                                col1_texts.append(text)
                        if len(cells) >= 2:
                            for p in cells[1].findall('.//w:p', ns):
                                text = get_content_from_p(p)
                                col2_texts.append(text)
                    
                    # Add column 1 paragraphs then column 2 paragraphs
                    paragraphs.extend(col1_texts)
                    paragraphs.extend(col2_texts)
                
                # 2. If it's a normal paragraph
                elif child.tag.endswith('p'):
                    text = get_content_from_p(child)
                    paragraphs.append(text)
                    
        return paragraphs
    except Exception as e:
        print(f"Error reading zip XML of {docx_path}: {e}")
        return []

def extract_metadata_and_lyrics(paragraphs, filename):
    """
    Parses paragraphs to extract Title, Artist, Key, and the raw text body.
    """
    # Filter out trailing/leading empty lines or pure whitespace items
    cleaned_paras = []
    for p in paragraphs:
        # Keep empty lines if they separate paragraphs, but strip right whitespace
        cleaned_paras.append(p.rstrip())
        
    # Trim leading empty lines
    while cleaned_paras and cleaned_paras[0].strip() == '':
        cleaned_paras.pop(0)
    # Trim trailing empty lines
    while cleaned_paras and cleaned_paras[-1].strip() == '':
        cleaned_paras.pop()

    if not cleaned_paras:
        return None

    # Fallbacks
    title = clean_filename_to_title(filename)
    artist = "Unknown Artist"
    key = ""
    is_hebrew = False
    
    # Analyze first 5 lines for metadata
    meta_lines_to_remove = []
    
    artist_prefixes = [
        r'melym\s*w\s*lhn', r'מילים\s*ולחן', r'מילים', r'לחן', r'מבצע', r'זמר', 
        r'artist', r'singer', r'by', r'written\s*by', r'performed\s*by'
    ]
    key_prefixes = [
        r'key', r'tone', r'סולם', r'טון'
    ]

    for idx in range(min(5, len(cleaned_paras))):
        line = cleaned_paras[idx].strip()
        if not line:
            continue
            
        # Check for Key
        for pref in key_prefixes:
            match = re.match(rf'^({pref})\s*[:\-–\s]+(.*)$', line, re.IGNORECASE)
            if match:
                key = match.group(2).strip()
                meta_lines_to_remove.append(idx)
                break
        
        # Check for Artist
        for pref in artist_prefixes:
            match = re.match(rf'^({pref})\s*[:\-–\s]+(.*)$', line, re.IGNORECASE)
            if match:
                artist = match.group(2).strip()
                meta_lines_to_remove.append(idx)
                break
                
    # Determine Title:
    # If the first line is not empty and hasn't been identified as key/artist, and doesn't contain chords
    first_line = cleaned_paras[0].strip()
    if 0 not in meta_lines_to_remove and len(first_line) > 0:
        # Simple chord detector check for the line: if it has lots of spaces and chord tokens, it's not a title
        chord_tokens = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'F#m', 'Bm']
        token_count = sum(1 for token in first_line.split() if token in chord_tokens or '/' in token)
        if token_count == 0 or len(first_line) > 25:
            title = first_line
            meta_lines_to_remove.append(0)

    # Rebuild body excluding lines identified as metadata
    body_lines = []
    for idx, p in enumerate(cleaned_paras):
        if idx in meta_lines_to_remove:
            continue
        body_lines.append(p)
        
    # Re-trim leading empty lines from body
    while body_lines and body_lines[0].strip() == '':
        body_lines.pop(0)

    raw_text = "\n".join(body_lines)
    is_hebrew = detect_hebrew(raw_text) or detect_hebrew(title) or detect_hebrew(artist)

    # If artist is still unknown, check if we can parse it from filename like "Artist - Title.docx"
    if artist == "Unknown Artist" and " - " in filename:
        parts = filename.split(" - ")
        artist_part = parts[0].strip()
        title_part = os.path.splitext(parts[1])[0].strip()
        artist = clean_filename_to_title(artist_part)
        title = clean_filename_to_title(title_part)

    # Format key nicely (e.g. remove brackets or trailing periods)
    key = re.sub(r'[()\[\]]', '', key).strip()

    return {
        "title": title,
        "artist": artist,
        "key": key,
        "isRTL": is_hebrew,
        "rawText": raw_text,
        "filename": filename
    }

def main():
    # Set paths relative to script file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    import_dir = os.path.join(project_root, 'import_songs')
    web_dir = os.path.join(project_root, 'web')
    output_file = os.path.join(web_dir, 'songs.json')

    # Ensure directories exist
    os.makedirs(import_dir, exist_ok=True)
    os.makedirs(web_dir, exist_ok=True)

    print(f"Checking for .docx files in: {import_dir}")
    
    # Get all .docx files
    files = [f for f in os.listdir(import_dir) if f.lower().endswith('.docx') and not f.startswith('~$')]
    
    # Load base songs from songs_db/songbook_backup.json (source of truth)
    songs_db_dir = os.path.join(project_root, 'songs_db')
    backup_file = os.path.join(songs_db_dir, 'songbook_backup.json')
    
    songs = []
    has_backup = False
    if os.path.exists(backup_file):
        try:
            with open(backup_file, 'r', encoding='utf-8') as f:
                songs = json.load(f)
            print(f"Loaded {len(songs)} base songs from source of truth backup at: {backup_file}")
            has_backup = True
        except Exception as e:
            print(f"Error loading base backup file {backup_file}: {e}")

    # Fallback to dummy songs if no backup file is found and there are no files to parse
    if not files and not has_backup:
        print("\n--> No .docx files found in the 'import_songs' directory and no base backup found!")
        print(f"--> Please copy your .docx files into: {import_dir}")
        
        # Write a dummy song so the web application loads successfully on first boot
        dummy_songs = [
            {
                "id": "demo_song_1",
                "title": "Welcome to Your Songbook",
                "artist": "System Admin",
                "key": "G",
                "isRTL": False,
                "rawText": "[Intro]\nG   C   D   G\n\nG               C\nWelcome to your new digital songbook\nD                        G\nChords align perfectly right above lyrics\nG                     C\nPress the transpose button to shift keys\nD                      G\nOr use auto-scroll while playing live!"
            },
            {
                "id": "demo_song_2",
                "title": "שיר לשלום (דוגמה)",
                "artist": "להקת הנח\"ל",
                "key": "Am",
                "isRTL": True,
                "rawText": "[פזמון]\nAm                Dm\nלכן רק שירו שיר לשלום\nG               C\nאל תלחשו תפילה\nAm                Dm\nמוטב שירו שיר לשלום\nE             Am\nבצעקה גדולה"
            }
        ]
        # Write dummy JS file as well
        js_output_file = os.path.join(web_dir, 'songs-data.js')
        with open(js_output_file, 'w', encoding='utf-8') as f:
            f.write("window.defaultSongsVersion = 'demo';\n")
            f.write("window.defaultSongs = ")
            json.dump(dummy_songs, f, ensure_ascii=False, indent=2)
            f.write(";\n")
            
        print(f"\n--> Wrote 2 demo songs to {js_output_file} to get you started.")
        
        # Trigger standalone HTML bundler
        print("\nUpdating standalone HTML bundle...")
        try:
            if script_dir not in sys.path:
                sys.path.append(script_dir)
            import bundle_app
            bundle_app.main()
        except Exception as e:
            print(f"Error running standalone bundler: {e}")
            
        sys.exit(0)

    # Load manual edits if any
    manual_edits = {}
    manual_edits_file = os.path.join(script_dir, 'manual_edits.json')
    if os.path.exists(manual_edits_file):
        try:
            with open(manual_edits_file, 'r', encoding='utf-8') as f:
                manual_edits = json.load(f)
            print(f"Loaded {len(manual_edits)} manual edits from {manual_edits_file}")
        except Exception as e:
            print(f"Error loading manual edits: {e}")

    # Process docx files if present
    if files:
        print(f"Found {len(files)} files to process in {import_dir}.")
        web_media_dir = os.path.join(web_dir, 'media')
        os.makedirs(web_media_dir, exist_ok=True)
        
        # Find the next available numeric ID to avoid clashing with base songs
        existing_numeric_ids = []
        for s in songs:
            sid = s.get('id', '')
            if sid.startswith('song_'):
                try:
                    existing_numeric_ids.append(int(sid.split('_')[1]))
                except ValueError:
                    pass
        next_id_num = max(existing_numeric_ids) + 1 if existing_numeric_ids else 1
        
        # Map existing songs by filename for in-place updating
        songs_by_filename = {s['filename']: s for s in songs if s.get('filename')}
        
        for filename in files:
            file_path = os.path.join(import_dir, filename)
            
            # Re-use ID if filename already exists, otherwise allocate next ID
            existing_song = songs_by_filename.get(filename)
            if existing_song:
                song_id = existing_song['id']
            else:
                song_id = f"song_{next_id_num}"
                next_id_num += 1
                
            # Check if we have manual edits for this file
            if filename in manual_edits:
                print(f"Applying manual edits override for {filename}...")
                edit = manual_edits[filename]
                
                # Still run paragraph extraction to extract any embedded images to web media folder
                try:
                    extract_paragraphs_from_docx(file_path, song_id, web_media_dir)
                except Exception as e:
                    print(f"  Warning extracting images for overridden song: {e}")
                    
                song_data = {
                    "id": song_id,
                    "title": edit.get("title", filename.replace(".docx", "")),
                    "artist": edit.get("artist", "Unknown Artist"),
                    "key": edit.get("key", ""),
                    "isRTL": edit.get("isRTL", False),
                    "rawText": edit.get("rawText", ""),
                    "filename": filename
                }
            else:
                print(f"Parsing {filename}...")
                paragraphs = extract_paragraphs_from_docx(file_path, song_id, web_media_dir)
                song_data = extract_metadata_and_lyrics(paragraphs, filename)
                if song_data:
                    song_data["id"] = song_id
                else:
                    print(f"  Warning: No text extracted from {filename}")
            
            if song_data:
                if existing_song:
                    # Replace in-place
                    idx = songs.index(existing_song)
                    songs[idx] = song_data
                    songs_by_filename[filename] = song_data
                else:
                    songs.append(song_data)
                    
        # Append custom songs from manual edits that are not docx overrides
        custom_songs_count = 0
        for key, edit in manual_edits.items():
            if not key.lower().endswith('.docx'):
                # Check if custom song ID is already added
                if not any(s['id'] == key for s in songs):
                    print(f"Adding custom song from edits: {edit.get('title')}")
                    songs.append({
                        "id": key,
                        "title": edit.get("title", "Untitled Song"),
                        "artist": edit.get("artist", "Unknown Artist"),
                        "key": edit.get("key", ""),
                        "isRTL": edit.get("isRTL", False),
                        "rawText": edit.get("rawText", "")
                    })
                    custom_songs_count += 1
        if custom_songs_count > 0:
            print(f"Appended {custom_songs_count} custom songs.")

        # Search the web for missing artist names automatically
        print("\nLooking up missing artist names online...")
        import urllib.request
        import urllib.parse
        import time
        
        cache_file = os.path.join(script_dir, 'artist_cache.json')
        translation_file = os.path.join(script_dir, 'artist_translation.json')
        
        artist_cache = {}
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    artist_cache = json.load(f)
                print(f"Loaded {len(artist_cache)} cached artists from {cache_file}")
            except Exception as e:
                print(f"Error loading cache: {e}")

        translations = {}
        if os.path.exists(translation_file):
            try:
                with open(translation_file, 'r', encoding='utf-8') as f:
                    translations = json.load(f)
                print(f"Loaded {len(translations)} artist translations from {translation_file}")
            except Exception as e:
                print(f"Error loading translations: {e}")

        # Also load from existing web/songs-data.js to salvage previously resolved artists
        js_output_file = os.path.join(web_dir, 'songs-data.js')
        if os.path.exists(js_output_file):
            try:
                with open(js_output_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                # Extract JSON array between window.defaultSongs = and the trailing ;
                json_start = content.find("window.defaultSongs = ")
                if json_start != -1:
                    json_str = content[json_start + len("window.defaultSongs = "):].strip()
                    if json_str.endswith(";"):
                        json_str = json_str[:-1].strip()
                    existing_songs = json.loads(json_str)
                    salvaged_count = 0
                    for s in existing_songs:
                        if s.get("artist") and s["artist"] != "Unknown Artist":
                            search_title = re.sub(r'\(.*?\)|\[.*?\]', '', s["title"]).strip()
                            if search_title not in artist_cache:
                                artist_cache[search_title] = s["artist"]
                                salvaged_count += 1
                    if salvaged_count > 0:
                        print(f"Salvaged {salvaged_count} artist mappings from existing songs-data.js")
                        with open(cache_file, 'w', encoding='utf-8') as f:
                            json.dump(artist_cache, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"Error salvaging existing artists: {e}")

        unknown_songs = [s for s in songs if s["artist"] == "Unknown Artist"]
        if unknown_songs:
            print(f"Found {len(unknown_songs)} songs with Unknown Artist. Looking up in cache or iTunes Search API...")
            consecutive_429s = 0
            for i, song in enumerate(unknown_songs):
                title = song["title"]
                search_title = re.sub(r'\(.*?\)|\[.*?\]', '', title).strip()
                
                # Check cache first
                if search_title in artist_cache:
                    cached_val = artist_cache[search_title]
                    if cached_val and cached_val != "Unknown Artist":
                        song["artist"] = cached_val
                    continue
                    
                # If not in cache, query API
                try:
                    time.sleep(1.5)
                    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(search_title)}&media=music&limit=1"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    
                    fetched_artist = None
                    for attempt in range(2):
                        try:
                            with urllib.request.urlopen(req, timeout=5) as response:
                                data = json.loads(response.read().decode('utf-8'))
                                if data.get('results'):
                                    fetched_artist = data['results'][0]['artistName']
                                consecutive_429s = 0
                                break
                        except urllib.error.HTTPError as he:
                            if he.code == 429:
                                consecutive_429s += 1
                                if consecutive_429s >= 3:
                                    raise Exception("Too many consecutive 429 Rate Limit errors")
                                print("  Rate limited (429). Sleeping 10 seconds before retry...")
                                time.sleep(10)
                            else:
                                raise he

                    if fetched_artist:
                        if song["isRTL"] and fetched_artist in translations:
                            fetched_artist = translations[fetched_artist]
                        song["artist"] = fetched_artist
                        artist_cache[search_title] = fetched_artist
                        with open(cache_file, 'w', encoding='utf-8') as f:
                            json.dump(artist_cache, f, ensure_ascii=False, indent=2)
                            
                        safe_title = title.encode('ascii', 'xmlcharrefreplace').decode()
                        safe_artist = fetched_artist.encode('ascii', 'xmlcharrefreplace').decode()
                        print(f"  [{i+1}/{len(unknown_songs)}] {safe_title} -> {safe_artist} (discovered & cached)")
                    else:
                        print(f"  [{i+1}/{len(unknown_songs)}] {title.encode('ascii', 'xmlcharrefreplace').decode()} -> Not found")
                        artist_cache[search_title] = "Unknown Artist"
                        with open(cache_file, 'w', encoding='utf-8') as f:
                            json.dump(artist_cache, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print(f"  Lookup error for '{title.encode('ascii', 'xmlcharrefreplace').decode()}': {e}")
                    if "429" in str(e) or consecutive_429s >= 3:
                        print("  Stopping lookup to avoid rate limit bans.")
                        break

    # Save the updated source of truth backup file back to songs_db/songbook_backup.json
    try:
        os.makedirs(songs_db_dir, exist_ok=True)
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(songs, f, ensure_ascii=False, indent=2)
        print(f"Updated source of truth database at: {backup_file}")
    except Exception as e:
        print(f"Error saving updated backup file to {backup_file}: {e}")

    # Write output JS (for Offline WebView / local script loading support)
    import datetime
    timestamp = datetime.datetime.now().isoformat()
    js_output_file = os.path.join(web_dir, 'songs-data.js')
    with open(js_output_file, 'w', encoding='utf-8') as f:
        f.write(f"window.defaultSongsVersion = '{timestamp}';\n")
        f.write("window.defaultSongs = ")
        json.dump(songs, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"\nSuccess! Successfully processed {len(songs)} songs.")
    print(f"Database saved to: {output_file} and {js_output_file}")
    
    hebrew_count = sum(1 for s in songs if s["isRTL"])
    print(f"Summary: {hebrew_count} Hebrew songs (RTL), {len(songs) - hebrew_count} English songs (LTR).")

    # Trigger standalone HTML bundler
    print("\nUpdating standalone HTML bundle...")
    try:
        if script_dir not in sys.path:
            sys.path.append(script_dir)
        import bundle_app
        bundle_app.main()
    except Exception as e:
        print(f"Error running standalone bundler: {e}")

if __name__ == '__main__':
    main()
