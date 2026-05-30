import json
import os
import re
import urllib.request
import urllib.parse
import time

# Regex to detect if a string is pure LTR English (English characters, spaces, punctuation)
ENGLISH_REGEX = re.compile(r'^[a-zA-Z\s\-\.\'\&\d\/]+$')
HEBREW_REGEX = re.compile(r'[\u0590-\u05FF]')

def has_hebrew(text):
    return bool(HEBREW_REGEX.search(text))

def query_musicbrainz(artist_name):
    try:
        url = f"https://musicbrainz.org/ws/2/artist/?query={urllib.parse.quote(artist_name)}&fmt=json"
        req = urllib.request.Request(url, headers={'User-Agent': 'SongbookApp/1.0 ( manor@example.com )'})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data.get('artists'):
                for artist in data['artists'][:3]:  # Check first 3 results
                    name = artist.get('name', '')
                    if has_hebrew(name):
                        return name
                    for alias in artist.get('aliases', []):
                        alias_name = alias.get('name', '')
                        if has_hebrew(alias_name):
                            return alias_name
    except Exception as e:
        print(f"    MusicBrainz error for '{artist_name}': {e}")
    return None

def query_wikidata(artist_name):
    try:
        url = f"https://www.wikidata.org/w/api.php?action=wbsearchentities&search={urllib.parse.quote(artist_name)}&language=en&format=json"
        req = urllib.request.Request(url, headers={'User-Agent': 'SongbookApp/1.0 ( manor@example.com )'})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data.get('search'):
                entity_id = data['search'][0]['id']
                url_entity = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={entity_id}&props=labels&languages=he&format=json"
                req_entity = urllib.request.Request(url_entity, headers={'User-Agent': 'SongbookApp/1.0 ( manor@example.com )'})
                with urllib.request.urlopen(req_entity, timeout=5) as res_entity:
                    data_entity = json.loads(res_entity.read().decode('utf-8'))
                    entity = data_entity.get('entities', {}).get(entity_id, {})
                    label_he = entity.get('labels', {}).get('he', {}).get('value', '')
                    if label_he:
                        return label_he
    except Exception as e:
        print(f"    Wikidata error for '{artist_name}': {e}")
    return None

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    songs_file = os.path.join(project_root, 'web', 'songs.json')
    js_songs_file = os.path.join(project_root, 'web', 'songs-data.js')
    cache_file = os.path.join(project_root, 'scripts', 'artist_cache.json')
    translation_file = os.path.join(project_root, 'scripts', 'artist_translation.json')
    
    if not os.path.exists(songs_file):
        print("songs.json not found!")
        return

    with open(songs_file, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    # Load cache
    artist_cache = {}
    if os.path.exists(cache_file):
        with open(cache_file, 'r', encoding='utf-8') as f:
            artist_cache = json.load(f)

    # Load translations
    translations = {}
    if os.path.exists(translation_file):
        with open(translation_file, 'r', encoding='utf-8') as f:
            translations = json.load(f)
            
    # Find all English artists of Hebrew songs
    english_hebrew_artists = set()
    for s in songs:
        if s["isRTL"] and s["artist"] and s["artist"] != "Unknown Artist":
            if ENGLISH_REGEX.match(s["artist"]):
                english_hebrew_artists.add(s["artist"])

    print(f"Found {len(english_hebrew_artists)} unique English artist names in Hebrew songs.")
    
    # Translate
    new_translations_count = 0
    for idx, artist in enumerate(sorted(list(english_hebrew_artists))):
        if artist in translations:
            continue
            
        print(f"[{idx+1}/{len(english_hebrew_artists)}] Looking up translation for '{artist}'...")
        time.sleep(1.0) # Rate limiting
        
        # 1. Try MusicBrainz
        hebrew_name = query_musicbrainz(artist)
        
        # 2. Try Wikidata if MusicBrainz failed
        if not hebrew_name:
            time.sleep(0.5)
            hebrew_name = query_wikidata(artist)
            
        if hebrew_name:
            translations[artist] = hebrew_name
            new_translations_count += 1
            print(f"  Found: {artist} -> {hebrew_name.encode('ascii', 'xmlcharrefreplace').decode()}")
            # Save translations immediately
            with open(translation_file, 'w', encoding='utf-8') as f:
                json.dump(translations, f, ensure_ascii=False, indent=2)
        else:
            print(f"  Could not translate: '{artist}'")

    print(f"\nTranslated {new_translations_count} new artists. Total translations in dictionary: {len(translations)}.")

    # Now apply the translation dictionary to songs.json and artist_cache.json
    print("\nApplying translations to song database...")
    translation_applied_count = 0
    for s in songs:
        if s["isRTL"] and s["artist"] in translations:
            s["artist"] = translations[s["artist"]]
            translation_applied_count += 1
            
    # Apply to cache
    for k, v in list(artist_cache.items()):
        if v in translations:
            artist_cache[k] = translations[v]
            
    # Write songs.json
    with open(songs_file, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)
        
    # Write songs-data.js
    with open(js_songs_file, 'w', encoding='utf-8') as f:
        f.write("window.defaultSongs = ")
        json.dump(songs, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    # Write cache
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(artist_cache, f, ensure_ascii=False, indent=2)

    print(f"Updated {translation_applied_count} song entries with Hebrew artist names.")

if __name__ == '__main__':
    main()
