#!/usr/bin/env python3
"""
bundle_app.py
Combines index.html, styles.css, jszip.min.js, transposer.js,
chord-db.js, songs-data.js, parser.js, and app.js into a single
stand-alone HTML file: 'songbook.html' in the workspace root.
"""

import os
import re
import base64
import json
import datetime

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    web_dir = os.path.join(project_root, 'web')
    db_file = os.path.join(project_root, 'songs_db', 'songbook_backup.json')
    outputs_dir = os.path.join(project_root, 'outputs')
    os.makedirs(outputs_dir, exist_ok=True)
    output_html_file = os.path.join(outputs_dir, 'songbook.html')
    
    # 0. Generate songs-data.js from songbook_backup.json
    if os.path.exists(db_file):
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
    else:
        print(f"Warning: {db_file} not found, skipping songs-data.js generation")
    
    # 1. Read index.html
    index_path = os.path.join(web_dir, 'index.html')
    if not os.path.exists(index_path):
        print(f"Error: index.html not found at {index_path}")
        return
        
    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()
        
    # 2. Inline styles.css
    css_path = os.path.join(web_dir, 'styles.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            css = f.read()
        # Find CSS link tag and replace with inline style tag
        html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
        print("Inlined styles.css successfully.")
    else:
        print("Warning: styles.css not found.")
        
    # Helper to inline script files
    def inline_script(html_content, script_filename):
        script_path = os.path.join(web_dir, script_filename)
        if os.path.exists(script_path):
            with open(script_path, 'r', encoding='utf-8') as f:
                script_code = f.read()
            
            # Escape potential nested HTML script tag symbols if any (unlikely in our code, but good practice)
            # Find the script tag and replace it with inline code block
            tag_to_replace = f'<script src="{script_filename}"></script>'
            html_content = html_content.replace(tag_to_replace, f"<script>\n{script_code}\n</script>")
            print(f"Inlined {script_filename} successfully.")
        else:
            print(f"Warning: {script_filename} not found at {script_path}")
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
    main()
