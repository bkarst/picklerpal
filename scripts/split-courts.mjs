// Converts the raw crawl dump (from scripts/pickleheads-crawl.js, run in the
// browser console) into ./data/<state>.yml + _index.yml + _validation.yml.
//
// Usage:  node scripts/split-courts.mjs [path-to-dump.json]
// Default input: ./pickleheads-us-courts.json  (or ~/Downloads/pickleheads-us-courts.json)
//
// Pure local file I/O — no network, so it runs anywhere.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA = path.resolve('data');
const candidates = [
  process.argv[2],
  'pickleheads-us-courts.json',
  path.join(os.homedir(), 'Downloads', 'pickleheads-us-courts.json'),
].filter(Boolean);
const input = candidates.find(p => fs.existsSync(p));
if (!input) { console.error('No dump found. Pass the path: node scripts/split-courts.mjs <file.json>'); process.exit(1); }
fs.mkdirSync(DATA, { recursive: true });

const dump = JSON.parse(fs.readFileSync(input, 'utf8'));
const courts = dump.courts || dump;                 // accept bare array too
const sitemapCounts = dump.sitemap_counts || {};
const scrapedAt = dump.scraped_at || null;

// ---- YAML emitter (double-quotes strings that need it) ----
function needsQuote(s) {
  if (s === '') return true;
  if (/^[\s\-?:#&*!|>'"%@`]/.test(s)) return true;
  if (/\s$/.test(s)) return true;
  if (/[:#]\s/.test(s) || /\s#/.test(s)) return true;
  if (/[:\[\]{}",]/.test(s)) return true;
  if (/[\n\t]/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[+-]?(\d|\.\d)/.test(s)) return true;
  return false;
}
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return needsQuote(s) ? q(s) : s;
}
const isScalar = v => v === null || v === undefined || typeof v !== 'object';
function emit(v, indent, lines) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) { lines[lines.length - 1] += ' []'; return; }
    if (v.every(isScalar)) { lines[lines.length - 1] += ' [' + v.map(scalar).join(', ') + ']'; return; }
    for (const item of v) {
      if (isScalar(item)) lines.push(pad + '- ' + scalar(item));
      else { lines.push(pad + '-'); emitItem(item, indent + 1, lines); }
    }
    return;
  }
  for (const k of Object.keys(v)) {
    const val = v[k];
    if (isScalar(val)) lines.push(pad + k + ': ' + scalar(val));
    else if (Array.isArray(val) && (val.length === 0 || val.every(isScalar))) { lines.push(pad + k + ':'); emit(val, indent, lines); }
    else { lines.push(pad + k + ':'); emit(val, indent + 1, lines); }
  }
}
function emitItem(obj, indent, lines) {
  const pad = '  '.repeat(indent);
  let first = true;
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (first) {
      lines[lines.length - 1] = '  '.repeat(indent - 1) + '- ' + k + ':' + (isScalar(val) ? ' ' + scalar(val) : '');
      if (!isScalar(val)) emit(val, indent + 1, lines);
      first = false;
    } else if (isScalar(val)) lines.push(pad + k + ': ' + scalar(val));
    else if (Array.isArray(val) && (val.length === 0 || val.every(isScalar))) { lines.push(pad + k + ':'); emit(val, indent, lines); }
    else { lines.push(pad + k + ':'); emit(val, indent + 1, lines); }
  }
}
function toYaml(obj) {
  const lines = [];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (isScalar(val)) lines.push(k + ': ' + scalar(val));
    else if (Array.isArray(val) && (val.length === 0 || val.every(isScalar))) { lines.push(k + ':'); emit(val, 0, lines); }
    else { lines.push(k + ':'); emit(val, 1, lines); }
  }
  return lines.join('\n') + '\n';
}

function decodeCoords(hex) {
  try {
    const bytes = hex.match(/../g).map(h => parseInt(h, 16));
    const dv = new DataView(new Uint8Array(bytes).buffer);
    const le = bytes[0] === 1;
    return { lng: dv.getFloat64(5, le), lat: dv.getFloat64(13, le) };
  } catch { return { lng: null, lat: null }; }
}

const OUT = ['id','title','address','lat','lng','coords','phone','email','url','reservation_url',
  'facility_type','access','has_reservations','indoor_courts','outdoor_courts','total_courts',
  'has_pickleball','surface','lines','nets','amenities','description','access_details',
  'schedule_details','images','country_slug','state_slug','city_slug','city_id','slug','path',
  'is_hidden','is_deleted','created_at','updated_at','schedule_sources_updated_at'];
function shape(c) {
  const d = decodeCoords(c.coords || '');
  const o = {};
  for (const f of OUT) o[f] = f === 'lat' ? d.lat : f === 'lng' ? d.lng : (c[f] === undefined ? null : c[f]);
  return o;
}
const stateName = slug => slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

// USPS 2-letter code -> canonical state slug, used to repair malformed/fallback
// state_slug values (e.g. "ca", "united-states") by parsing the court's address.
const USPS_TO_SLUG = {
  AL:'alabama',AK:'alaska',AZ:'arizona',AR:'arkansas',CA:'california',CO:'colorado',CT:'connecticut',
  DE:'delaware',FL:'florida',GA:'georgia',HI:'hawaii',ID:'idaho',IL:'illinois',IN:'indiana',IA:'iowa',
  KS:'kansas',KY:'kentucky',LA:'louisiana',ME:'maine',MD:'maryland',MA:'massachusetts',MI:'michigan',
  MN:'minnesota',MS:'mississippi',MO:'missouri',MT:'montana',NE:'nebraska',NV:'nevada',NH:'new-hampshire',
  NJ:'new-jersey',NM:'new-mexico',NY:'new-york',NC:'north-carolina',ND:'north-dakota',OH:'ohio',
  OK:'oklahoma',OR:'oregon',PA:'pennsylvania',RI:'rhode-island',SC:'south-carolina',SD:'south-dakota',
  TN:'tennessee',TX:'texas',UT:'utah',VT:'vermont',VA:'virginia',WA:'washington',WV:'west-virginia',
  WI:'wisconsin',WY:'wyoming',DC:'district-of-columbia',PR:'puerto-rico',VI:'us-virgin-islands',
  GU:'guam',AS:'american-samoa',MP:'northern-mariana-islands',
};
const VALID_SLUGS = new Set(Object.values(USPS_TO_SLUG));
// recover a state slug from the address (last valid USPS code wins; state sits near the ZIP)
function recoverState(c) {
  const m = [...String(c.address || '').matchAll(/(?:^|[,\s])([A-Z]{2})(?=[,\s]|$)/g)]
    .map(x => x[1]).filter(x => USPS_TO_SLUG[x]);
  return m.length ? USPS_TO_SLUG[m[m.length - 1]] : null;
}

// dedup + group (repairing malformed state_slug along the way)
let remapped = 0, unrecoverable = 0;
const seen = new Map();
for (const c of courts) {
  if (c.country_slug !== 'us' || c.is_deleted === true) continue;
  if (!VALID_SLUGS.has(c.state_slug)) {
    const fixed = recoverState(c);
    if (fixed) { c.state_slug = fixed; remapped++; }
    else { unrecoverable++; continue; }
  }
  if (!c.state_slug) continue;
  seen.set(c.id, c);
}
const byState = new Map();
for (const c of seen.values()) {
  if (!byState.has(c.state_slug)) byState.set(c.state_slug, []);
  byState.get(c.state_slug).push(c);
}

// remove stale state files that we won't regenerate (e.g. old ca.yml / united-states.yml)
const wantFiles = new Set([...byState.keys()].map(s => s + '.yml'));
for (const f of fs.readdirSync(DATA)) {
  if (f.endsWith('.yml') && !f.startsWith('_') && !wantFiles.has(f)) fs.unlinkSync(path.join(DATA, f));
}

let written = 0;
for (const [slug, list] of byState) {
  const courtsOut = list.map(shape).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const doc = { state: stateName(slug), state_slug: slug, country: 'us', court_count: courtsOut.length, scraped_at: scrapedAt, source: 'pickleheads.com misc.search API', courts: courtsOut };
  fs.writeFileSync(path.join(DATA, slug + '.yml'), toYaml(doc));
  written++;
}

// index
const counts = [...byState.entries()].map(([s, l]) => [s, l.length]).sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(path.join(DATA, '_index.yml'), toYaml({
  total_courts: seen.size, states: counts.length, scraped_at: scrapedAt, by_state: Object.fromEntries(counts),
}));

// validation vs sitemap
if (Object.keys(sitemapCounts).length) {
  const scraped = Object.fromEntries(counts);
  const all = [...new Set([...Object.keys(sitemapCounts), ...Object.keys(scraped)])].sort();
  const detail = all.map(s => ({ state: s, scraped: scraped[s] || 0, sitemap: sitemapCounts[s] || 0, diff: (scraped[s] || 0) - (sitemapCounts[s] || 0) }));
  fs.writeFileSync(path.join(DATA, '_validation.yml'), toYaml({
    scraped_total: seen.size,
    sitemap_us_total: Object.values(sitemapCounts).reduce((a, x) => a + x, 0),
    mismatched_states: detail.filter(d => d.diff !== 0).length,
    detail,
  }));
}

console.log(`Wrote ${written} state files + _index.yml${Object.keys(sitemapCounts).length ? ' + _validation.yml' : ''} to ./data/  (${seen.size} courts)`);
console.log(`Repaired ${remapped} malformed state_slug records; ${unrecoverable} unrecoverable (skipped).`);
