/* Pickleheads US court crawler — paste into the browser DevTools console
   while on https://www.pickleheads.com  (any page).

   This is BROWSER code, not Node — do NOT run it with `node`. (The Node piece
   is scripts/split-courts.mjs, which converts the downloaded JSON to ./data/*.yml.)

   Steps:
     1. Open https://www.pickleheads.com in Chrome, DevTools (Cmd+Option+I) > Console.
     2. Paste this whole file, press Enter. (If warned, type `allow pasting` first.)
     3. Wait ~5-10 min; it logs progress every 25 requests, then downloads
        pickleheads-us-courts.json.
     4. Move that file into /Users/ben/picklerpal/ and run: node scripts/split-courts.mjs
*/
(async () => {
  const DELAY_MS = 250, CAP = 100, MIN_DEG = 0.02;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const US_SEEDS = [
    { north: 49.5,  south: 24.3,  west: -125.0, east: -66.8  }, // contiguous 48
    { north: 71.6,  south: 51.0,  west: -169.9, east: -129.9 }, // Alaska
    { north: 53.5,  south: 50.9,  west: 172.0,  east: 180.0  }, // Aleutians
    { north: 22.3,  south: 18.8,  west: -160.4, east: -154.7 }, // Hawaii
    { north: 18.6,  south: 17.6,  west: -67.5,  east: -64.5  }, // Puerto Rico + USVI
    { north: 20.7,  south: 13.2,  west: 144.5,  east: 146.2  }, // Guam + CNMI
    { north: -14.1, south: -14.4, west: -171.2, east: -170.4 }, // American Samoa
  ];
  const quad = b => { const ml = (b.north + b.south) / 2, mg = (b.west + b.east) / 2; return [
    { north: b.north, south: ml, west: b.west, east: mg }, { north: b.north, south: ml, west: mg, east: b.east },
    { north: ml, south: b.south, west: b.west, east: mg }, { north: ml, south: b.south, west: mg, east: b.east }]; };
  const small = b => (b.north - b.south) < MIN_DEG || (b.east - b.west) < MIN_DEG;
  async function search(t) {
    const input = { "0": { north: t.north, south: t.south, west: t.west, east: t.east, filters: { access: [], amenities: [], features: [], surface: [] } } };
    const url = 'https://www.pickleheads.com/api/trpc/misc.search?batch=1&input=' + encodeURIComponent(JSON.stringify(input));
    for (let a = 0; a < 5; a++) {
      try { const r = await fetch(url, { credentials: 'omit' });
        if (r.status === 200) return (await r.json())?.[0]?.result?.data?.courts || [];
        await sleep(1000 * (a + 1));
      } catch (e) { await sleep(1000 * (a + 1)); }
    }
    throw new Error('giving up on tile ' + JSON.stringify(t));
  }
  const courts = new Map(), queue = US_SEEDS.slice();
  let reqs = 0, leaves = 0, overflow = 0; const t0 = Date.now();
  console.log('[pickleheads] starting crawl…');
  while (queue.length) {
    const t = queue.shift(); const found = await search(t); reqs++;
    if (found.length >= CAP && !small(t)) { for (const c of quad(t)) queue.push(c); }
    else { if (found.length >= CAP) overflow++; leaves++;
      for (const c of found) if (c.country_slug === 'us' && !c.is_deleted) courts.set(c.id, c); }
    if (reqs % 25 === 0) console.log(`[pickleheads] reqs=${reqs} queue=${queue.length} courts=${courts.size} (${Math.round((Date.now()-t0)/1000)}s)`);
    await sleep(DELAY_MS);
  }
  console.log(`[pickleheads] crawl done: ${reqs} requests, ${courts.size} US courts, ${overflow} overflow tiles.`);
  let sitemap_counts = {};
  try {
    const sm = await (await fetch('https://www.pickleheads.com/sitemap.xml?section=courts', { credentials: 'omit' })).text();
    for (const m of sm.matchAll(/\/courts\/us\/([^\/]+)\//g)) sitemap_counts[m[1]] = (sitemap_counts[m[1]] || 0) + 1;
    console.log('[pickleheads] sitemap US states:', Object.keys(sitemap_counts).length);
  } catch (e) { console.warn('[pickleheads] sitemap fetch failed; validation skipped:', e); }
  const payload = { scraped_at: new Date().toISOString(), count: courts.size, courts: [...courts.values()], sitemap_counts };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  a.download = 'pickleheads-us-courts.json';
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`[pickleheads] downloaded pickleheads-us-courts.json (${courts.size} courts). Next: node scripts/split-courts.mjs`);
})();
