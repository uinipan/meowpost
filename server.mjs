import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4318);
const origin = `http://127.0.0.1:${port}`;
let binary = process.env.ZLIB_UI_BINARY;
if (!binary) {
  const candidates = [
    '/opt/homebrew/bin/zlib',
    '/usr/local/bin/zlib',
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(directory => path.join(directory, process.platform === 'win32' ? 'zlib.exe' : 'zlib')),
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); binary = candidate; break; } catch { /* Try the next installation path. */ }
  }
  binary ||= 'zlib';
}
const configDir = process.env.ZLIB_UI_CONFIG_DIR || path.join(os.homedir(), '.config/zlib');
const stateDir = process.env.ZLIB_UI_STATE_DIR || path.join(os.homedir(), '.local/share/zlib-ui');
const token = randomBytes(32).toString('hex');
const clean = s => String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const knownBooks = new Map();
const children = new Set();
const jobs = new Map();
const tempDirs = new Set();
const scratchDir = path.join(stateDir, 'temporary');
let queue = Promise.resolve();
let stateWrite = Promise.resolve();
let settingsWrite = Promise.resolve();
let qrLogin = null;
let qrChild = null;
let preferences = { theme: 'light', extensions: 'epub', cleanup: true };
await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
// The directory is exclusively owned by this app. Recover leftover temporary
// files after a crash before accepting new jobs.
let finishStartup;
const startup = new Promise(resolve => { finishStartup = resolve; });
try { preferences = { ...preferences, ...JSON.parse(await fs.readFile(path.join(stateDir, 'preferences.json'), 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') console.error('Could not read UI preferences'); }
try {
  const previous = JSON.parse(await fs.readFile(path.join(stateDir, 'jobs.json'), 'utf8'));
  for (const job of previous) {
    if (['queued', 'running'].includes(job.status)) {
      job.status = 'interrupted';
      job.error = '应用退出时任务尚未结束，请先检查微信读书书架，再决定是否重新操作。';
    }
    jobs.set(job.id, job);
  }
} catch (e) { if (e.code !== 'ENOENT') console.error('Could not read task history'); }

async function atomicJSON(file, value) {
  return atomicText(file, JSON.stringify(value, null, 2));
}
async function atomicText(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, value, { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
function saveJobs() {
  stateWrite = stateWrite.catch(() => {}).then(() => atomicJSON(path.join(stateDir, 'jobs.json'), [...jobs.values()].slice(-100)));
  return stateWrite;
}
function execute(args, { onProgress, timeout = 240000, environment = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: stateDir, env: { ...process.env, ...environment, NO_COLOR: '1', TERM: 'dumb' }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => {
      stderr += clean(b);
      onProgress?.(clean(b));
    });
    child.on('error', e => { clearTimeout(timer); children.delete(child); reject(new Error(e.code === 'ENOENT' ? '未找到 zlib，请检查安装路径。' : e.message)); });
    child.on('close', code => {
      clearTimeout(timer); children.delete(child);
      if (timedOut) return reject(new Error('请求超时。如果正在导入，请先查看微信读书书架再操作。'));
      if (code !== 0) return reject(new Error(clean(stderr || stdout).trim() || `zlib 已退出 (${code})`));
      resolve(clean(stdout).trim());
    });
  });
}
async function cliJSON(args, options) { return JSON.parse(await execute([...args, '--json'], options)); }
function remember(data) {
  if (Array.isArray(data)) data = { books: data };
  for (const book of data.books || data.items || []) knownBooks.set(book.id, { ...knownBooks.get(book.id), ...book });
  return data;
}
function bookID(value) {
  if (typeof value !== 'string' || !/^\d+:[a-zA-Z0-9]+$/.test(value)) throw new Error('无效的图书编号，请从搜索结果选择图书。');
  return value;
}
function integer(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`请输入 ${min} 至 ${max} 之间的整数。`);
  return n;
}
function detail(id) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['mcp', '--read-only'], { cwd: stateDir, stdio: ['pipe', 'pipe', 'ignore'] });
    children.add(child);
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); lines.close(); child.kill(); children.delete(child);
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('读取图书详情超时')), 45000);
    const send = obj => child.stdin.write(JSON.stringify(obj) + '\n');
    child.on('error', e => finish(e));
    child.on('close', () => { if (!settled) finish(new Error('图书详情服务已退出')); });
    lines.on('line', line => {
      try {
        const response = JSON.parse(line);
        if (response.error) return finish(new Error(response.error.message));
        if (response.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_book', arguments: { id } } });
        }
        if (response.id === 2) {
          const result = response.result;
          if (result.isError) return finish(new Error(result.content?.map(c => c.text || '').join('\n') || '读取详情失败'));
          finish(null, result.structuredContent || JSON.parse(result.content.find(c => c.type === 'text').text));
        }
      } catch (e) { finish(e); }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zlib-ui', version: '1.0.0' } } });
  });
}

async function runJob(job, localFile) {
  let dir;
  job.status = 'running'; job.stage = localFile ? '准备导入' : '下载图书';
  try {
    dir = localFile?.dir || await fs.mkdtemp(path.join(scratchDir, 'book-'));
    tempDirs.add(dir);
    await saveJobs();
    const progress = text => {
      const percent = [...text.matchAll(/(\d+)%/g)].at(-1);
      if (percent) job.progress = Number(percent[1]);
      if (text.includes('Preparing')) job.stage = '准备上传';
      if (text.includes('Uploading')) job.stage = '上传到微信读书';
      if (text.includes('Waiting for WeRead')) { job.stage = '等待微信读书入架确认'; job.progress = 100; }
    };
    const output = localFile || await cliJSON(['download', bookID(job.book.id), '--dir', dir], { onProgress: progress });
    const file = path.resolve(output.path);
    if (!file.startsWith(path.resolve(dir) + path.sep)) throw new Error('下载文件路径超出了临时目录。');
    job.progress = 0;
    if (job.action === 'weread') {
      job.stage = '准备上传';
      const result = await cliJSON(['weread', 'import', file], { onProgress: progress, timeout: 300000 });
      if (!result.book_id) throw new Error('微信读书尚未确认入架，请在手机端检查。');
      job.result = { book_id: result.book_id, already_existed: result.already_existed };
    } else if (job.action === 'kindle') {
      job.stage = '发送到 Kindle';
      await execute(['kindle', 'send', file], { onProgress: progress });
    } else if (job.action === 'download') {
      // Only an explicit save-to-computer action retains a file.
      const destination = path.join(os.homedir(), 'Downloads', path.basename(file));
      const extension = path.extname(destination);
      const stem = destination.slice(0, -extension.length);
      let target = destination;
      for (let suffix = 1; ; suffix++) {
        try { await fs.copyFile(file, target, 1); break; } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          target = `${stem} (${suffix})${extension}`;
        }
      }
      job.result = { path: target };
    }
    job.status = 'done'; job.progress = 100; job.stage = '已完成';
  } catch (e) {
    job.status = 'failed'; job.error = e.message; job.stage = '未完成';
  } finally {
    if (dir) {
      try { await fs.rm(dir, { recursive: true, force: true }); tempDirs.delete(dir); job.cleaned = true; }
      catch { job.cleaned = false; job.cleanupError = '临时文件清理失败，请重启应用后检查。'; }
    }
    job.finishedAt = new Date().toISOString();
    await saveJobs();
  }
}
function enqueue(book, action, localFile) {
  const duplicate = [...jobs.values()].find(j => j.book.id === book.id && j.action === action && ['queued', 'running'].includes(j.status));
  if (duplicate) return duplicate;
  const job = { id: randomUUID(), book, action, status: 'queued', stage: '等待处理', progress: 0, createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  queue = queue.catch(() => {}).then(() => runJob(job, localFile));
  return job;
}

function startQR(refresh = false) {
  if (qrLogin?.status === 'waiting' && !refresh) return qrLogin;
  if (refresh && qrChild) qrChild.kill('SIGTERM');
  const child = spawn(binary, ['weread', 'login'], { cwd: stateDir, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' }, stdio: ['ignore', 'pipe', 'pipe'] });
  qrChild = child;
  children.add(child);
  const login = { status: 'waiting', art: '', message: '正在生成二维码…' };
  qrLogin = login;
  let output = '';
  child.stdout.on('data', b => {
    output += clean(b);
    login.art = output.split('\n').filter(line => /^[ █▀▄]+$/.test(line)).join('\n');
    if (login.art) login.message = '用微信扫一扫，并在手机上确认登录';
  });
  child.stderr.on('data', b => { login.message = clean(b).includes('Scanned') ? '已扫码，请在微信中确认登录' : clean(b).trim(); });
  const timer = setTimeout(() => child.kill(), 330000);
  child.on('error', e => { login.status = 'failed'; login.message = e.message; });
  child.on('close', code => {
    clearTimeout(timer); children.delete(child); login.art = '';
    login.status = code === 0 ? 'done' : 'failed';
    login.message = code === 0 ? '微信读书登录成功' : login.message || '二维码已过期，请重新获取';
  });
  return login;
}

const envKeys = ['ZLIB_DOMAIN', 'ZLIB_PROXY', 'ZLIB_WEREAD_PROXY', 'ZLIB_DOWNLOAD_RETRIES', 'ZLIB_SEARCH_EXTENSIONS', 'ZLIB_SMTP_PWD'];
const kindleKeys = { KINDLE_TO: 'to', KINDLE_FROM: 'from', KINDLE_SMTP_HOST: 'smtp_host', KINDLE_SMTP_PORT: 'smtp_port', KINDLE_SMTP_SECURITY: 'smtp_security' };
async function settings() {
  const rows = await cliJSON(['config']);
  return { rows: rows.filter(r => r.key !== 'ZLIB_SMTP_PWD'), preferences };
}
async function writeSettings(data) {
  const values = data.values || {};
  for (const [key, value] of Object.entries(values)) {
    if (![...envKeys, ...Object.keys(kindleKeys)].includes(key)) throw new Error('未知的设置项');
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('设置值必须是单行文本');
    if (key.includes('PROXY') && value && value !== 'direct') {
      const url = new URL(value);
      if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol)) throw new Error('代理协议无效');
    }
    if (key === 'ZLIB_DOMAIN' && value) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.origin !== value) throw new Error('域名请使用 HTTPS 地址，不包含路径或结尾斜杠');
      const domains = await cliJSON(['doctor']);
      const mirrors = await cliJSON(['mirrors', 'list']);
      const current = await cliJSON(['config', 'network']);
      const allowed = [...domains.map(d => d.domain), ...current.filter(r => r.key === 'ZLIB_DOMAIN').map(r => r.value)];
      const mirrorText = JSON.stringify(mirrors);
      if (!allowed.includes(value) && !mirrorText.includes(JSON.stringify(value))) throw new Error('请先通过“信任镜像”添加此域名，再选择使用。');
    }
    if (key === 'ZLIB_DOWNLOAD_RETRIES' && value) integer(value, 0, 10);
    if (key === 'KINDLE_SMTP_PORT' && value) integer(value, 1, 65535);
    if (key === 'KINDLE_SMTP_SECURITY' && !['tls', 'starttls'].includes(value)) throw new Error('SMTP 安全方式无效');
  }
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  const writes = new Map();
  const envFile = path.join(configDir, '.env');
  let content = await fs.readFile(envFile, 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return ''; });
  for (const key of envKeys.filter(k => Object.hasOwn(values, k))) {
    if (values[key].includes('***')) continue;
    const escaped = values[key].replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
    content = content.split('\n').filter(line => !new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)).join('\n').trimEnd();
    content += `\n${key}="${escaped}"\n`;
  }
  if (envKeys.some(k => Object.hasOwn(values, k))) {
    writes.set(envFile, content);
  }
  const kindleFile = path.join(configDir, 'kindle.json');
  if (Object.keys(kindleKeys).some(k => Object.hasOwn(values, k))) {
    const kindle = JSON.parse(await fs.readFile(kindleFile, 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return '{}'; }));
    for (const [key, property] of Object.entries(kindleKeys)) if (Object.hasOwn(values, key)) kindle[property] = key === 'KINDLE_SMTP_PORT' ? Number(values[key]) : values[key];
    writes.set(kindleFile, JSON.stringify(kindle, null, 2));
  }
  const nextPreferences = { ...preferences, extensions: data.preferences?.extensions ?? preferences.extensions, theme: data.preferences?.theme === 'dark' ? 'dark' : 'light', cleanup: true };
  writes.set(path.join(stateDir, 'preferences.json'), JSON.stringify(nextPreferences, null, 2));
  const previous = new Map();
  for (const file of writes.keys()) previous.set(file, await fs.readFile(file).catch(e => { if (e.code !== 'ENOENT') throw e; return null; }));
  const changed = [];
  try {
    for (const [file, value] of writes) { await atomicText(file, value); changed.push(file); }
  } catch (error) {
    for (const file of changed.reverse()) {
      if (previous.get(file) === null) await fs.rm(file, { force: true });
      else await atomicText(file, previous.get(file));
    }
    throw error;
  }
  preferences = nextPreferences;
  return { saved: true };
}

async function body(req, max = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('文件超过大小限制'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function api(req, url) {
  const endpoint = url.pathname.slice(5);
  if (req.method === 'GET') {
    if (endpoint === 'bootstrap') return { token, preferences };
    if (endpoint === 'status') {
      const [profile, weread] = await Promise.allSettled([cliJSON(['profile']), cliJSON(['weread', 'whoami'])]);
      return { profile: profile.status === 'fulfilled' ? profile.value : null, profileError: profile.reason?.message, weread: weread.status === 'fulfilled' ? weread.value : null, wereadError: weread.reason?.message, version: await execute(['version']) };
    }
    if (endpoint === 'books') {
      const view = url.searchParams.get('view') || 'search';
      const page = integer(url.searchParams.get('page') || 1, 1, 9999);
      if (view === 'favorites' || view === 'history') return remember(await cliJSON([view, '--page', String(page)]));
      if (view === 'popular') return remember(await cliJSON(['most-popular']));
      if (view === 'recommended') return remember(await cliJSON(['recommended']));
      const query = (url.searchParams.get('query') || '').trim();
      if (!query || query.length > 500) throw new Error('请输入书名、作者或 ISBN');
      const args = ['search', query, '--page', String(page), '--count', '20'];
      for (const [param, flag] of [['format', '--ext'], ['language', '--language'], ['order', '--order']]) {
        const value = url.searchParams.get(param); if (value && value !== '__default') args.push(flag, value);
      }
      for (const [param, flag] of [['from', '--from-year'], ['to', '--to-year']]) {
        const value = url.searchParams.get(param); if (value) args.push(flag, String(integer(value, 1000, 9999)));
      }
      if (url.searchParams.get('exact') === 'true') args.push('--exact');
      return remember(await cliJSON(args, { environment: url.searchParams.get('format') === '' ? { ZLIB_SEARCH_EXTENSIONS: '' } : {} }));
    }
    if (endpoint === 'book') return detail(bookID(url.searchParams.get('id')));
    if (endpoint === 'jobs') return [...jobs.values()].reverse();
    if (endpoint === 'settings') return settings();
    if (endpoint === 'domains') return cliJSON(['doctor']);
    if (endpoint === 'mirrors') return cliJSON(['mirrors', 'list']);
    if (endpoint === 'qr') return qrLogin || { status: 'idle' };
  }
  if (req.method === 'POST') {
    if (req.headers['x-zlib-token'] !== token || (req.headers.origin && req.headers.origin !== origin)) throw new Error('页面会话失效，请刷新重试');
    if (endpoint === 'upload') {
      const name = path.basename(decodeURIComponent(req.headers['x-file-name'] || 'book.epub'));
      if (!/\.(epub|pdf|mobi|azw3|txt)$/i.test(name)) throw new Error('请选择 EPUB、PDF、MOBI、AZW3 或 TXT');
      const content = await body(req, /\.txt$/i.test(name) ? 20 * 1024 ** 2 : 300 * 1024 ** 2);
      const dir = await fs.mkdtemp(path.join(scratchDir, 'book-'));
      try {
        await fs.writeFile(path.join(dir, name), content, { mode: 0o600 });
        tempDirs.add(dir);
        return enqueue({ id: randomUUID(), name }, url.searchParams.get('target') === 'kindle' ? 'kindle' : 'weread', { dir, path: path.join(dir, name) });
      } catch (e) { await fs.rm(dir, { recursive: true, force: true }); throw e; }
    }
    const data = JSON.parse((await body(req)).toString() || '{}');
    if (endpoint === 'jobs') {
      const id = bookID(data.id);
      if (!['weread', 'kindle', 'download'].includes(data.action)) throw new Error('无效的操作');
      const book = knownBooks.get(id);
      if (!book) throw new Error('请先重新搜索并选择此图书');
      if (data.action === 'weread' && !['epub', 'pdf', 'mobi', 'azw3', 'txt'].includes(book.extension?.toLowerCase())) throw new Error('微信读书不支持此格式，请选择 EPUB 等支持的格式');
      return enqueue(book, data.action);
    }
    if (endpoint === 'settings') {
      settingsWrite = settingsWrite.catch(() => {}).then(() => writeSettings(data));
      return settingsWrite;
    }
    if (endpoint === 'qr') return startQR(data.refresh === true);
    if (endpoint === 'login') {
      if (!data.email || !data.password || !data.domain) throw new Error('请填写域名、邮箱和密码');
      await execute(['login', '--domain', String(data.domain), '--email', String(data.email), '--password', String(data.password)]);
      return { success: true };
    }
    if (endpoint === 'logout') { await execute(data.account === 'weread' ? ['weread', 'logout'] : ['logout']); return { success: true }; }
    if (endpoint === 'history-delete') { await execute(['history', '--delete', bookID(data.id)]); return { success: true }; }
    if (endpoint === 'mirror') {
      const action = data.action === 'remove' ? 'remove' : 'add';
      const args = ['mirrors', action, String(data.domain)];
      if (action === 'add') args.push('--yes');
      return { message: await execute(args) };
    }
  }
  throw new Error('接口不存在');
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  try {
    await startup;
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); return res.end('Local access only'); }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const result = await api(req, url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result)); return;
    }
    // Serve only application assets. No filesystem paths are exposed.
    const file = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/app-icon.png': 'app-icon.png' }[url.pathname];
    if (!file) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] });
    res.end(await fs.readFile(path.join(root, 'public', file)));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(port, '127.0.0.1', async () => {
  try {
    await fs.rm(scratchDir, { recursive: true, force: true });
    await fs.mkdir(scratchDir, { recursive: true, mode: 0o700 });
    finishStartup();
    console.log(`喵邮局 MeowPost 已启动 ${origin}`);
  } catch (e) { console.error(e.message); process.exit(1); }
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `端口 ${port} 已被占用` : e.message); process.exit(1); });
async function shutdown() {
  for (const child of children) child.kill('SIGTERM');
  await Promise.allSettled([...tempDirs].map(dir => fs.rm(dir, { recursive: true, force: true })));
  await saveJobs(); server.close(); process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
