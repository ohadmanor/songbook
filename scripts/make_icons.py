#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw

def make_round(img):
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0) + img.size, fill=255)
    
    output = Image.new('RGBA', img.size, (0, 0, 0, 0))
    output.paste(img.convert("RGBA"), (0, 0), mask=mask)
    return output

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    source_path = r"C:\Users\Manor\.gemini\antigravity-ide\brain\9ba10f9c-c6a5-486f-88f6-813f39a824bb\chordbook_app_icon_cream_1781634650033.png"
    if not os.path.exists(source_path):
        print(f"Error: Source image not found at {source_path}")
        return

    # Load source image
    img = Image.open(source_path)
    
    # 1. Save web favicon
    web_dir = os.path.join(project_root, 'web')
    favicon_path = os.path.join(web_dir, 'favicon.png')
    img.resize((512, 512), Image.Resampling.LANCZOS).save(favicon_path, "PNG")
    print(f"Saved web favicon to {favicon_path}")
    
    # 2. Save Android icons
    res_dir = os.path.join(project_root, 'android', 'app', 'src', 'main', 'res')
    
    densities = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192
    }
    
    for folder, size in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        # Standard icon
        icon_standard = img.resize((size, size), Image.Resampling.LANCZOS)
        standard_path = os.path.join(folder_path, 'ic_launcher.webp')
        icon_standard.save(standard_path, 'WEBP')
        
        # Round icon
        icon_round = make_round(icon_standard)
        round_path = os.path.join(folder_path, 'ic_launcher_round.webp')
        icon_round.save(round_path, 'WEBP')
        
        print(f"Generated icons in {folder} ({size}x{size})")
        
    # 3. Clean anydpi adaptive icons if they exist so Android falls back to mipmaps
    anydpi_dir = os.path.join(res_dir, 'mipmap-anydpi-v26')
    if os.path.exists(anydpi_dir):
        for filename in ['ic_launcher.xml', 'ic_launcher_round.xml']:
            filepath = os.path.join(anydpi_dir, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                print(f"Removed adaptive XML icon {filename} to ensure standard fallback")

    print("\nIcon generation finished successfully!")

if __name__ == '__main__':
    main()
