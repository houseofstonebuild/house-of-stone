import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, accessSync, statSync, constants } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { validateCatalog, homepageImage, publicCatalog } from './catalog.mjs';
import {storeMedia,uploadedManifest} from './media.mjs';
import {pageDescriptions} from './public/presentation.js';
import { prepareFoundingCollection } from './founding-collection.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const INTERESTS = ['Collecting a work', 'Sourcing for a project', 'Following the launch', 'Learning about the artists'];
const EVENTS = new Set(['page_view', 'explore_click', 'artist_view', 'work_view', 'inquiry_opened', 'inquiry_started', 'model_view', 'model_interaction', 'photo_view']);
const PAGES = new Set(['home', 'collection', 'category', 'artists', 'artist', 'work', 'making', 'designers', 'collectors', 'house', 'privacy', 'notfound']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha = value => createHash('sha256').update(value).digest();
const csvCell = value => { let clean = String(value ?? ''); if (/^\s*[=+@-]/.test(clean)) clean = "'" + clean; return '"' + clean.replace(/"/g, '""') + '"'; };
const csv = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function createApp(options = {}) {
  const compressedFiles = new Map();
  const env = options.env ?? process.env;
  const adminPassword = env.ADMIN_PASSWORD ?? '';
  if (adminPassword.length < 16) throw new Error('Set ADMIN_PASSWORD to at least 16 characters. Run npm run setup to generate one.');
  if (env.NODE_ENV === 'production' && !env.SITE_URL) throw new Error('Set SITE_URL to the public HTTPS address before deploying.');
  const siteURL = env.SITE_URL ? new URL(env.SITE_URL) : null;
  if (siteURL && (siteURL.username || siteURL.password || !['https:', 'http:'].includes(siteURL.protocol))) throw new Error('Invalid SITE_URL.');
  if (env.NODE_ENV === 'production' && siteURL.protocol !== 'https:') throw new Error('Production SITE_URL must use HTTPS.');
  const dataDir = resolve(options.dataDir ?? env.DATA_DIR ?? resolve(ROOT, 'data'));
  if (dataDir === PUBLIC || dataDir.startsWith(PUBLIC + '/')) throw new Error('DATA_DIR must be outside the public website files.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // Hosts may allow writes to a mounted directory without allowing its mode to change.
  try { chmodSync(dataDir, 0o700); }
  catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
  try { accessSync(dataDir, constants.W_OK | constants.X_OK); }
  catch (cause) {
    throw new Error('DATA_DIR is not writable. On Railway, mount the service volume at /app/data, set RAILWAY_RUN_UID=0, and deploy the variable change.', { cause });
  }
  const db = new DatabaseSync(resolve(dataDir, 'house-of-stone.sqlite'), { timeout: 5000 });
  chmodSync(resolve(dataDir, 'house-of-stone.sqlite'), 0o600);
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, session_hash TEXT NOT NULL,
      name TEXT NOT NULL, page TEXT NOT NULL, work_id TEXT NOT NULL, artist_id TEXT NOT NULL,
      source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, referrer TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS events_time ON events(created_at);
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY, submission_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, interest TEXT NOT NULL,
      message TEXT NOT NULL, topic TEXT NOT NULL, work_id TEXT NOT NULL, artist_id TEXT NOT NULL,
      session_hash TEXT, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL,
      notification TEXT NOT NULL, notification_attempts INTEGER NOT NULL DEFAULT 0,
      notification_next_at TEXT NOT NULL, notification_id TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE INDEX IF NOT EXISTS inquiries_time ON inquiries(created_at);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, starts_at INTEGER NOT NULL, hits INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS collection_state (
      id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, live_revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL, published_at TEXT NOT NULL, draft TEXT NOT NULL, published TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS collection_history (
      revision INTEGER PRIMARY KEY, published_at TEXT NOT NULL, catalog TEXT NOT NULL
    ) STRICT;
  `);
  let secret = db.prepare('SELECT value FROM settings WHERE key=?').get('hash_secret')?.value;
  if (!secret) { secret = randomUUID() + randomUUID(); db.prepare('INSERT INTO settings VALUES (?,?)').run('hash_secret', secret); }
  const hash = value => createHmac('sha256', secret).update(String(value)).digest('hex');
  const template = readFileSync(resolve(PUBLIC, 'index.html'), 'utf8');
  const mediaDir = resolve(dataDir, 'media');
  mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
  const contentOptions = { publicDir: PUBLIC, mediaDir };
  if (!db.prepare('SELECT id FROM collection_state WHERE id=1').get()) {
    const seed = validateCatalog(JSON.parse(readFileSync(resolve(ROOT, 'content/catalog.json'), 'utf8')), { ...contentOptions, publish: true });
    const now = new Date().toISOString(), json = JSON.stringify(seed);
    db.prepare('INSERT INTO collection_state VALUES (1,0,0,?,?,?,?)').run(now,now,json,json);
    db.prepare('INSERT INTO collection_history VALUES (0,?,?)').run(now,json);
  }
  let catalog, workMap, artistMap;
  function reloadCatalog() {
    catalog = publicCatalog(JSON.parse(db.prepare('SELECT published FROM collection_state WHERE id=1').get().published));
    workMap = new Map(catalog.works.map(work => [work.id, work]));
    artistMap = new Map(catalog.artists.map(artist => [artist.id, artist]));
  }
  reloadCatalog();
  function collectionState() {
    const row = db.prepare('SELECT * FROM collection_state WHERE id=1').get();
    return { revision: row.revision, liveRevision: row.live_revision, updatedAt: row.updated_at, publishedAt: row.published_at,
      draft: JSON.parse(row.draft), unpublished: row.draft !== row.published,
      history: db.prepare('SELECT revision,published_at FROM collection_history ORDER BY revision DESC LIMIT 20').all() };
  }
  function expectedRevision(input) {
    const current = collectionState();
    if (!Number.isSafeInteger(input.revision) || input.revision !== current.revision) throw new HttpError(409, 'The collection changed in another window. Reload the editor before saving again. Your edits are still here.');
    return current;
  }
  const insertEvent = db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const indexing = env.ENABLE_INDEXING === 'true';
  const emailConfigured = Boolean(env.RESEND_API_KEY && env.INQUIRY_EMAIL_FROM && env.INQUIRY_EMAIL_TO);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let notificationBusy = false;
  let closing = false;

  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const old = db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
    if (!old || now - old.starts_at >= windowMs) {
      db.prepare('INSERT OR REPLACE INTO rate_limits VALUES (?,?,1)').run(key, now);
      return;
    }
    if (old.hits >= max) throw new HttpError(429, 'Please wait a little before trying again.');
    db.prepare('UPDATE rate_limits SET hits=hits+1 WHERE key=?').run(key);
  }
  function clientHash(req) {
    const ip = env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim() : req.socket.remoteAddress;
    return hash(ip);
  }
  function origin(req) {
    if (siteURL) return siteURL.origin;
    return new URL('http://' + req.headers.host).origin;
  }
  function requireSameOrigin(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Request not permitted.');
    if (req.headers.origin && req.headers.origin !== origin(req)) throw new HttpError(403, 'Request not permitted.');
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
  }
  function authenticated(req) {
    const authorization = String(req.headers.authorization ?? '');
    if (!authorization.startsWith('Basic ')) return false;
    const [username, ...parts] = Buffer.from(authorization.slice(6), 'base64').toString().split(':');
    return username === 'admin' && timingSafeEqual(sha(parts.join(':')), sha(adminPassword));
  }
  async function body(req, limit = 20000) {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, limit === 20000 ? 'This inquiry is too long. Please shorten your message.' : 'This upload is too large.');
      chunks.push(chunk);
    }
    try { const parsed = JSON.parse(Buffer.concat(chunks).toString()); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(); return parsed; }
    catch { throw new HttpError(400, 'Please check the details and try again.'); }
  }
  function text(value, max, required = false) {
    if (typeof value !== 'string') { if (required) throw new HttpError(400, 'Please complete the required fields.'); return ''; }
    const clean = value.trim().replace(/\u0000/g, '');
    if (clean.length > max || (required && !clean)) throw new HttpError(400, 'Please check the length of your inquiry fields.');
    return clean;
  }
  function attribution(input) {
    const result = {};
    for (const key of ['source', 'medium', 'campaign']) {
      const value = typeof input?.[key] === 'string' ? input[key].slice(0, 80) : '';
      result[key] = /^[a-zA-Z0-9_. -]*$/.test(value) ? value : '';
    }
    let referrer = '';
    try { referrer = new URL(input?.referrer).hostname.slice(0, 120); } catch {}
    return { ...result, referrer };
  }
  function eventData(input) {
    if (!UUID.test(input.id) || !UUID.test(input.sessionId) || !EVENTS.has(input.name) || !PAGES.has(input.page)) throw new HttpError(400, 'Invalid activity.');
    const work = workMap.get(input.workId);
    const artist = artistMap.get(input.artistId);
    if (input.workId && !work || input.artistId && !artist) throw new HttpError(400, 'Unknown artwork or artist.');
    const a = attribution(input.attribution);
    return [input.id, new Date().toISOString(), hash(input.sessionId), input.name, input.page, work?.id ?? '', work?.artistId ?? artist?.id ?? '', a.source, a.medium, a.campaign, a.referrer];
  }
  function inquiryData(input) {
    if (!UUID.test(input.submissionId)) throw new HttpError(400, 'Please refresh and try again.');
    const name = text(input.name, 120, true), email = text(input.email, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (!INTERESTS.includes(input.interest)) throw new HttpError(400, 'Please choose your interest.');
    const message = text(input.message, 5000);
    const work = workMap.get(input.workId), artist = artistMap.get(input.artistId);
    if (input.workId && !work || input.artistId && !artist) throw new HttpError(400, 'This work is no longer listed. Please begin a general inquiry.');
    const allowedTopics = new Set(['General interest', 'Collection interest', 'Designer project', 'About the house']);
    if (work?.availability === 'sold' && input.intent !== 'alternatives') throw new HttpError(400, 'This sculpture is sold. Please inquire about related works instead.');
    const workTopic = work ? `${work.title}${artistMap.get(work.artistId) ? ' by ' + artistMap.get(work.artistId).name : ''}` : '';
    const topic = work ? (work.availability === 'sold' ? `Alternatives to ${workTopic}` : workTopic) : artist ? `Work by ${artist.name}` : allowedTopics.has(input.topic) ? input.topic : 'General interest';
    const a = attribution(input.attribution);
    const fingerprint = hash(JSON.stringify([name, email, input.interest, message, topic, work?.id, artist?.id]));
    return { name, email, interest: input.interest, message, topic, workId: work?.id ?? '', artistId: work?.artistId ?? artist?.id ?? '', a, fingerprint };
  }
  async function flushNotifications() {
    if (!emailConfigured || notificationBusy || closing) return;
    notificationBusy = true;
    try {
      const rows = db.prepare("SELECT * FROM inquiries WHERE notification IN ('pending','retrying') AND notification_attempts < 5 AND notification_next_at <= ? ORDER BY created_at LIMIT 5").all(new Date().toISOString());
      for (const row of rows) {
        if (closing) break;
        try {
          const response = await fetchImpl('https://api.resend.com/emails', {
            method: 'POST', signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `hos-${row.id}` },
            body: JSON.stringify({ from: env.INQUIRY_EMAIL_FROM, to: env.INQUIRY_EMAIL_TO.split(',').map(v => v.trim()).filter(Boolean), reply_to: row.email,
              subject: `House of Stone inquiry: ${row.topic}`,
              text: `Reference: ${row.id}\nReceived: ${row.created_at}\nName: ${row.name}\nEmail: ${row.email}\nInterest: ${row.interest}\nTopic: ${row.topic}\n\n${row.message}\n\nInbox: ${siteURL?.origin ?? ''}/admin` })
          });
          if (!response.ok) throw new Error('Notification request failed.');
          const result = await response.json();
          if (!result.id) throw new Error('Notification was not accepted.');
          if (closing) break;
          db.prepare("UPDATE inquiries SET notification='sent',notification_id=?,notification_attempts=notification_attempts+1 WHERE id=?").run(String(result.id), row.id);
        } catch {
          if (closing) break;
          const attempts = row.notification_attempts + 1;
          const next = new Date(Date.now() + Math.min(60 * 60000, 60000 * 2 ** attempts)).toISOString();
          db.prepare('UPDATE inquiries SET notification=?,notification_attempts=?,notification_next_at=? WHERE id=?').run(attempts >= 5 ? 'failed' : 'retrying', attempts, next, row.id);
        }
      }
    } finally { notificationBusy = false; }
  }
  function send(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  }
  function summary(days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const funnel = ['page_view', 'explore_click', 'work_view', 'inquiry_started', 'inquiry_submitted'].map(name => ({ name, sessions: db.prepare('SELECT count(DISTINCT session_hash) AS n FROM events WHERE name=? AND created_at>=?').get(name, since).n, events: db.prepare('SELECT count(*) AS n FROM events WHERE name=? AND created_at>=?').get(name, since).n }));
    const works = JSON.parse(db.prepare('SELECT published FROM collection_state WHERE id=1').get().published).works.map(work => {
      const views = db.prepare("SELECT count(*) AS views,count(DISTINCT session_hash) AS sessions FROM events WHERE name='work_view' AND work_id=? AND created_at>=?").get(work.id, since);
      return { work_id:work.id, title:work.title, ...views, inquiries:db.prepare('SELECT count(*) AS n FROM inquiries WHERE work_id=? AND created_at>=?').get(work.id,since).n };
    }).filter(work => work.views || work.inquiries).sort((a,b) => b.inquiries-a.inquiries || b.views-a.views);
    const sources = db.prepare("SELECT coalesce(nullif(source,''),'Direct / unknown') AS source, count(DISTINCT session_hash) AS sessions FROM events WHERE name='page_view' AND created_at>=? GROUP BY source ORDER BY sessions DESC").all(since);
    const modelActivity = Object.fromEntries(['model_view','model_interaction'].map(name=>[name,db.prepare('SELECT count(DISTINCT session_hash) AS n FROM events WHERE name=? AND created_at>=?').get(name,since).n]));
    const photoActivity={sessions:db.prepare("SELECT count(DISTINCT session_hash) AS n FROM events WHERE name='photo_view' AND created_at>=?").get(since).n};
    return { days, funnel, works, sources, modelActivity, photoActivity, inquiries: db.prepare('SELECT count(*) AS n FROM inquiries WHERE created_at>=?').get(since).n, emailConfigured, indexing, definition: 'Sessions are browser visits, not verified people. One session can skip steps. Bots and repeat visitors can affect counts.' };
  }
  function pageMeta(path, content = catalog) {
    const labels = { '/':'Zimbabwean stone sculpture', '/collection':'The collection', '/artists':'The artists', '/making':'The making', '/designers':'For designers', '/collectors':'For collectors', '/house':'The house', '/privacy':'Privacy' };
    if (labels[path]) return { title: `${labels[path]} | House of Stone`, description: pageDescriptions[path==='/'?'home':path.slice(1)] || content.site.description, image: homepageImage(content) };
    const collection = (content.collections || []).find(c => `/collections/${c.slug}` === path);
    if (collection) { const star = content.works.find(w => w.id === collection.starWorkId); return {title:`${collection.name} | House of Stone`,description:collection.description,image:content.assets[star?.image] || homepageImage(content)}; }
    const work = content.works.find(w => `/works/${w.slug}` === path);
    if (work) return { title: `${work.title} | House of Stone`, description: work.description, image: content.assets[work.image] || content.assets.hero };
    const artist = content.artists.find(a => `/artists/${a.slug}` === path);
    if (artist) return { title: `${artist.name} | House of Stone`, description: artist.description, image: content.assets[artist.portrait] || content.assets.hero };
    return null;
  }

  const server = createServer({ requestTimeout: 60000, headersTimeout: 10000, keepAliveTimeout: 5000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
    if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Invalid address.'); }
      if (decoded.includes('\\') || decoded.includes('\u0000') || decoded.split('/').some(part => part === '.' || part === '..')) throw new HttpError(400, 'Invalid address.');
      const path = decoded.replace(/\/$/, '') || '/';
      if (path.toLowerCase().startsWith('/admin') || path.toLowerCase().startsWith('/api/admin')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        rateLimit('admin:' + clientHash(req), 150, 60000);
        if (!authenticated(req)) { res.setHeader('WWW-Authenticate', 'Basic realm="House of Stone private", charset="UTF-8"'); return send(res, 401, 'Sign in to House of Stone.', 'text/plain; charset=utf-8'); }
      }
      if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
      if (req.method === 'GET' && path === '/content.json') return send(res, 200, catalog);
      if (req.method === 'GET' && path === '/api/admin/content') return send(res, 200, collectionState());
      if (req.method === 'GET' && path === '/api/admin/preview-content') return send(res, 200, publicCatalog(collectionState().draft, {preview:true}));
      if (req.method === 'POST' && path === '/api/admin/prepare-founding-collection') {
        requireSameOrigin(req);
        const current = expectedRevision(await body(req));
        const blueprint = JSON.parse(readFileSync(resolve(ROOT, 'content/founding-collection.json'), 'utf8'));
        const next = validateCatalog(prepareFoundingCollection(current.draft, blueprint), {...contentOptions, previous:current.draft});
        db.prepare('UPDATE collection_state SET draft=?,revision=revision+1,updated_at=? WHERE id=1').run(JSON.stringify(next), new Date().toISOString());
        return send(res, 200, collectionState());
      }
      if (req.method === 'POST' && path === '/api/admin/content') {
        requireSameOrigin(req);
        const input = await body(req, 1000000), current = expectedRevision(input);
        const next = validateCatalog(input.catalog, { ...contentOptions, previous: current.draft });
        db.prepare('UPDATE collection_state SET draft=?,revision=revision+1,updated_at=? WHERE id=1').run(JSON.stringify(next), new Date().toISOString());
        return send(res, 200, collectionState());
      }
      if (req.method === 'POST' && path === '/api/admin/publish') {
        requireSameOrigin(req);
        const current = expectedRevision(await body(req));
        const next = validateCatalog(current.draft, { ...contentOptions, publish: true });
        const now = new Date().toISOString(), json = JSON.stringify(next), revision = current.revision + 1;
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO collection_history VALUES (?,?,?)').run(revision, now, json);
          db.prepare('UPDATE collection_state SET draft=?,published=?,revision=?,live_revision=?,updated_at=?,published_at=? WHERE id=1').run(json,json,revision,revision,now,now);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        reloadCatalog();
        return send(res, 200, collectionState());
      }
      if (req.method === 'POST' && path === '/api/admin/restore') {
        requireSameOrigin(req);
        const input = await body(req), current = expectedRevision(input);
        const previous = db.prepare('SELECT catalog FROM collection_history WHERE revision=?').get(Number(input.version));
        if (!previous) throw new HttpError(404, 'That published version could not be found.');
        const restored = JSON.parse(previous.catalog);
        // Retain newer records as archived, preserving identifiers and their history.
        for (const key of ['artists','works','collections']) for (const item of current.draft[key] || []) {
          restored[key] ||= [];
          if (!restored[key].some(old => old.id === item.id)) restored[key].push({ ...item, archived: true });
        }
        restored.assets = { ...current.draft.assets, ...restored.assets };
        db.prepare('UPDATE collection_state SET draft=?,revision=revision+1,updated_at=? WHERE id=1').run(JSON.stringify(restored),new Date().toISOString());
        return send(res, 200, collectionState());
      }
      if (req.method === 'POST' && path === '/api/admin/media') {
        requireSameOrigin(req); rateLimit('uploads:' + clientHash(req), 40, 60000);
        const input=await body(req,75000000);
        return send(res,201,storeMedia(input,mediaDir));
      }
      if(req.method==='GET' && ['/media-manifest.json','/api/admin/media-manifest'].includes(path)){
        const source=path.startsWith('/api/admin/')?collectionState().draft:catalog;
        return send(res,200,{...JSON.parse(readFileSync(resolve(PUBLIC,'media-manifest.json'),'utf8')),...uploadedManifest(source.assets,mediaDir)});
      }
      if (['GET','HEAD'].includes(req.method) && /^\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(path)) {
        const published = Object.values(catalog.assets).includes(path) || Object.values(uploadedManifest(catalog.assets,mediaDir)).some(info=>info.variants?.includes(path));
        if (!published && !authenticated(req)) throw new HttpError(404, 'This image could not be found.');
        const filePath = resolve(mediaDir,path.slice(7));
        if (!existsSync(filePath)) throw new HttpError(404, 'This image could not be found.');
        res.writeHead(200, { 'Content-Type': {'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[extname(path)], 'Cache-Control': published ? 'public, max-age=31536000, immutable' : 'no-store' });
        return res.end(req.method === 'HEAD' ? '' : readFileSync(filePath));
      }
      if (req.method === 'POST' && path === '/api/events') {
        requireSameOrigin(req); rateLimit('events:' + clientHash(req), 300, 60000);
        const data = await body(req);
        const values = eventData(data);
        insertEvent.run(...values);
        return send(res, 202, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/inquiries') {
        requireSameOrigin(req);
        const input = await body(req);
        if (input.website) throw new HttpError(400, 'Please try again.');
        const data = inquiryData(input);
        const previous = db.prepare('SELECT id,fingerprint FROM inquiries WHERE submission_id=?').get(input.submissionId);
        if (previous) {
          if (previous.fingerprint !== data.fingerprint) throw new HttpError(409, 'This inquiry changed. Please reopen the form and try again.');
          return send(res, 200, { ok: true, reference: previous.id });
        }
        rateLimit('inquiries:' + clientHash(req), 5, 3600000);
        rateLimit('email:' + hash(data.email), 5, 3600000);
        const id = randomUUID(), now = new Date().toISOString();
        const sessionHash = UUID.test(input.sessionId) ? hash(input.sessionId) : null;
        db.exec('BEGIN');
        try {
          db.prepare('INSERT INTO inquiries (id,submission_id,fingerprint,created_at,name,email,interest,message,topic,work_id,artist_id,session_hash,source,medium,campaign,notification,notification_next_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.submissionId, data.fingerprint, now, data.name, data.email, data.interest, data.message, data.topic, data.workId, data.artistId, sessionHash, data.a.source, data.a.medium, data.a.campaign, emailConfigured ? 'pending' : 'inbox_only', now);
          if (sessionHash) insertEvent.run(randomUUID(), now, sessionHash, 'inquiry_submitted', PAGES.has(input.page) ? input.page : 'home', data.workId, data.artistId, data.a.source, data.a.medium, data.a.campaign, data.a.referrer);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        send(res, 201, { ok: true, reference: id });
        if (options.backgroundNotifications !== false) void flushNotifications();
        return;
      }
      if (req.method === 'GET' && path === '/api/admin/summary') {
        const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
        return send(res, 200, summary(Math.floor(days)));
      }
      if (req.method === 'GET' && path === '/api/admin/inquiries') {
        return send(res, 200, db.prepare('SELECT id,created_at,name,email,interest,message,topic,work_id,artist_id,source,medium,campaign,notification FROM inquiries ORDER BY created_at DESC LIMIT 500').all());
      }
      if (req.method === 'GET' && path === '/api/admin/export/inquiries.csv') {
        const rows = db.prepare('SELECT id,created_at,name,email,interest,message,topic,work_id,artist_id,source,medium,campaign,notification FROM inquiries ORDER BY created_at DESC').all();
        const keys = ['id','created_at','name','email','interest','message','topic','work_id','artist_id','source','medium','campaign','notification'];
        res.setHeader('Content-Disposition', 'attachment; filename="house-of-stone-inquiries.csv"');
        return send(res, 200, csv([keys, ...rows.map(row => keys.map(k => row[k]))]), 'text/csv; charset=utf-8');
      }
      if (req.method === 'GET' && path === '/api/admin/export/events.csv') {
        const rows = db.prepare('SELECT created_at,name,page,work_id,artist_id,source,medium,campaign,referrer FROM events ORDER BY created_at DESC').all();
        const keys = ['created_at','name','page','work_id','artist_id','source','medium','campaign','referrer'];
        res.setHeader('Content-Disposition', 'attachment; filename="house-of-stone-activity.csv"');
        return send(res, 200, csv([keys, ...rows.map(row => keys.map(k => row[k]))]), 'text/csv; charset=utf-8');
      }
      if (req.method === 'GET' && path === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: ${indexing ? '/admin\nDisallow: /api/' : '/'}\n${siteURL ? `Sitemap: ${siteURL.origin}/sitemap.xml\n` : ''}`, 'text/plain; charset=utf-8');
      if (req.method === 'GET' && path === '/sitemap.xml') {
        const paths = ['/', '/collection', '/artists', '/making', '/designers', '/collectors', '/house', ...(catalog.collections || []).map(c => '/collections/' + c.slug), ...catalog.artists.map(a => '/artists/' + a.slug), ...catalog.works.map(w => '/works/' + w.slug)];
        return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${esc(origin(req) + p)}</loc></url>`).join('')}</urlset>`, 'application/xml; charset=utf-8');
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); throw new HttpError(405, 'Method not allowed.'); }
      const preview = path === '/admin/preview' || path.startsWith('/admin/preview/');
      const pagePath = preview ? path.slice('/admin/preview'.length) || '/' : path;
      const meta = pageMeta(pagePath, preview ? publicCatalog(collectionState().draft, {preview:true}) : catalog);
      if (meta) {
        const replacements = { TITLE: meta.title, DESCRIPTION: meta.description, URL: origin(req) + path, IMAGE: origin(req) + meta.image, ROBOTS: indexing && !preview ? 'index,follow' : 'noindex,nofollow' };
        const html = template.replace(/\{\{(TITLE|DESCRIPTION|URL|IMAGE|ROBOTS)\}\}/g, (_, key) => esc(replacements[key]));
        res.setHeader('X-Robots-Tag', replacements.ROBOTS);
        return send(res, 200, req.method === 'HEAD' ? '' : html, 'text/html; charset=utf-8');
      }
      const filePath = resolve(PUBLIC, path === '/admin' ? 'admin.html' : path === '/admin/content' ? 'admin-content.html' : '.' + path);
      if (!filePath.startsWith(PUBLIC + '/') || !existsSync(filePath)) throw new HttpError(404, 'This page could not be found.');
      const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.png':'image/png', '.ico':'image/x-icon', '.glb':'model/gltf-binary', '.txt':'text/plain; charset=utf-8' };
      const type = types[extname(filePath)];
      if (!type) throw new HttpError(404, 'This file could not be found.');
      const headers = { 'Content-Type': type, 'Cache-Control': path.startsWith('/admin') ? 'no-store' : ['.js','.css','.html','.json','.glb'].includes(extname(filePath)) ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600' };
      const compressible=['.js','.css','.json','.glb'].includes(extname(filePath));
      const acceptsGzip=String(req.headers['accept-encoding'] || '').split(',').some(part=>{const [encoding,...parameters]=part.trim().split(';');return encoding==='gzip'&&!parameters.some(p=>/^q=0(?:\.0*)?$/.test(p.trim()));});
      let bytes;
      if(compressible)headers.Vary='Accept-Encoding';
      if(compressible&&acceptsGzip){
        const info=statSync(filePath),cached=compressedFiles.get(filePath);
        if(cached&&cached.mtime===info.mtimeMs&&cached.size===info.size)bytes=cached.bytes;
        else{bytes=gzipSync(readFileSync(filePath));compressedFiles.set(filePath,{mtime:info.mtimeMs,size:info.size,bytes});}
        headers['Content-Encoding']='gzip';headers['Content-Length']=bytes.length;
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? '' : bytes || readFileSync(filePath));
    } catch (error) {
      if(!res.headersSent && error.status===404 && ['GET','HEAD'].includes(req.method) && !req.url.startsWith('/api/') && !extname(req.url.split('?')[0]) && !req.url.startsWith('/media/')){
        const replacements={TITLE:'Page not found | House of Stone',DESCRIPTION:'Explore the House of Stone collections or contact us about a sculpture.',URL:origin(req)+req.url.split('?')[0],IMAGE:origin(req)+homepageImage(catalog),ROBOTS:'noindex,nofollow'};
        res.setHeader('X-Robots-Tag','noindex,nofollow');return send(res,404,req.method==='HEAD'?'':template.replace(/\{\{(TITLE|DESCRIPTION|URL|IMAGE|ROBOTS)\}\}/g,(_,key)=>esc(replacements[key])),'text/html; charset=utf-8');
      }
      if (!res.headersSent) send(res, error.status ?? 500, { error: error.status ? error.message : 'We could not complete that request. Please try again.' });
    }
  });
  const cleanup = () => {
    db.prepare('DELETE FROM rate_limits WHERE starts_at < ?').run(Date.now() - 86400000);
    db.prepare('DELETE FROM events WHERE created_at < ?').run(new Date(Date.now() - 365 * 86400000).toISOString());
  };
  cleanup();
  const timer = setInterval(() => { cleanup(); void flushNotifications(); }, 60000);
  timer.unref();
  if (options.backgroundNotifications !== false) void flushNotifications();
  server.on('close', () => { closing = true; clearInterval(timer); db.close(); });
  return { server, db, flushNotifications, get catalog() { return catalog; } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, db } = createApp();
  const port = Number(process.env.PORT) || 8000;
  server.listen(port, process.env.HOST || '127.0.0.1', async () => {
    console.log(`House of Stone running on port ${port}. Private inbox: /admin (username admin).`);
    if(process.env.NODE_ENV==='production' && new URL(process.env.SITE_URL).origin==='https://house-of-stone-production.up.railway.app') {
      try {
        const {publishOwnerRelease}=await import('./scripts/publish-owner-release.mjs');
        const result=await publishOwnerRelease({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested catalogue publication:',JSON.stringify(result));
        const {publishVerifiedMetadata}=await import('./scripts/publish-verified-metadata.mjs');
        const verified=await publishVerifiedMetadata({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested verified metadata:',JSON.stringify(verified));
      } catch(error) { console.error('Owner-requested publication did not complete:',error.message); }
      try {
        const {publishCollectionRoundOne}=await import('./scripts/publish-collection-round-one.mjs');
        const result=await publishCollectionRoundOne({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested collection corrections:',JSON.stringify(result));
      } catch(error) { console.error('Collection corrections did not complete:',error.message); }
      try {
        const {publishCollectionRoundTwo}=await import('./scripts/publish-collection-round-two.mjs');
        const result=await publishCollectionRoundTwo({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested collection additions and artist photography:',JSON.stringify(result));
      } catch(error) { console.error('Collection additions did not complete:',error.message); }
      try {
        const {publishOwnerMeasurements}=await import('./scripts/publish-owner-measurements.mjs');
        const result=await publishOwnerMeasurements({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested measurements and sculpture name:',JSON.stringify(result));
      } catch(error) { console.error('Owner measurements did not complete:',error.message); }
      try {
        const {publishOwnerRoundFour}=await import('./scripts/publish-owner-round-four.mjs');
        const result=await publishOwnerRoundFour({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested catalogue corrections:',JSON.stringify(result));
      } catch(error) { console.error('Owner catalogue corrections did not complete:',error.message); }
      try {
        const {publishOwnerRoundFive}=await import('./scripts/publish-owner-round-five.mjs');
        const result=await publishOwnerRoundFive({db,origin:'http://127.0.0.1:'+port,password:process.env.ADMIN_PASSWORD,publicOrigin:new URL(process.env.SITE_URL).origin});
        console.log('Owner-requested sculpture titles:',JSON.stringify(result));
      } catch(error) { console.error('Owner sculpture titles did not complete:',error.message); }
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}




