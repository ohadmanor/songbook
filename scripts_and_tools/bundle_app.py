#!/usr/bin/env python3
"""
bundle_app.py
Combines index.html, styles.css, jszip.min.js, transposer.js,
chord-db.js, songs-data.js, parser.js, and app.js into a single
stand-alone HTML file: 'songbook.html' in the workspace root.
"""

import os
import re
import sys
import base64
import json
import datetime

def regenerate_songs_data(web_dir, db_file):
    """Overwrites web/songs-data.js from songs_db/songbook_backup.json."""
    if not os.path.exists(db_file):
        print(f"Warning: {db_file} not found, skipping songs-data.js generation")
        return
    try:
        with open(db_file, 'r', encoding='utf-8') as f:
            songs_json = f.read()
        timestamp = datetime.datetime.now().isoformat()
        js_content = f"window.defaultSongsVersion = '{timestamp}';\nwindow.defaultSongs = {songs_json};\n"
        songs_data_path = os.path.join(web_dir, 'songs-data.js')
        with open(songs_data_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        print("Generated web/songs-data.js from songs_db/songbook_backup.json")
    except Exception as e:
        print(f"Error generating songs-data.js: {e}")


def count_songs_in_js(path):
    """Best-effort song count from a songs-data.js file; None if unreadable."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        marker = "window.defaultSongs = "
        start = content.find(marker)
        if start == -1:
            return None
        payload = content[start + len(marker):].strip()
        if payload.endswith(';'):
            payload = payload[:-1].strip()
        return len(json.loads(payload))
    except Exception:
        return None


def main(regenerate_songs_data_file=False):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    web_dir = os.path.join(project_root, 'web')
    db_file = os.path.join(project_root, 'songs_db', 'songbook_backup.json')
    outputs_dir = os.path.join(project_root, 'outputs')
    os.makedirs(outputs_dir, exist_ok=True)
    output_html_file = os.path.join(outputs_dir, 'songbook.html')
    songs_data_path = os.path.join(web_dir, 'songs-data.js')

    # 0. songs-data.js.
    #
    # This step used to run unconditionally, which made a pure build command
    # destructive: bundling overwrote the app's live song data with whatever
    # songs_db/songbook_backup.json happened to contain. Every caller that
    # legitimately wants that (restore_backup.py, and server.py's save / delete /
    # restore handlers) already writes songs-data.js itself before bundling, so
    # the only thing the unconditional rewrite accomplished was silently reverting
    # song data whenever the two files had drifted -- including undoing
    # server.py's own undo-restore, which reverts songs-data.js but not the backup.
    #
    # It now runs only when explicitly asked for, or when songs-data.js is absent.
    if regenerate_songs_data_file or not os.path.exists(songs_data_path):
        regenerate_songs_data(web_dir, db_file)
    else:
        js_count = count_songs_in_js(songs_data_path)
        db_count = None
        if os.path.exists(db_file):
            try:
                with open(db_file, 'r', encoding='utf-8') as f:
                    db_count = len(json.load(f))
            except Exception:
                db_count = None
        if js_count is not None and db_count is not None and js_count != db_count:
            print(
                f"Note: web/songs-data.js holds {js_count} songs but "
                f"songs_db/songbook_backup.json holds {db_count}. Bundling the "
                f"{js_count} from songs-data.js and leaving it untouched; pass "
                f"--regen-songs-data to rebuild it from the backup instead."
            )

    # 1. Read index.html
    index_path = os.path.join(web_dir, 'index.html')
    if not os.path.exists(index_path):
        print(f"Error: index.html not found at {index_path}")
        return
        
    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()
        
    # 2. Inline styles.css
    #
    # index.html cache-busts its own asset references ("styles.css?v=19",
    # "app.js?v=25"), so both tags are matched by regex on the filename with an
    # optional query string. Matching the bare tag text meant that the first
    # ?v= bump silently stopped inlining the stylesheet and app.js -- and since
    # the old code only warned when the *file* was missing, never when the tag
    # failed to match, it still reported success while emitting a standalone
    # bundle that was unstyled and had no application logic at all.
    css_path = os.path.join(web_dir, 'styles.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            css = f.read()
        link_pattern = re.compile(
            r'<link[^>]*rel="stylesheet"[^>]*href="styles\.css(?:\?[^"]*)?"[^>]*>'
        )
        html, n_css = link_pattern.subn(lambda _m: f"<style>\n{css}\n</style>", html, count=1)
        if n_css:
            print("Inlined styles.css successfully.")
        else:
            print("Warning: no <link> tag for styles.css found in index.html - bundle will be unstyled.")
    else:
        print("Warning: styles.css not found.")

    # Helper to inline script files
    def inline_script(html_content, script_filename):
        script_path = os.path.join(web_dir, script_filename)
        if not os.path.exists(script_path):
            print(f"Warning: {script_filename} not found at {script_path}")
            return html_content

        with open(script_path, 'r', encoding='utf-8') as f:
            script_code = f.read()

        script_pattern = re.compile(
            r'<script[^>]*src="' + re.escape(script_filename) + r'(?:\?[^"]*)?"[^>]*>\s*</script>'
        )
        html_content, n_hits = script_pattern.subn(
            lambda _m: f"<script>\n{script_code}\n</script>", html_content, count=1
        )
        if n_hits:
            print(f"Inlined {script_filename} successfully.")
        else:
            print(f"Warning: no <script> tag for {script_filename} found in index.html - it is NOT in the bundle.")
        return html_content

    # 3. Inline JavaScript files in order
    html = inline_script(html, 'jszip.min.js')
    html = inline_script(html, 'transposer.js')
    html = inline_script(html, 'chord-db.js')
    html = inline_script(html, 'songs-data.js')
    html = inline_script(html, 'parser.js')
    html = inline_script(html, 'app.js')
    
    # Update defaultSongsVersion to a fresh timestamp for the bundle to force browser cache sync
    timestamp = datetime.datetime.now().isoformat()
    html = re.sub(
        r"window\.defaultSongsVersion\s*=\s*['\"][^'\"]*['\"];",
        f"window.defaultSongsVersion = '{timestamp}';",
        html
    )
    
    # 3.4 Inline favicon.png if it exists
    favicon_file = os.path.join(web_dir, 'favicon.png')
    if os.path.exists(favicon_file):
        with open(favicon_file, 'rb') as fav_f:
            fav_b64 = base64.b64encode(fav_f.read()).decode('utf-8')
        fav_data_url = f"data:image/png;base64,{fav_b64}"
        html = html.replace('href="favicon.png"', f'href="{fav_data_url}"')
        html = html.replace('src="favicon.png"', f'src="{fav_data_url}"')
        print("Inlined favicon.png successfully.")

    # 3.45 Inline the self-hosted webfonts as base64.
    #
    # These are the fonts the chord/lyric alignment depends on: the chord row is
    # positioned with plain spaces, so it only lines up while both rows measure
    # their characters with the same fonts. A standalone bundle that still points
    # at "fonts/rubik-hebrew.woff2" loses them the moment the file is opened from
    # anywhere but web/, and falls back to whatever the OS calls sans-serif --
    # which is exactly the drift the self-hosting was introduced to remove.
    font_pattern = re.compile(r"url\('fonts/([a-zA-Z0-9_.-]+)'\)")
    inlined_fonts = []
    for font_name in set(font_pattern.findall(html)):
        font_path = os.path.join(web_dir, 'fonts', font_name)
        if not os.path.exists(font_path):
            print(f"Warning: font referenced by styles.css not found: {font_path}")
            continue
        ext = os.path.splitext(font_name)[1].lower().lstrip('.')
        mime_type = 'font/woff2' if ext == 'woff2' else f'font/{ext}'
        with open(font_path, 'rb') as font_f:
            font_b64 = base64.b64encode(font_f.read()).decode('utf-8')
        html = html.replace(f"url('fonts/{font_name}')", f"url('data:{mime_type};base64,{font_b64}')")
        inlined_fonts.append(font_name)

    if inlined_fonts:
        print(f"Inlined {len(inlined_fonts)} webfont(s) as Base64: {', '.join(sorted(inlined_fonts))}")

    # 3.5 Inline media images as base64 in the bundled html
    media_dir = os.path.join(web_dir, 'media')
    media_pattern = re.compile(r'media/([a-zA-Z0-9_\.-]+)')
    matches = media_pattern.findall(html)
    
    replaced = {}
    for filename in set(matches):
        file_path = os.path.join(media_dir, filename)
        if os.path.exists(file_path):
            _, ext = os.path.splitext(filename)
            ext = ext.lower().replace('.', '')
            mime_type = f"image/{ext}"
            if ext in ('jpg', 'jpeg'):
                mime_type = "image/jpeg"
            elif ext == 'svg':
                mime_type = "image/svg+xml"
            
            with open(file_path, 'rb') as img_f:
                b64_bytes = base64.b64encode(img_f.read())
                b64_data = b64_bytes.decode('utf-8')
            
            data_url = f"data:{mime_type};base64,{b64_data}"
            html = html.replace(f"media/{filename}", data_url)
            replaced[filename] = len(b64_data)
            
    if replaced:
        print(f"Inlined {len(replaced)} images as Base64 in standalone HTML:")
        for name, size in replaced.items():
            print(f"  - media/{name} ({size} b64 chars)")

    # 4. Save bundled standalone HTML
    with open(output_html_file, 'w', encoding='utf-8') as f:
        f.write(html)
        
    print(f"\nSuccess! Portable standalone application built successfully at:\n{output_html_file}")

if __name__ == '__main__':
    main(regenerate_songs_data_file='--regen-songs-data' in sys.argv)
