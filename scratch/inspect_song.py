import json

with open('web/songs.json', 'r', encoding='utf-8') as f:
    songs = json.load(f)

for s in songs:
    if 'עטור מצחך' in s['title']:
        title_esc = s['title'].encode('ascii', 'xmlcharrefreplace').decode()
        print("Title:", title_esc)
        print("isRTL:", s['isRTL'])
        lines = s['rawText'].split('\n')
        for i, l in enumerate(lines):
            if '[IMAGE:' in l or l.strip().startswith('[') or 'חלק' in l:
                l_esc = l.encode('ascii', 'xmlcharrefreplace').decode()
                print(f"Line {i:02d}: {l_esc}")
