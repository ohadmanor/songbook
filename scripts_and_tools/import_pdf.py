#!/usr/bin/env python3
import os
import json
import re
import sys
import datetime
from pypdf import PdfReader

# Ensure stdout uses UTF-8 to handle Hebrew characters on Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

INTRO_PREFIX_REGEX = re.compile(r'^(פתיחה|מעבר|סולו|סיום|מבוא|אינטרו|קודה|Intro|Outro|Solo|Bridge|Bass|BASS|Guitar|Drums|Flute|Violin|Coda|Mute)\s*:?\s*', re.IGNORECASE)
HEBREW_REGEX = re.compile(r'[\u0590-\u05FF]')

def is_chord_token(token):
    clean = re.sub(r'[()\[\]*~]', '', token).strip()
    if not clean:
        return False
    if re.match(r'^[||\-xX/+&0-9~\u2013\u2014*]+$', clean):
        return True
    if clean.lower() in ['solo', 'drums', 'mute', 'bass', 'guitar', 'stop', 'play']:
        return True
    # Lenient chord regex: Starts with A-G, optional # or b, optional suffix, optional slash note
    pattern = r'^[A-G][#b]?(?:[a-zA-Z0-9#b\+Δø°\-]*)(?:\/[A-G][#b]?(?:[a-zA-Z0-9#b\+Δø°\-]*))?$'
    return bool(re.match(pattern, clean))

def is_chord_line(line):
    if not line or not line.strip():
        return False
    clean = re.sub(INTRO_PREFIX_REGEX, '', line).strip()
    if not clean:
        return False
    tokens = clean.split()
    chord_count = 0
    for t in tokens:
        if is_chord_token(t):
            chord_count += 1
        else:
            clean_t = re.sub(r'[()\[\].,!?;:"\']', '', t).strip()
            if len(clean_t) > 2:
                return False
    return chord_count > 0

def is_header_line(line):
    if not line:
        return False
    trimmed = line.strip()
    if trimmed.startswith('[IMAGE:'):
        return False
    if trimmed.startswith('[') and trimmed.endswith(']'):
        return True
    hebrew_header_pattern = r'^(בית|פזמון|מעבר|מבוא|סיום|קודה|Chorus|Verse|Bridge|Intro|Outro|Coda)\s*(\d+|א|ב|ג|ד|ה|ו)?\s*:*$'
    return bool(re.match(hebrew_header_pattern, trimmed, re.IGNORECASE))

def reverse_chord_line(s):
    tokens = []
    for m in re.finditer(r'\S+', s):
        tokens.append({
            'text': m.group(0),
            'start': m.start(),
            'end': m.end()
        })
    if not tokens:
        return s
    W = len(s)
    new_line_chars = [' '] * W
    for t in tokens:
        new_start = W - t['end']
        if new_start < 0:
            new_start = 0
        chord_len = len(t['text'])
        for j in range(chord_len):
            if new_start + j < W:
                new_line_chars[new_start + j] = t['text'][j]
    return ''.join(new_line_chars)

def should_reverse_line(lines, i):
    if not is_chord_line(lines[i]):
        return False
    for idx in range(i + 1, len(lines)):
        trimmed = lines[idx].strip()
        if trimmed:
            if is_header_line(lines[idx]):
                return False
            if is_chord_line(lines[idx]):
                return False
            return True
    return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    web_dir = os.path.join(project_root, 'web')
    js_output_file = os.path.join(web_dir, 'songs-data.js')
    
    # 1. Load existing songs
    print("Loading existing songs from database...")
    existing_songs = []
    if os.path.exists(js_output_file):
        try:
            with open(js_output_file, 'r', encoding='utf-8') as f:
                content = f.read()
            json_start = content.find("window.defaultSongs = ")
            if json_start != -1:
                json_str = content[json_start + len("window.defaultSongs = "):].strip()
                if json_str.endswith(";"):
                    json_str = json_str[:-1].strip()
                existing_songs = json.loads(json_str)
            print(f"Loaded {len(existing_songs)} existing songs.")
        except Exception as e:
            print(f"Error loading existing database: {e}")
            sys.exit(1)
    else:
        print("Error: songs-data.js not found.")
        sys.exit(1)

    # Build lookup of existing songs to skip duplicates (case-insensitive & space-insensitive)
    def normalize_str(s):
        return re.sub(r'\s+', '', s.lower().strip())

    existing_lookup = set()
    for s in existing_songs:
        norm_title = normalize_str(s.get("title", ""))
        norm_artist = normalize_str(s.get("artist", ""))
        existing_lookup.add((norm_title, norm_artist))

    # Find highest numeric song ID to continue numbering
    max_id_num = 0
    for s in existing_songs:
        id_str = s.get("id", "")
        m = re.match(r'song_(\d+)', id_str)
        if m:
            max_id_num = max(max_id_num, int(m.group(1)))
    
    print(f"Max existing song ID number: {max_id_num}")
    next_id_num = max_id_num + 1

    # 2. Parse PDF
    pdf_path = r'C:\dev\songs_heb.pdf'
    print(f"Opening PDF songbook at {pdf_path}...")
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found at {pdf_path}")
        sys.exit(1)
        
    reader = PdfReader(pdf_path)
    num_pages = len(reader.pages)
    print(f"Total pages in PDF: {num_pages}")

    new_songs = []
    skipped_anomalies_count = 0
    duplicate_count = 0
    
    credit_keywords = ['מילים', 'לחן', 'מבצע', 'מילים ולחן']

    for i in range(num_pages):
        # Page indices to skip (0-indexed)
        if i == 951 or i == 1394:
            skipped_anomalies_count += 1
            continue
            
        page = reader.pages[i]
        text = page.extract_text() or ""
        orig_lines = text.split('\n')
        
        # Find first non-empty line (page header עמוד...)
        page_header_idx = -1
        for idx, line in enumerate(orig_lines):
            if line.strip():
                if re.match(r'^עמוד\s*\d+', line.strip()):
                    page_header_idx = idx
                    break
        
        if page_header_idx == -1:
            non_empty_lines = [l for l in orig_lines if l.strip()]
            if not non_empty_lines:
                continue
            page_header_idx = orig_lines.index(non_empty_lines[0])

        # Find Title - Artist line
        title_artist_idx = -1
        for idx in range(page_header_idx + 1, len(orig_lines)):
            if orig_lines[idx].strip():
                title_artist_idx = idx
                break
                
        if title_artist_idx == -1:
            continue
            
        title_artist_line = orig_lines[title_artist_idx].strip()
        
        # Parse Title and Artist
        if '-' in title_artist_line:
            title, artist = [x.strip() for x in title_artist_line.rsplit('-', 1)]
        else:
            title = title_artist_line
            artist = "Unknown Artist"
            
        # Find Credits line (optional)
        credits_idx = -1
        for idx in range(title_artist_idx + 1, len(orig_lines)):
            if orig_lines[idx].strip():
                stripped = orig_lines[idx].strip()
                if any(kw in stripped[:25] for kw in credit_keywords):
                    credits_idx = idx
                break
                
        # Determine where song body starts
        headers = [page_header_idx, title_artist_idx]
        if credits_idx != -1:
            headers.append(credits_idx)
        start_body_idx = max(headers) + 1
        
        body_lines = orig_lines[start_body_idx:]
        
        # Trim leading and trailing empty lines from the song body
        while body_lines and body_lines[0].strip() == '':
            body_lines.pop(0)
        while body_lines and body_lines[-1].strip() == '':
            body_lines.pop()
            
        # Check if empty song body
        if not body_lines:
            continue
            
        # Detect if this song is RTL (Hebrew)
        is_rtl = bool(HEBREW_REGEX.search(title)) or bool(HEBREW_REGEX.search(artist)) or any(bool(HEBREW_REGEX.search(line)) for line in body_lines)
        
        # Process and align chord lines for RTL songs
        if is_rtl:
            processed_lines = []
            for idx, line in enumerate(body_lines):
                if should_reverse_line(body_lines, idx):
                    processed_lines.append(reverse_chord_line(line))
                else:
                    processed_lines.append(line)
            raw_text = '\n'.join(processed_lines)
        else:
            raw_text = '\n'.join(body_lines)
            
        if not raw_text.strip():
            continue
            
        # Duplicate check
        norm_title = normalize_str(title)
        norm_artist = normalize_str(artist)
        if (norm_title, norm_artist) in existing_lookup:
            duplicate_count += 1
            continue
            
        # Add to new songs list
        song_id = f"song_{next_id_num}"
        next_id_num += 1
        
        new_songs.append({
            "title": title,
            "artist": artist,
            "key": "",
            "isRTL": is_rtl,
            "rawText": raw_text,
            "id": song_id
        })
        
    print(f"Finished parsing PDF.")
    print(f"  Parsed new songs: {len(new_songs)}")
    print(f"  Skipped anomalies: {skipped_anomalies_count}")
    print(f"  Skipped duplicates: {duplicate_count}")

    # Dry-run check
    if len(sys.argv) > 1 and sys.argv[1] == '--dry-run':
        print("\n[DRY RUN] Would merge and save files. No changes written.")
        sys.exit(0)

    # 3. Merge and Save
    merged_songs = existing_songs + new_songs
    print(f"\nMerging songs. Total songs in updated database: {len(merged_songs)}")
    
    timestamp = datetime.datetime.now().isoformat()
    try:
        with open(js_output_file, 'w', encoding='utf-8') as f:
            f.write(f"window.defaultSongsVersion = '{timestamp}';\n")
            f.write("window.defaultSongs = ")
            json.dump(merged_songs, f, ensure_ascii=False, indent=2)
            f.write(";\n")
        print(f"Successfully updated {js_output_file}.")
    except Exception as e:
        print(f"Error saving database: {e}")
        sys.exit(1)

    # 4. Rebuild standalone HTML bundle
    print("\nUpdating standalone HTML bundle...")
    try:
        if script_dir not in sys.path:
            sys.path.append(script_dir)
        import bundle_app
        bundle_app.main()
    except Exception as e:
        print(f"Error running standalone bundler: {e}")

    # 5. Sync Android Assets
    print("\nSynchronizing Android assets...")
    try:
        import sync_android
        sync_android.main()
    except Exception as e:
        print(f"Error running Android sync: {e}")

    print("\nAll done! PDF songs imported successfully.")

if __name__ == '__main__':
    main()
