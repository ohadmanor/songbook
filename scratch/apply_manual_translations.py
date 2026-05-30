import json
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    songs_file = os.path.join(project_root, 'web', 'songs.json')
    js_songs_file = os.path.join(project_root, 'web', 'songs-data.js')
    cache_file = os.path.join(project_root, 'scripts', 'artist_cache.json')
    translation_file = os.path.join(project_root, 'scripts', 'artist_translation.json')

    manual_overrides = {
        "Noar Shulaim": "נוער שוליים",
        "Tuna": "טונה",
        "Yetziat Cherum": "יציאת חירום",
        "Yehunatan Gefen": "יהונתן גפן",
        "Rami Kleinstein & Rita": "רמי קלינשטיין וריטה",
        "Beni Bashan & Boom Pam": "בני בשן ובום פם",
        "Balagan": "בלגן",
        "Arik Einstein & Shalom Hanoch": "אריק איינשטיין ושלום חנוך",
        "Arik Einstein & Miki Gavrielov": "אריק איינשטיין ומיקי גבריאלוב",
        "Arik Einstein & Yitzhak Klepter": "אריק איינשטיין ויצחק קלפטר",
        "Elai Botner and Yaldei Hachutz & Elai Botner": "עילי בוטנר וילדי החוץ",
        "Elai Botner & Kobi Aflalo": "עילי בוטנר וקובי אפללו",
        "Aviv Geffen & Orit Shachaf": "אביב גפן ואורית שחף",
        "Danny Sanderson & Mazi Cohen": "דני סנדרסון ומזי כהן",
        "Danny Sanderson & Yali Sobol": "דני סנדרסון וילי סובול",
        "Etti Ankri & David D'or": "אתי אנקרי ודוד ד'אור",
        "Gidi Gov & Lior Ashkenazi": "גידי גוב וליאור אשכנזי",
        "Gidi Gov and Cleofat & Gidi Gov": "גידי גוב",
        "Gidi Gov and Cleofat": "גידי גוב",
        "Gidi Gov & Cleofat": "גידי גוב",
        "Gidi Gov & Yehudit Ravitz": "גידי גוב ויהודית רביץ",
        "Gidi Gov and Yehudit Ravitz": "גידי גוב ויהודית רביץ",
        "Omer Adam & David Broza": "עומר אדם ודויד ברוזה",
        "Yossi Banai & Nurit Galron": "יוסי בנאי ונורית גלרון",
        "Tuned Tone": "צליל מכוון",
        "Tuned tone": "צליל מכוון"
    }

    # Load translations
    translations = {}
    if os.path.exists(translation_file):
        with open(translation_file, 'r', encoding='utf-8') as f:
            translations = json.load(f)

    # Apply overrides to translation dict
    for k, v in manual_overrides.items():
        translations[k] = v

    with open(translation_file, 'w', encoding='utf-8') as f:
        json.dump(translations, f, ensure_ascii=False, indent=2)

    # Load songs
    with open(songs_file, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    # Load cache
    with open(cache_file, 'r', encoding='utf-8') as f:
        artist_cache = json.load(f)

    # Apply translations
    updated_count = 0
    for s in songs:
        if s["isRTL"] and s["artist"] in translations:
            s["artist"] = translations[s["artist"]]
            updated_count += 1

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

    print(f"Applied manual translations. Updated {updated_count} song entries.")

if __name__ == '__main__':
    main()
