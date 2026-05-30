import zipfile

docx_path = r"C:\Users\Manor\.gemini\antigravity\scratch\songbook\import_songs\Misirlou.docx"

try:
    with zipfile.ZipFile(docx_path) as docx:
        # List all files inside the zip
        print("Files in zip:")
        for name in docx.namelist():
            print(f" - {name}")
            
        if 'word/document.xml' in docx.namelist():
            content = docx.read('word/document.xml')
            # Print first 2000 characters
            print("\nFirst 2000 chars of document.xml:")
            print(content[:2000].decode('utf-8', errors='ignore'))
except Exception as e:
    print(f"Error: {e}")
