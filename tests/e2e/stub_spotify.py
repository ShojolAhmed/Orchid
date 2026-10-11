"""A stubbed Spotify for browser checks. Mirrors the February to July 2026 response shapes, including the
`items`/`item` playlist rename, a playlist whose tracks are not shared, null list entries and an episode."""
import json, re
from urllib.parse import urlparse, parse_qs, unquote

ALL_SCOPES = ['streaming','user-modify-playback-state','user-read-email','user-read-private','user-library-read','user-library-modify',
              'playlist-read-private','playlist-read-collaborative','playlist-modify-private','playlist-modify-public','user-follow-read','user-top-read','user-read-recently-played']
PLAYBACK_ONLY = ['streaming','user-modify-playback-state','user-read-email','user-read-private']
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')

def sid(n): return str(n).zfill(22).replace('0','a') if len(str(n)) < 22 else str(n)
def img(w=300): return {'url': f'https://i.scdn.co/image/{w}', 'width': w, 'height': w}
ARTIST = lambda n, name=None: {'id': sid(n), 'name': name or ('Album Artist' if n == 900 else f'Artist {n}'), 'type': 'artist'}
def track(n, album=None, with_album=True):
    t = {'type':'track','id':sid(n),'uri':f'spotify:track:{sid(n)}','name':f'Song {n}','duration_ms':200000+n*1000,'track_number':n,'explicit':n%3==0,
         'artists':[ARTIST(900+n%3)]}
    if with_album: t['album'] = {'id':sid(500+n%4),'name':f'Album {500+n%4}','images':[img(640),img(300)],'artists':[ARTIST(900)],'release_date':'2024-03-05','release_date_precision':'day'}
    return t
def album(n, kind='album'):
    return {'type':'album','id':sid(n),'name':f'Album {n}','album_type':kind,'total_tracks':12,'release_date':'2023-07','release_date_precision':'month','images':[img(300)] if n%5 else [],'artists':[ARTIST(900)]}
def paging(items, offset=0, limit=50, total=None, nxt=False):
    return {'items':items,'total':total if total is not None else len(items),'offset':offset,'limit':limit,'next':'https://api.spotify.com/next' if nxt else None}
def playlist(n, owner='me123', collab=False): 
    return {'type':'playlist','id':sid(n),'name':f'Playlist {n}','description':'Mix <b>of</b> &amp; things','owner':{'id':owner,'display_name':'Tester' if owner=='me123' else 'Someone Else'},
            'collaborative':collab,'public':False,'images':[img(300)],'items':{'total':24}}

class Stub:
    def __init__(self):
        self.log=[]; self.saved=set(); self.fail_library_write=False; self.search_status=200; self.search_delay_ms=0; self.profile_status=200
    def reset_log(self): self.log=[]
    def count(self, method, path_re):
        return sum(1 for m,u in self.log if m==method and re.search(path_re,u))

    def handle(self, route):
        req=route.request; url=urlparse(req.url); path=url.path.removeprefix('/v1'); q={k:v[0] for k,v in parse_qs(url.query).items()}
        self.log.append((req.method, path + ('?'+url.query if url.query else '')))
        cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
        def ok(body, status=200): route.fulfill(status=status, headers={**cors,'content-type':'application/json'}, body=json.dumps(body) if body is not None else '')
        if req.method=='OPTIONS': return route.fulfill(status=204, headers=cors)
        m=req.method
        if path=='/me' and m=='GET':
            return ok({'id':'me123','display_name':'Tester','images':[],'uri':'spotify:user:me123'}) if self.profile_status==200 else ok({'error':{'status':self.profile_status,'message':'x'}}, self.profile_status)
        if path=='/search':
            if self.search_status!=200:
                return ok({'error':{'status':self.search_status,'message':'forbidden'}}, self.search_status)
            term=q.get('q',''); types=q.get('type','').split(','); lim=int(q.get('limit','5')); off=int(q.get('offset','0'))
            out={}
            if 'track' in types: out['tracks']=paging([track(off+i+1) for i in range(lim)]+[None], off, lim, 400, True)
            if 'album' in types: out['albums']=paging([album(60+off+i) for i in range(lim)], off, lim, 300, True)
            if 'artist' in types: out['artists']=paging([{**ARTIST(70+i,f'{term} artist {i}'),'images':[img()],'genres':[]} for i in range(3)], off, lim, 3)
            if 'playlist' in types: out['playlists']=paging([None, playlist(80), playlist(81, 'other')], off, lim, 3)
            return ok(out)
        mm=re.fullmatch(r'/albums/(\w+)', path)
        if mm: 
            a=album(int(mm.group(1).replace('a','0') or 0) if False else 500); a['id']=mm.group(1); a['uri']=f'spotify:album:{mm.group(1)}'
            a['tracks']=paging([{k:v for k,v in track(i+1,with_album=False).items()} for i in range(8)],0,50,8); return ok(a)
        if re.fullmatch(r'/artists/(\w+)', path): return ok({**ARTIST(900,'Album Artist'),'id':path.split('/')[-1],'images':[img()],'genres':[]})
        if re.fullmatch(r'/artists/(\w+)/albums', path): return ok(paging([album(10+i,'album') for i in range(3)]+[album(20+i,'single') for i in range(2)]+[album(10,'album')],0,50,6))
        mm=re.fullmatch(r'/playlists/(\w+)', path)
        if mm and m=='GET':
            pid=mm.group(1)
            if pid==sid(80): p=playlist(80); p['id']=pid; p['items']=paging([{'added_at':'x','item':track(i+1)} for i in range(5)]+[{'item':{'type':'episode','id':sid(99),'name':'Pod'}},{'item':None}],0,100,7); return ok(p)
            p=playlist(81,'other'); p['id']=pid; return ok(p)
        if path=='/me/playlists' and m=='GET': return ok(paging([playlist(80), playlist(81,'other'), playlist(82,collab=True)]))
        if path=='/me/albums': return ok(paging([{'added_at':'x','album':album(30+i)} for i in range(4)]))
        if path=='/me/tracks': return ok(paging([{'added_at':'x','track':track(i+1)} for i in range(6)], 0, 50, 6))
        if path=='/me/following': return ok({'artists':{'items':[{**ARTIST(40+i),'images':[img()]} for i in range(2)],'total':2,'limit':50,'next':None,'cursors':{}}})
        if path=='/me/top/artists': return ok(paging([{**ARTIST(50+i),'images':[img()]} for i in range(4)]))
        if path=='/me/player/recently-played': return ok({'items':[{'played_at':'x','track':track(i+1)} for i in range(6)]})
        if path=='/me/library/contains': return ok([u in self.saved for u in unquote(q.get('uris','')).split(',')])
        if path=='/me/library' and m in ('PUT','DELETE'):
            if self.fail_library_write: return ok({'error':{'status':403,'message':'Forbidden'}},403)
            for u in q.get('uris','').split(','): (self.saved.add if m=='PUT' else self.saved.discard)(u)
            return ok(None)
        if path=='/me/playlists' and m=='POST': return ok({**playlist(83), 'name': json.loads(req.post_data or '{}').get('name','New')}, 201)
        if re.fullmatch(r'/playlists/\w+/items', path) and m=='POST': return ok({'snapshot_id':'s'},201)
        return ok({'error':{'status':404,'message':'stub: no route '+path}},404)
