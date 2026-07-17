import urllib.request
import urllib.parse
import json

def test_mb_artist(name):
    try:
        url = 'https://musicbrainz.org/ws/2/artist/?query=' + urllib.parse.quote(name) + '&fmt=json'
        req = urllib.request.Request(url, headers={'User-Agent': 'SongbookApp/1.0 ( manor@example.com )'})
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        if data['artists']:
            artist = data['artists'][0]
            artist_name = artist["name"]
            print("Name:", artist_name.encode('ascii', 'xmlcharrefreplace').decode())
            aliases = artist.get('aliases', [])
            hebrew_aliases = [a['name'] for a in aliases if a.get('locale') == 'he' or any(ord(char) >= 0x0590 and ord(char) <= 0x05ff for char in a['name'])]
            print("Hebrew aliases:", [x.encode('ascii', 'xmlcharrefreplace').decode() for x in hebrew_aliases])
        else:
            print('Not found')
    except Exception as e:
        print('Error:', e)

test_mb_artist('Arik Einstein')
test_mb_artist('Shlomo Artzi')
