import zipfile
import xml.etree.ElementTree as ET
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

docx_path = 'import_songs/אהבה בת עשרים.docx'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

with zipfile.ZipFile(docx_path) as docx:
    xml_content = docx.read('word/document.xml')
    root = ET.fromstring(xml_content)
    body = root.find('w:body', ns)
    
    # Let's find all paragraphs (w:p)
    paragraphs = body.findall('.//w:p', ns)
    print(f"Total paragraphs: {len(paragraphs)}")
    
    # We want to print paragraph 3 and 4
    for idx in range(min(15, len(paragraphs))):
        p = paragraphs[idx]
        text_parts = []
        runs_info = []
        for r in p.findall('.//w:r', ns):
            r_text = "".join(t.text for t in r.findall('.//w:t', ns) if t.text)
            text_parts.append(r_text)
            # Check if there is tab or other elements
            has_tab = len(r.findall('.//w:tab', ns)) > 0
            runs_info.append(f"Run(text={repr(r_text)}, has_tab={has_tab})")
            
        print(f"\nParagraph {idx}:")
        print(f"  Raw Text: {repr(''.join(text_parts))}")
        print("  Runs:")
        for ri in runs_info:
            print(f"    {ri}")
