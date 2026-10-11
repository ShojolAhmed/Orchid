"""Real-Chromium checks against a stubbed Spotify. Needs: Playwright for Python and the dev server running with
VITE_SPOTIFY_CLIENT_ID=testclient VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback (see docs/TESTING.md).
Not part of `npm test`. Prints PASS/FAIL per check and exits non-zero on any failure."""
import json, sys, time
from playwright.sync_api import sync_playwright
from stub_spotify import Stub, ALL_SCOPES, PLAYBACK_ONLY, PNG, sid

BASE = 'http://127.0.0.1:5173'
results = []
def check(name, cond, detail=''):
    results.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))

def new_page(browser, stub, scopes=ALL_SCOPES, signed_in=True, width=1440):
    ctx = browser.new_context(viewport={'width': width, 'height': 900})
    if signed_in:
        ctx.add_init_script(f"localStorage.setItem('orchid.spotify.credentials.v1', JSON.stringify({{v:1, clientId:'testclient', refreshToken:'r1', scopes:{json.dumps(scopes)}}}))")
    ctx.route('https://accounts.spotify.com/api/token', lambda r: r.fulfill(status=200, headers={'content-type':'application/json'}, body=json.dumps({'access_token':'at','token_type':'Bearer','expires_in':3600,'refresh_token':'r1','scope':' '.join(scopes)})))
    ctx.route('https://api.spotify.com/**', stub.handle)
    ctx.route('https://i.scdn.co/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    ctx.route('https://sdk.scdn.co/**', lambda r: r.abort())
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'sdk.scdn' not in m.text and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
    return ctx, page, errors

def overflow(page): return page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- signed out ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub, signed_in=False)
    page.goto(BASE + '/'); page.wait_for_selector('text=Connect Spotify to see your music')
    check('signed out: Home asks to connect and shows no music', page.locator('text=Recently played').count() == 0)
    check('signed out: no Spotify API request was made', len(stub.log) == 0, str(stub.log))
    check('signed out: the old "Preview mode" badge is gone', page.locator('text=Preview mode').count() == 0)
    page.goto(BASE + '/search?q=abc'); page.wait_for_selector('text=Connect Spotify to search Spotify')
    check('signed out: search shows a restricted state, not results', page.locator('text=Songs').count() == 0 and len(stub.log) == 0)
    check('signed out: no console errors', not errors, str(errors)); ctx.close()

    # ---------- Home ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    page.goto(BASE + '/'); page.wait_for_selector('h2:has-text("Recently played")'); page.wait_for_selector('h2:has-text("Your top artists")'); page.wait_for_selector('h2:has-text("New releases")')
    check('home: real shelves render from Spotify data', all(page.locator(f'h2:has-text("{t}")').count() for t in ['Recently played','Your top artists','Your playlists','Saved albums']))
    check('home: no invented "Made for you" / "Popular artists" shelves', page.locator('h2:has-text("Made for you")').count() == 0 and page.locator('h2:has-text("Popular artists")').count() == 0)
    check('home: explains what Spotify no longer provides', page.locator('summary:has-text("Why no")').count() == 1)
    check('home: playlist HTML description is shown as plain text', page.locator('text=Mix of & things').count() >= 1)
    check('home: each endpoint requested once despite shared hooks', stub.count('GET', r'^/me/playlists') == 1 and stub.count('GET', r'^/me/albums') == 1, str(stub.log))
    check('home: sidebar lists real playlists', page.locator('nav a:has-text("Playlist 80")').count() >= 1)
    check('home: no console errors', not errors, str(errors)); ctx.close()

    # ---------- Search ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    page.goto(BASE + '/search'); page.wait_for_selector('text=Try searching for')
    inp = page.locator('#search-input'); inp.click(); stub.reset_log()
    inp.press_sequentially('daft punk', delay=40)
    page.wait_for_selector('h2:has-text("Songs")'); page.wait_for_timeout(500)
    searches = [u for m, u in stub.log if u.startswith('/search')]
    check('search: typing 9 characters made ONE request (debounced)', len(searches) == 1, str(searches))
    check('search: one request covers tracks, albums, artists and playlists at limit 10', 'type=track%2Calbum%2Cartist%2Cplaylist' in searches[0] and 'limit=10' in searches[0], searches[0] if searches else '')
    check('search: rows show artwork, title, artist, album', page.locator('ol[aria-label^="Songs matching"] li').first.inner_text().count('Song 1') == 1 and page.locator('ol li img').count() > 0)
    check('search: null entries and episodes are skipped without crashing', page.locator('ol[aria-label^="Songs matching"] li').count() == 10)
    check('search: URL follows the query', 'q=daft+punk' in page.url or 'q=daft%20punk' in page.url, page.url)
    check('search: playlists keep real owner text and skip nulls', page.locator('h3:has-text("Playlist 80")').count() == 1)
    # stale results: type a new query quickly, then another before the first finishes
    stub.reset_log(); inp.fill(''); inp.press_sequentially('first', delay=20); page.wait_for_timeout(120); inp.fill(''); inp.press_sequentially('second', delay=20)
    page.wait_for_timeout(900)
    shown = page.locator('[aria-label^="Songs matching"]').get_attribute('aria-label')
    check('search: only the latest query is shown (stale ignored)', shown == 'Songs matching second', shown)
    sent = [u for m, u in stub.log if u.startswith('/search')]
    check('search: abandoned queries never reached Spotify', all('first' not in u for u in sent), str(sent))
    # filter + load more
    page.locator('button:has-text("Songs")').first.click(); stub.reset_log(); page.locator('button:has-text("Show more")').click(); page.wait_for_timeout(400)
    check('search: "Show more" pages with offset=10 for tracks only', any('offset=10' in u and 'type=track' in u and 'album' not in u for _, u in stub.log), str(stub.log))
    check('search: more rows appended', page.locator('ol[aria-label^="Songs matching"] li').count() == 20)
    # empty
    inp.fill('zzz'); page.wait_for_timeout(100)
    check('search: no console errors', not errors, str(errors)); ctx.close()

    # restricted / rate limited
    stub = Stub(); stub.search_status = 403; ctx, page, errors = new_page(browser, stub)
    page.goto(BASE + '/search?q=abc'); page.wait_for_selector("text=Spotify won't share this")
    check('search 403: restricted state explains dev-mode rules', page.locator('text=development mode').count() >= 1); ctx.close()
    stub = Stub(); stub.search_status = 500; ctx, page, errors = new_page(browser, stub)
    page.goto(BASE + '/search?q=abc'); page.wait_for_selector('text=Search failed')
    check('search 5xx: error state with retry after the single automatic retry', page.locator('button:has-text("Try again")').count() == 1 and stub.count('GET', r'^/search') == 2, str(stub.log)); ctx.close()

    # ---------- Album / Artist navigation ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    aid = sid(501); page.goto(f'{BASE}/album/{aid}'); page.wait_for_selector('h1')
    head = page.locator('h1').first.locator('xpath=ancestor::*[self::header or self::div][1]').inner_text()
    check('album: header shows artist, release date (month precision only) and song count', 'Album Artist' in head and 'July 2023' in head and '12 songs' in head and '2023-07' not in head, head)
    check('album: lists tracks', page.locator('ol[aria-label^="Tracks in"] li').count() == 8)
    page.locator('header a:has-text("Album Artist"), a:has-text("Album Artist")').first.click(); page.wait_for_selector('h2:has-text("Albums")')
    check('album -> artist navigation works', '/artist/' in page.url, page.url)
    check('artist: discography grouped with duplicates removed', page.locator('h2:has-text("Singles and EPs")').count() == 1 and page.locator('article').count() == 5, str(page.locator('article').count()))
    check('artist: says what Spotify no longer shares, invents no top tracks or listener counts', page.locator('text=top tracks').count() >= 1 and page.locator('text=monthly listeners').count() == 0 and page.locator('h2:has-text("Popular")').count() == 0)
    check('artist: albums without artwork still render a placeholder', page.locator('article').count() == 5)
    page.locator('article h3 >> nth=0').click(); page.wait_for_selector('ol[aria-label^="Tracks in"]')
    check('artist -> album navigation works', '/album/' in page.url, page.url)
    stub.reset_log(); page.goto(f'{BASE}/album/not-an-id'); page.wait_for_selector('text=/not found|Page not found|Nothing/i')
    check('album: malformed id shows Not found without any album request', stub.count('GET', r'^/albums/') == 0, str(stub.log))
    check('nav: no console errors', not errors, str(errors)); ctx.close()

    # ---------- Playlists ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    page.goto(f'{BASE}/playlist/{sid(80)}'); page.wait_for_selector('ol[aria-label^="Tracks in"]')
    check('playlist (owned): tracks shown from renamed `item` field', page.locator('ol[aria-label^="Tracks in"] li').count() == 5)
    check('playlist: skipped episode/null counted and explained', page.locator('text=2 items in this playlist').count() == 1)
    check('playlist: owned playlist needed no extra items request', stub.count('GET', r'/items') == 0, str(stub.log))
    page.goto(f'{BASE}/playlist/{sid(81)}'); page.wait_for_selector("text=Spotify doesn't share this playlist")
    check('playlist (someone else\'s): explains restriction, still offers play, makes no doomed items request', page.locator('button[aria-label^="Play Playlist 81"], button[aria-label*="Playlist 81"]').count() >= 1 and stub.count('GET', rf'^/playlists/{sid(81)}/items') == 0, str(stub.log))
    check('playlist: no console errors', not errors, str(errors)); ctx.close()

    # ---------- Library ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    page.goto(f'{BASE}/library'); page.wait_for_selector('text=Liked Songs'); page.wait_for_selector('text=Album 30')
    check('library: states the Spotify-library vs temporary-queue difference', page.locator("text=temporary").count() >= 1 and page.locator("text=Your Spotify library vs. the queue").count() == 1)
    check('library: playlists, saved albums and followed artists are all listed', page.locator('text=Playlist 80').count() >= 1 and page.locator('text=Album 30').count() >= 1 and page.locator('text=Artist 40').count() >= 1)
    page.locator('button[aria-pressed]:has-text("Liked Songs")').click(); page.wait_for_selector('ol[aria-label="Liked Songs"]')
    page.wait_for_timeout(400)
    hearts = page.locator('ol[aria-label="Liked Songs"] button[aria-label*="Remove"]')
    check('library: liked songs show as saved (known without a lookup)', hearts.count() == 6, str(hearts.count()))
    check('library: no contains request needed for the liked list itself', stub.count('GET', r'/me/library/contains') <= 1, str(stub.log))
    stub.reset_log(); hearts.first.click(); page.wait_for_timeout(400)
    check('library: removing sends DELETE /me/library with the track URI', any(m == 'DELETE' and '/me/library?uris=spotify%3Atrack%3A' in u for m, u in stub.log), str(stub.log))
    check('library: heart flips only after Spotify confirmed', hearts.count() == 5 and page.locator('text=Removed').count() >= 1)
    stub.fail_library_write = True; stub.reset_log()
    page.locator('ol[aria-label="Liked Songs"] button[aria-label*="Remove"]').first.click(); page.wait_for_timeout(500)
    check('library: a refused write changes nothing and says so', page.locator('ol[aria-label="Liked Songs"] button[aria-label*="Remove"]').count() == 5 and page.locator('text=refused').count() >= 1, page.locator('[role=status]').all_inner_texts().__str__())
    stub.fail_library_write = False
    # save from search
    page.goto(f'{BASE}/search?q=abc'); page.wait_for_selector('ol[aria-label^="Songs matching"]'); page.wait_for_timeout(300)
    check('search rows: saved state looked up in ONE batched request', stub.count('GET', r'/me/library/contains') <= 2, str(stub.count('GET', r'/me/library/contains')))
    stub.reset_log(); page.locator('ol[aria-label^="Songs matching"] button[aria-label^="Save"]').first.click(); page.wait_for_timeout(400)
    check('search: saving sends PUT /me/library', any(m == 'PUT' and u.startswith('/me/library?uris=spotify%3Atrack%3A') for m, u in stub.log), str(stub.log))
    # add to playlist + create
    stub.reset_log(); page.locator('ol[aria-label^="Songs matching"] button[aria-label^="Add Song"][aria-label$="to a playlist"]').first.click(); page.wait_for_selector('text=Your playlists')
    opts = page.locator('ul[aria-label="Your playlists"] button')
    check('add to playlist: lists only playlists you own or collaborate on', opts.count() == 2, str(opts.all_inner_texts()))
    opts.first.click(); page.wait_for_selector('text=Added to Playlist 80')
    check('add to playlist: POST /playlists/{id}/items', stub.count('POST', r'^/playlists/\w+/items') == 1, str(stub.log))
    page.fill('input[placeholder="Playlist name"]', 'Road trip'); page.locator('button:has-text("Create")').click(); page.wait_for_selector('text=/Created/')
    check('create playlist: POST /me/playlists then adds the track', stub.count('POST', r'^/me/playlists$') == 1 and stub.count('POST', r'^/playlists/\w+/items') == 2, str(stub.log))
    check('library: no console errors', not errors, str(errors)); ctx.close()

    # ---------- keyboard: add-to-playlist popover ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub)
    TRIGGER = 'button[aria-label^="Add "][aria-label$="to a playlist"]'
    def focused(): return page.evaluate("document.activeElement.tagName + '|' + (document.activeElement.getAttribute('aria-label') || (document.activeElement.textContent || '').slice(0, 28))")
    page.goto(BASE + '/search?q=abc'); page.wait_for_selector(TRIGGER)
    trigger = page.locator(TRIGGER).first
    trigger.focus(); page.keyboard.press('Enter'); page.wait_for_selector('[role=dialog]')
    page.keyboard.press('Tab'); page.wait_for_timeout(150)
    check('popover keyboard: Tab from the trigger lands inside the panel', page.evaluate("!!document.activeElement.closest('[role=dialog]')"), focused())
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    check('popover keyboard: Escape closes and returns focus to the trigger', page.locator('[role=dialog]').count() == 0 and focused().startswith('BUTTON|Add '), focused())
    trigger.focus(); page.keyboard.press('Enter'); page.keyboard.press('Tab'); stub.reset_log()
    before = focused(); page.keyboard.press('Enter'); page.wait_for_timeout(800)
    check('popover keyboard: Enter on a playlist sends one POST', stub.count('POST', r'^/playlists/\w+/items') == 1, str(stub.log))
    check('popover keyboard: focus stays on the option during and after the request', focused() == before, f'{before} -> {focused()}')
    check('popover keyboard: result is announced in the status region', 'Added to' in page.locator('[role=dialog] [role=status]').inner_text())
    page.mouse.click(700, 80); page.wait_for_timeout(250)
    check('popover pointer: an outside click closes it without pulling focus back to the trigger', page.locator('[role=dialog]').count() == 0 and not focused().startswith('BUTTON|Add '), focused())
    check('popover keyboard: no console errors', not errors, str(errors)); ctx.close()

    # ---------- reconnect gating ----------
    stub = Stub(); ctx, page, errors = new_page(browser, stub, scopes=PLAYBACK_ONLY)
    page.goto(f'{BASE}/library'); page.wait_for_selector('text=Reconnect Spotify to see your library')
    check('old session: library asks to reconnect and makes no library request', stub.count('GET', r'/me/(tracks|albums|playlists|following)') == 0, str(stub.log))
    page.goto(f'{BASE}/search?q=abc'); page.wait_for_selector('ol[aria-label^="Songs matching"]')
    check('old session: search still works (needs no scope) with no save/playlist controls', page.locator('button[aria-label^="Save"]').count() == 0 and stub.count('GET', r'/me/library/contains') == 0)
    ctx.close()

    # ---------- layout ----------
    for width in (1440, 900, 390):
        stub = Stub(); ctx, page, errors = new_page(browser, stub, width=width)
        bad = []
        for path in ['/', f'/search?q=abc', '/library', f'/album/{sid(501)}', f'/artist/{sid(900)}', f'/playlist/{sid(80)}']:
            page.goto(BASE + path); page.wait_for_selector('main h1, main h2'); page.wait_for_timeout(500)
            if overflow(page): bad.append(path)
        check(f'layout {width}px: no horizontal overflow on 6 routes', not bad, str(bad))
        check(f'layout {width}px: no console errors', not errors, str(errors)); ctx.close()
    browser.close()

print(f'\n{sum(results)}/{len(results)} checks passed'); sys.exit(0 if all(results) else 1)
