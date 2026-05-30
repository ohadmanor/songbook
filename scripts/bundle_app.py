#!/usr/bin/env python3
"""
bundle_app.py
Combines index.html, styles.css, jszip.min.js, transposer.js,
chord-db.js, songs-data.js, parser.js, and app.js into a single
stand-alone HTML file: 'songbook.html' in the workspace root.
"""

import os
import re

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    web_dir = os.path.join(project_root, 'web')
    output_html_file = os.path.join(project_root, 'songbook.html')
    
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
    
    # 4. Save bundled standalone HTML
    with open(output_html_file, 'w', encoding='utf-8') as f:
        f.write(html)
        
    print(f"\nSuccess! Portable standalone application built successfully at:\n{output_html_file}")

if __name__ == '__main__':
    main()
