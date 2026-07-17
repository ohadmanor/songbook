#!/usr/bin/env python3
"""
create_mock_docx.py
Generates valid minimal .docx zip structures from XML templates.
Creates three mock files in 'import_songs/':
1. Mock Song 1 - LTR.docx (English)
2. Mock Song 2 - Hebrew RTL.docx (Hebrew)
3. Mock Song 3 - Multi Column.docx (Two columns via a Table layout)
"""

import os
import zipfile

def create_docx(dest_path, paragraphs_xml):
    """Zips standard XML files to create a valid minimal .docx file."""
    
    # 1. [Content_Types].xml contents
    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    # 2. _rels/.rels contents
    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    # 3. word/document.xml contents
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {paragraphs_xml}
  </w:body>
</w:document>"""

    # Write files into a zip file
    with zipfile.ZipFile(dest_path, 'w', zipfile.ZIP_DEFLATED) as docx:
        docx.writestr('[Content_Types].xml', content_types_xml)
        docx.writestr('_rels/.rels', rels_xml)
        docx.writestr('word/document.xml', document_xml)

def make_p_xml(text):
    """Wraps text in OpenXML w:p, w:r, w:t elements."""
    # Escape xml entities
    escaped_text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f"<w:p><w:r><w:t xml:space=\"preserve\">{escaped_text}</w:t></w:r></w:p>"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    import_dir = os.path.join(project_root, 'import_songs')
    os.makedirs(import_dir, exist_ok=True)

    # Song 1: English LTR
    song1_paras = [
        "Hotel California",
        "Artist: Eagles",
        "Key: Bm",
        "",
        "[Verse 1]",
        "Bm                     F#",
        "On a dark desert highway, cool wind in my hair",
        "A                      E",
        "Warm smell of colitas, rising up through the air",
        "G                      D",
        "Up ahead in the distance, I saw a shimmering light",
        "Em",
        "My head grew heavy and my sight grew dim",
        "F#",
        "I had to stop for the night"
    ]
    song1_xml = "\n".join(make_p_xml(p) for p in song1_paras)
    create_docx(os.path.join(import_dir, "Mock Song 1 - LTR.docx"), song1_xml)
    print("Created 'Mock Song 1 - LTR.docx'")

    # Song 2: Hebrew RTL
    song2_paras = [
        "עוד יבוא שלום עלינו",
        "מילים ולחן: שבע",
        "סולם: Am",
        "",
        "[בית א]",
        "Am                Dm",
        "עוד יבוא שלום עלינו",
        "G                 Am",
        "עוד יבוא שלום עלינו",
        "Am                Dm",
        "עוד יבוא שלום עלינו",
        "E                 Am",
        "ועל כולם"
    ]
    song2_xml = "\n".join(make_p_xml(p) for p in song2_paras)
    create_docx(os.path.join(import_dir, "Mock Song 2 - Hebrew RTL.docx"), song2_xml)
    print("Created 'Mock Song 2 - Hebrew RTL.docx'")

    # Song 3: Multi Column Document (Yesterday in Col 1, Let It Be in Col 2)
    # We construct a table with one row, two cells
    yesterday_content = [
        "Yesterday",
        "Artist: The Beatles",
        "Key: F",
        "",
        "F             Em7     A7       Dm",
        "Yesterday, all my troubles seemed so far away",
        "Bb      C7                      F",
        "Now it looks as though they're here to stay",
        "C   Dm7  G7     Bb   F",
        "Oh, I believe in yesterday"
    ]
    yesterday_p_xmls = "\n".join(make_p_xml(p) for p in yesterday_content)

    letitbe_content = [
        "Let It Be",
        "Artist: The Beatles",
        "Key: C",
        "",
        "C                G",
        "When I find myself in times of trouble",
        "Am             F",
        "Mother Mary comes to me",
        "C                G            F  C",
        "Speaking words of wisdom, let it be"
    ]
    letitbe_p_xmls = "\n".join(make_p_xml(p) for p in letitbe_content)

    # XML table syntax
    table_xml = f"""
    <w:tbl>
      <w:tr>
        <w:tc>
          {yesterday_p_xmls}
        </w:tc>
        <w:tc>
          {letitbe_p_xmls}
        </w:tc>
      </w:tr>
    </w:tbl>
    """
    create_docx(os.path.join(import_dir, "Mock Song 3 - Multi Column.docx"), table_xml)
    print("Created 'Mock Song 3 - Multi Column.docx'")

    print("\nAll mock documents generated successfully inside 'import_songs/' folder!")

if __name__ == '__main__':
    main()
