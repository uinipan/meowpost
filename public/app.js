const $ = (selector, parent = document) => parent.querySelector(selector);
const main = $('#main');
const labels = { search: '搜索图书', popular: '热门图书', recommended: '为你推荐', favorites: '我的收藏', history: '下载历史', transfers: '传送任务', accounts: '账号与连接', settings: '偏好设置' };
const state = { view: 'search', query: '', page: 1, format: '__default', language: '', order: 'bestmatch', from: '', to: '', exact: false, list: false, books: [], totalPages: 1, status: null, jobs: [], preferences: {}, token: '', request: 0 };
let toastTimer;
let qrTimer;
let jobsPolling = false;
let previousActive = 0;
let statusPending = null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const author = book => (book.authors || []).join(' / ') || '作者信息待补充';
const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const actionName = action => ({ weread: '微信读书', kindle: 'Kindle', download: '保存到电脑' }[action]);
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
async function api(endpoint, data, options = {}) {
  const response = await fetch(`/api/${endpoint}`, {
    ...options,
    ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zlib-Token': state.token }, body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后重试');
  return result;
}
function heading(title, subtitle, action = '') {
  return `<span class="eyebrow">MEOWPOST</span><div class="page-heading"><div><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>${action}</div>`;
}
function loading() { return '<div class="loading"><span class="spinner"></span>正在寻找好书…</div>'; }
function errorHTML(error) { return `<div class="error">${escape(error)}<br><button class="button secondary small" data-action="retry">重新加载</button> <button class="button secondary small" data-view="accounts">检查账号连接</button></div>`; }
function quota() {
  const profile = state.status?.profile;
  return profile?.quota_known ? `<div class="quota">今日可下载 <b>${profile.daily_remaining}</b> / ${profile.daily_allowed} 本</div>` : '';
}
function banner() {
  return `<div class="import-banner"><div class="import-mark">⇄</div><div><h3>找到好书，直接送到微信读书</h3><p>导入成功后自动清理临时文件，轻装阅读。</p></div><button class="button secondary small" data-view="transfers">导入本地图书 <span>↗</span></button></div>`;
}
function filterControl(name, label, options, selected) {
  const current = options.find(([value]) => value === selected) || options[0];
  return `<div class="filter-control">
    <input type="hidden" name="${name}" value="${escape(current[0])}">
    <button type="button" class="filter-trigger" id="filter-${name}" data-filter-toggle="${name}" aria-label="${label}，${escape(current[1])}" aria-haspopup="listbox" aria-expanded="false" aria-controls="options-${name}">
      <span class="filter-caption">${label}</span><span class="filter-value">${escape(current[1])}</span><i aria-hidden="true"></i>
    </button>
    <div class="filter-options" id="options-${name}" role="listbox" aria-labelledby="filter-${name}" hidden>
      ${options.map(([value, text]) => `<button type="button" role="option" aria-selected="${value === current[0]}" tabindex="-1" data-filter-name="${name}" data-filter-value="${escape(value)}"><span>${escape(text)}</span><span class="option-check" aria-hidden="true">✓</span></button>`).join('')}
    </div>
  </div>`;
}
function closeFilterMenus() {
  document.querySelectorAll('.filter-trigger[aria-expanded="true"]').forEach(trigger => {
    trigger.setAttribute('aria-expanded', 'false');
    document.getElementById(trigger.getAttribute('aria-controls')).hidden = true;
  });
}
function searchPage() {
  return `${heading('下一本好书，从这里开始', '搜索书名、作者或 ISBN，把想读的书带到身边。', quota())}
  <form id="search-form"><div class="search-box"><span class="search-symbol">⌕</span><input id="search-query" name="query" autocomplete="off" aria-label="书名、作者或 ISBN" placeholder="你想读什么？" value="${escape(state.query)}"><button class="button" type="submit">搜索图书 <span>↗</span></button></div>
  <div class="filters">
    ${filterControl('format', '格式', [['__default', '默认格式'], ['', '全部格式'], ...['epub', 'pdf', 'mobi', 'azw3', 'txt', 'fb2'].map(value => [value, value.toUpperCase()])], state.format)}
    ${filterControl('language', '语言', [['', '全部语言'], ['chinese', '中文'], ['english', '英文']], state.language)}
    ${filterControl('order', '排序', [['bestmatch', '最相关'], ['popular', '最受欢迎'], ['year', '出版年份'], ['date', '最新上传'], ['filesizeA', '文件从小到大'], ['filesize', '文件从大到小'], ['titleA', '书名 A–Z']], state.order)}
    <button class="more" id="more-filters" type="button" aria-expanded="false" aria-controls="advanced-filters">更多筛选 <i aria-hidden="true"></i></button>
    <div class="advanced" id="advanced-filters" hidden>
      <span class="advanced-label">出版年份</span><input type="number" name="from" aria-label="起始年份" placeholder="起始年份" min="1000" max="9999" value="${escape(state.from)}"><span>—</span><input type="number" name="to" aria-label="结束年份" placeholder="结束年份" min="1000" max="9999" value="${escape(state.to)}"><label><input type="checkbox" name="exact" ${state.exact ? 'checked' : ''}> 精确匹配</label>
    </div>
  </div></form>
  <div class="search-suggestions"><span>试试搜索</span>${['油炸绿番茄', '史铁生', '女性文学'].map(query => `<button class="suggestion" data-query="${query}">${query}</button>`).join('')}</div>${banner()}<div id="results">${loading()}</div>`;
}
function cover(book, detail = false) {
  const src = typeof book.cover === 'string' && book.cover.startsWith('https://') ? book.cover : '';
  if (src) return `<img ${detail ? '' : 'class="book-cover"'} src="${escape(src)}" alt="${escape(book.name)}封面" loading="lazy" referrerpolicy="no-referrer"><div class="cover-fallback" hidden><span>${escape(book.name)}</span><small>${escape(author(book))}</small></div>`;
  return `<div class="cover-fallback"><span>${escape(book.name)}</span><small>${escape(author(book))}</small></div>`;
}
function bindCovers(parent) {
  parent.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => { img.hidden = true; if (img.nextElementSibling) img.nextElementSibling.hidden = false; }, { once: true });
    if (img.complete && img.naturalWidth === 0) img.dispatchEvent(new Event('error'));
  });
}
function bookScores(book) {
  const fields = [['rating', '兴趣评分'], ['quality', '文件质量']];
  return `<div class="book-scores">${fields.map(([key, label]) => {
    const raw = book[key];
    const value = Number(raw);
    const available = raw !== null && raw !== undefined && String(raw).trim() !== '' && Number.isFinite(value) && value >= 0;
    const score = available ? value.toFixed(1) : '暂无评分';
    return `<span class="book-score${available ? '' : ' unavailable'}"><span>${label}</span><strong>${score}</strong></span>`;
  }).join('')}</div>`;
}
function renderBooks(data) {
  state.books = data.books || data.items || [];
  state.totalPages = Math.max(1, data.total_pages || 1);
  const title = state.view === 'search' ? state.query ? `“${state.query}”的搜索结果` : '热门图书' : labels[state.view];
  const node = $('#results');
  if (!node) return;
  node.innerHTML = `<div class="section-bar"><h2>${escape(title)}<span class="section-meta">本页 ${state.books.length} 本${state.totalPages > 1 ? ` · 第 ${state.page} / ${state.totalPages} 页` : ''}</span></h2><div class="section-actions"><button class="mini-button ${!state.list ? 'active' : ''}" data-layout="grid" aria-label="网格视图">▦</button><button class="mini-button ${state.list ? 'active' : ''}" data-layout="list" aria-label="列表视图">☷</button></div></div>
  ${state.books.length ? `<div class="book-grid ${state.list ? 'list' : ''}">${state.books.map((book, i) => `<article class="book-card"><button class="cover-button" data-book="${escape(book.id)}" aria-label="查看${escape(book.name)}详情"><span class="format-tag">${escape((book.extension || 'BOOK').toUpperCase())}</span>${cover(book)}</button><div class="book-info"><button class="book-title" data-book="${escape(book.id)}" title="${escape(book.name)}">${escape(book.name)}</button><p class="book-author" title="${escape(author(book))}">${escape(author(book))}</p><p class="book-meta">${escape([book.publisher, book.year || book.date].filter(Boolean).join(' · ') || '出版信息待补充')}</p>${bookScores(book)}<div class="book-card-bottom"><span class="book-size">${escape(book.size || '查看详情')}</span><button class="send-button" data-send="${escape(book.id)}">导入微信读书 <span>↗</span></button></div></div></article>`).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">⌕</div><h3>这里还没有图书</h3><p>试试更简短的书名、作者，或调整格式和语言筛选。</p></div>'}
  ${state.totalPages > 1 ? `<div class="pagination"><button class="button secondary small" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>← 上一页</button><span>${state.page} / ${state.totalPages}</span><button class="button secondary small" data-page="${state.page + 1}" ${state.page >= state.totalPages ? 'disabled' : ''}>下一页 →</button></div>` : ''}
  ${state.view === 'favorites' ? '<p class="notice">这里显示你在 Z-Library 账号中收藏的图书。</p>' : ''}`;
  // Warm paper backgrounds coordinate with the reading-room icon.
  const colors = ['#eee5da', '#e5dfd8', '#f1e5d4', '#eaded1', '#e6e0dc'];
  if (document.documentElement.dataset.theme !== 'dark') node.querySelectorAll('.cover-button').forEach((el, i) => el.style.setProperty('--cover-bg', colors[i % colors.length]));
  bindCovers(node);
}
async function loadBooks() {
  const request = ++state.request;
  const node = $('#results'); if (!node) return;
  node.innerHTML = loading();
  const params = new URLSearchParams({ view: state.view === 'search' && !state.query ? 'popular' : state.view, query: state.query, page: state.page, format: state.format, language: state.language, order: state.order, from: state.from, to: state.to, exact: state.exact });
  try { const data = await api(`books?${params}`); if (request === state.request) renderBooks(data); }
  catch (e) { if (request === state.request && $('#results')) $('#results').innerHTML = errorHTML(e.message); }
}
function refreshStatus() {
  if (statusPending) return statusPending;
  statusPending = fetchStatus().finally(() => { statusPending = null; });
  return statusPending;
}
async function fetchStatus() {
  try {
    state.status = await api('status');
    const profile = state.status.profile;
    $('#sidebar-name').innerHTML = `${escape(profile?.name || '我的阅读账号')}<small>${profile ? `今日剩余 ${profile.daily_remaining} 次下载` : '点击登录 Z-Library'}</small>`;
    $('#avatar').textContent = profile?.name?.slice(0, 1) || '读';
    $('#sidebar-weread').textContent = state.status.weread ? `${state.status.weread.name || '已登录'} · 已连接` : '尚未连接';
    $('#connection-dot').classList.toggle('ok', !!state.status.weread);
  } catch (e) { $('#sidebar-weread').textContent = '连接检查失败'; }
}
function renderTaskRows() {
  if (!state.jobs.length) return '<div class="empty-state"><div class="empty-icon">⇄</div><h3>还没有传送任务</h3><p>找到想读的图书，点击“导入微信读书”即可开始。</p><button class="button secondary" data-view="search">去找一本好书</button></div>';
  return state.jobs.map(job => `<div class="task-row"><span class="task-icon">${job.status === 'done' ? '✓' : job.status === 'failed' || job.status === 'interrupted' ? '!' : '⇄'}</span><div class="task-content"><h3>${escape(job.book.name)}</h3><p>${escape(actionName(job.action))}${job.status === 'done' && job.cleaned && job.action !== 'download' ? ' · 临时文件已清理' : ''}${job.result?.already_existed ? ' · 书架中已有此书' : ''}</p><div class="task-status ${['failed', 'interrupted'].includes(job.status) ? 'failed' : ''}">${escape(job.error || job.stage)}${job.status === 'running' && job.progress ? ` · ${job.progress}%` : ''}</div>${job.cleanupError ? `<p>${escape(job.cleanupError)}</p>` : ''}${job.result?.path ? `<p>${escape(job.result.path)}</p>` : ''}${['running', 'queued'].includes(job.status) ? `<div class="progress"><span data-progress="${job.progress}"></span></div>` : ''}</div><time class="task-time">${date(job.createdAt)}</time></div>`).join('');
}
function transfersPage() {
  return `${heading('把好书，送到你的书架', '查看下载、上传与入架进度，也可以导入已有的本地图书。')}<section class="panel"><div class="panel-heading"><h2>导入本地图书</h2><span class="status-pill">自动清理临时文件</span></div><p class="panel-note">选择电脑上的电子书，发送至微信读书或 Kindle。你选择的源文件由你保管。</p><div class="upload-zone"><span class="import-mark">⇄</span><p id="upload-label">选择一本想读的电子书</p><input id="upload-file" type="file" accept=".epub,.pdf,.mobi,.azw3,.txt" hidden><button class="button" data-action="select-upload">选择文件，导入微信读书 ↗</button> <button class="button secondary" data-action="upload-kindle">发送本地文件到 Kindle</button><small>支持 EPUB、PDF、MOBI、AZW3、TXT · TXT ≤ 20 MB，其他格式 ≤ 300 MB</small></div></section><section class="panel"><div class="panel-heading"><h2>任务记录</h2><button class="button secondary small" data-action="refresh-jobs">刷新</button></div><div id="task-list">${renderTaskRows()}</div></section>`;
}
async function pollJobs() {
  if (jobsPolling) return;
  jobsPolling = true;
  try {
    state.jobs = await api('jobs');
    const active = state.jobs.filter(j => ['queued', 'running'].includes(j.status)).length;
    $('#task-count').hidden = !active; $('#task-count').textContent = active;
    if ($('#task-list')) {
      $('#task-list').innerHTML = renderTaskRows();
      $('#task-list').querySelectorAll('[data-progress]').forEach(el => el.style.width = `${Number(el.dataset.progress) || 0}%`);
    }
    if (previousActive > 0 && active === 0) {
      const latest = state.jobs[0];
      toast(latest.status === 'done' ? `${latest.book.name} · 传送完成` : '任务结束，请在任务记录中查看结果');
      refreshStatus();
    }
    previousActive = active;
  } catch { /* A stopped local service is reported on the next explicit action. */ }
  finally { jobsPolling = false; }
}
function accountPage() {
  const status = state.status || {};
  const profile = status.profile;
  const weread = status.weread;
  return `${heading('让阅读账号，保持连接', '复用本机 zlib 登录，账号信息保存在这台 Mac。', '<button class="button secondary small" data-action="refresh-accounts">刷新状态</button>')}
  <div class="account-columns"><section class="panel"><div class="panel-heading"><h2>Z-Library</h2><span class="status-pill">${profile ? '已登录' : '待登录'}</span></div>${profile ? `<div class="account-name">${escape(profile.name || '我的账号')}</div><div class="account-meta">${escape(profile.email)}</div><div class="stat-strip"><div><strong>${profile.daily_remaining}</strong><small>今日剩余下载</small></div><div><strong>${profile.daily_allowed}</strong><small>每日额度</small></div><div><strong>${profile.premium ? '高级' : '标准'}</strong><small>账号类型</small></div></div><div class="account-footer"><button class="button secondary small" data-logout="zlib">退出此账号</button></div>` : `<p class="notice">${escape(status.profileError || '登录后即可搜索并下载图书。')}</p><form id="login-form" class="settings-grid"><label class="field full">可用域名<input name="domain" type="url" placeholder="https://zlib.bz" required></label><label class="field full">邮箱<input name="email" type="email" autocomplete="username" required></label><label class="field full">密码<input name="password" type="password" autocomplete="current-password" required></label><button class="button" type="submit">登录 Z-Library</button></form>`}</section>
  <section class="panel"><div class="panel-heading"><h2>微信读书</h2><span class="status-pill">${weread ? '已连接' : '待连接'}</span></div><div class="account-name">${escape(weread?.name || '连接你的书架')}</div><div class="account-meta">${weread ? `微信读书 ID ${escape(weread.vid)}` : '用微信扫一扫，确认后自动保存登录'}</div><p class="notice">搜索到的图书可以直接发送到你的微信读书书架，入架确认后自动清理临时文件。</p><div class="account-footer"><button class="button small" data-action="qr-login">${weread ? '重新扫码登录' : '扫码连接微信读书'}</button>${weread ? '<button class="button secondary small" data-logout="weread">退出</button>' : ''}</div></section></div>
  <section class="panel"><div class="panel-heading"><h2>网络连接检查</h2><button class="button secondary small" data-action="check-domains">检测可用域名</button></div><p class="panel-note">检查当前网络能访问的 Z-Library 域名，点击检测结果可填入登录或设置。</p><div id="domain-results"></div><p class="notice">${escape(status.version || '')}</p></section>`;
}
const settingFields = [
  ['网络与搜索', [['ZLIB_DOMAIN', 'Z-Library 域名', 'https://zlib.bz'], ['ZLIB_PROXY', 'Z-Library 代理', '留空使用系统代理'], ['ZLIB_WEREAD_PROXY', '微信读书代理', '留空使用系统代理，direct 为直连'], ['ZLIB_DOWNLOAD_RETRIES', '下载重试次数', '3'], ['ZLIB_SEARCH_EXTENSIONS', '默认搜索格式', 'epub,pdf']]],
  ['Kindle 投递', [['KINDLE_TO', 'Kindle 收件地址', 'name@kindle.com'], ['KINDLE_FROM', '发件邮箱', 'your@email.com'], ['KINDLE_SMTP_HOST', 'SMTP 服务器', 'smtp.gmail.com'], ['KINDLE_SMTP_PORT', 'SMTP 端口', '587'], ['KINDLE_SMTP_SECURITY', 'SMTP 安全方式', 'starttls'], ['ZLIB_SMTP_PWD', 'SMTP 授权码', '留空保留已有授权码']]],
];
async function settingsPage(request) {
  main.innerHTML = `${heading('按你的习惯，安排阅读', '管理网络、搜索、Kindle 投递与界面主题。')}<div class="loading"><span class="spinner"></span>读取设置…</div>`;
  try {
    const data = await api('settings'); if (state.request !== request) return;
    const values = Object.fromEntries(data.rows.map(row => [row.key, row.saved || (row.source === 'Default' ? '' : row.value)]));
    main.innerHTML = `${heading('按你的习惯，安排阅读', '设置与 zlib 命令行共享，保存后对后续任务生效。')}<form id="settings-form">${settingFields.map(([title, fields]) => `<section class="panel"><div class="panel-heading"><h2>${title}</h2></div><div class="settings-grid">${fields.map(([key, label, placeholder]) => `<label class="field">${label}${key === 'KINDLE_SMTP_SECURITY' ? `<select name="${key}"><option value="starttls" ${values[key] !== 'tls' ? 'selected' : ''}>STARTTLS</option><option value="tls" ${values[key] === 'tls' ? 'selected' : ''}>TLS</option></select>` : `<input name="${key}" ${key === 'ZLIB_SMTP_PWD' ? 'type="password" autocomplete="new-password"' : ''} placeholder="${placeholder}" value="${escape(values[key] || '')}">`}</label>`).join('')}</div>${title.includes('Kindle') ? '<p class="panel-note">请在亚马逊账号中将发件邮箱加入 Kindle 认可的个人文档邮箱列表。</p>' : '<p class="panel-note">下载与传送使用临时目录，任务结束后自动清理。</p>'}</section>`).join('')}<section class="panel"><div class="panel-heading"><h2>界面偏好</h2></div><div class="settings-grid"><label class="field">外观主题<select name="ui-theme"><option value="light" ${state.preferences.theme !== 'dark' ? 'selected' : ''}>晨光 · 浅色</option><option value="dark" ${state.preferences.theme === 'dark' ? 'selected' : ''}>夜读 · 深色</option></select></label><div class="field">文件处理<p class="panel-note">微信读书与 Kindle 传送任务结束后自动清理临时副本。手动点击“保存到电脑”时保留你选择下载的文件。</p></div></div><div class="form-actions"><button class="button" type="submit">保存设置</button><span id="settings-result" class="notice"></span></div></section></form><section class="panel"><div class="panel-heading"><h2>信任镜像</h2></div><p class="panel-note">添加你认可的 Z-Library 镜像域名，此后可将其设为登录域名。</p><form id="mirror-form" class="mirror-row"><input name="domain" type="url" required placeholder="https://你的镜像域名" aria-label="镜像域名"><button class="button secondary small">添加并信任</button></form><div id="mirror-list"></div></section>`;
    loadMirrors();
  } catch (e) { if (state.request === request) main.innerHTML += errorHTML(e.message); }
}
async function loadMirrors() {
  try {
    const result = await api('mirrors');
    const mirrors = Array.isArray(result) ? result : result.mirrors || result.domains || [];
    if ($('#mirror-list')) $('#mirror-list').innerHTML = mirrors.map(m => { const domain = typeof m === 'string' ? m : m.domain; return `<div class="mirror-row"><span>${escape(domain)}</span><button class="button secondary small remove-mirror" data-remove-mirror="${escape(domain)}">移除</button></div>`; }).join('');
  } catch (e) { toast(e.message); }
}
function plainDescription(html) {
  return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.trim();
}
async function openBook(id) {
  const book = state.books.find(b => b.id === id);
  if (!book) return;
  const dialog = $('#book-dialog');
  $('#book-detail').innerHTML = '<div class="loading"><span class="spinner"></span>读取图书详情…</div>';
  dialog.showModal();
  let detail = book;
  let detailError = '';
  try { detail = { ...book, ...await api(`book?id=${encodeURIComponent(id)}`) }; }
  catch (e) { detailError = e.message; }
  if (!dialog.open) return;
  $('#book-detail').innerHTML = `<div class="detail-top"><div class="detail-cover">${cover(book, true)}</div><div class="detail-heading"><span class="eyebrow">BOOK DETAILS</span><h2 id="detail-title">${escape(detail.name)}</h2><p>${escape(author(detail))}</p><p>${escape([detail.publisher, detail.year].filter(Boolean).join(' · '))}</p><div class="detail-tags">${[detail.extension?.toUpperCase(), detail.language, detail.size].filter(Boolean).map(v => `<span>${escape(v)}</span>`).join('')}</div>${detail.isbn ? `<p>ISBN ${escape(detail.isbn)}</p>` : ''}${bookScores(detail)}</div></div><div class="synopsis">${escape(plainDescription(detail.description) || '暂无内容简介')}${detailError ? `\n\n详细信息读取失败 · ${escape(detailError)}` : ''}</div><div class="detail-actions"><button class="button" data-send="${escape(id)}">导入微信读书 ↗</button><button class="button secondary" data-kindle="${escape(id)}">发送到 Kindle</button><button class="button secondary" data-download="${escape(id)}">保存到电脑</button>${state.view === 'history' ? `<button class="button danger" data-delete-history="${escape(id)}">删除历史记录</button>` : ''}</div><p class="notice">导入微信读书时使用临时文件，入架确认后自动清理。</p>`;
  bindCovers($('#book-detail'));
}
async function sendBook(id, action = 'weread') {
  const book = state.books.find(b => b.id === id);
  if (action === 'download' && !confirm(`将《${book?.name || '此书'}》保存到电脑的“下载”文件夹？此操作会保留本地副本。`)) return;
  if (action === 'kindle' && !confirm(`将《${book?.name || '此书'}》发送至设置中的 Kindle 邮箱？`)) return;
  try {
    const job = await api('jobs', { id, action });
    if ($('#book-dialog').open) $('#book-dialog').close();
    toast(job.status === 'queued' ? '已加入传送队列' : '这本书正在传送中');
    await navigate('transfers');
  } catch (e) { toast(e.message); }
}
function drawQR(art) {
  if (!art) return;
  const lines = art.split('\n');
  const width = Math.max(...lines.map(line => [...line].length));
  const canvas = $('#qr-canvas');
  const scale = Math.max(4, Math.floor(360 / width));
  canvas.width = width * scale; canvas.height = lines.length * 2 * scale;
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000';
  lines.forEach((line, y) => [...line].forEach((char, x) => {
    if (char === '█' || char === '▀') context.fillRect(x * scale, y * 2 * scale, scale, scale);
    if (char === '█' || char === '▄') context.fillRect(x * scale, (y * 2 + 1) * scale, scale, scale);
  }));
}
async function startQR() {
  const dialog = $('#qr-dialog');
  if (!dialog.open) dialog.showModal();
  $('#qr-status').textContent = '正在生成二维码…';
  try {
    await api('qr', { refresh: true });
    clearTimeout(qrTimer);
    const poll = async () => {
      if (!dialog.open) return;
      try {
        const login = await api('qr');
        $('#qr-status').textContent = login.message || '正在等待扫码';
        drawQR(login.art);
        if (login.status === 'done') { await refreshStatus(); toast('微信读书已连接'); dialog.close(); if (state.view === 'accounts') navigate('accounts'); return; }
        if (login.status === 'failed') return;
        qrTimer = setTimeout(poll, 1200);
      } catch (e) { $('#qr-status').textContent = e.message; }
    };
    poll();
  } catch (e) { $('#qr-status').textContent = e.message; }
}
async function navigate(view, { preservePage = false } = {}) {
  if (!labels[view]) view = 'search';
  state.view = view; if (!preservePage) state.page = 1;
  const request = ++state.request;
  document.querySelectorAll('[data-view].nav-item').forEach(el => { el.classList.toggle('active', el.dataset.view === view); el.setAttribute('aria-current', el.dataset.view === view ? 'page' : 'false'); });
  $('#breadcrumb').textContent = `我的图书馆 / ${labels[view]}`;
  history.replaceState(null, '', `#${view}`);
  if (view === 'search') { main.innerHTML = searchPage(); await loadBooks(); }
  else if (['popular', 'recommended', 'favorites', 'history'].includes(view)) {
    const subtitles = { popular: '看看大家都在读什么，发现下一本心头好。', recommended: '来自 Z-Library 的个性化阅读推荐。', favorites: '那些被你留在收藏里的好书。', history: '回看下载过的图书，随时再次传送到书架。' };
    main.innerHTML = `${heading(labels[view], subtitles[view], quota())}<div id="results">${loading()}</div>`; await loadBooks();
  } else if (view === 'transfers') { main.innerHTML = transfersPage(); await pollJobs(); }
  else if (view === 'accounts') { if (!state.status) { main.innerHTML = heading('账号与连接', '正在检查本机登录状态…') + '<div class="loading"><span class="spinner"></span>检查账号连接…</div>'; await refreshStatus(); } if (state.view === view) main.innerHTML = accountPage(); }
  else if (view === 'settings') await settingsPage(request);
}

document.addEventListener('click', async event => {
  if (!event.target.closest('.filter-control')) closeFilterMenus();
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.filterToggle) {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    closeFilterMenus();
    if (!expanded) {
      button.setAttribute('aria-expanded', 'true');
      const menu = document.getElementById(button.getAttribute('aria-controls'));
      menu.hidden = false;
      menu.querySelector('[aria-selected="true"]').focus();
    }
    return;
  }
  if (button.dataset.filterName) {
    const control = button.closest('.filter-control');
    const trigger = control.querySelector('.filter-trigger');
    control.querySelector('input').value = button.dataset.filterValue;
    control.querySelector('.filter-value').textContent = button.querySelector('span').textContent;
    trigger.setAttribute('aria-label', `${control.querySelector('.filter-caption').textContent}，${button.querySelector('span').textContent}`);
    control.querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', String(option === button)));
    closeFilterMenus();
    trigger.focus();
    return;
  }
  if (button.dataset.view) return navigate(button.dataset.view);
  if (button.dataset.query) { state.query = button.dataset.query; return navigate('search'); }
  if (button.dataset.book) return openBook(button.dataset.book);
  if (button.dataset.send) return sendBook(button.dataset.send);
  if (button.dataset.kindle) return sendBook(button.dataset.kindle, 'kindle');
  if (button.dataset.download) return sendBook(button.dataset.download, 'download');
  if (button.dataset.page) { state.page = Number(button.dataset.page); await navigate(state.view, { preservePage: true }); window.scrollTo({ top: 0 }); return; }
  if (button.dataset.layout) { state.list = button.dataset.layout === 'list'; renderBooks({ books: state.books, total_pages: state.totalPages }); return; }
  if (button.classList.contains('dialog-close')) return button.closest('dialog').close();
  if (button.id === 'more-filters') { const hidden = !$('#advanced-filters').hidden; $('#advanced-filters').hidden = hidden; button.setAttribute('aria-expanded', String(!hidden)); return; }
  if (button.id === 'theme-toggle') {
    const theme = state.preferences.theme === 'dark' ? 'light' : 'dark';
    try { await api('settings', { preferences: { ...state.preferences, theme } }); state.preferences.theme = theme; document.documentElement.dataset.theme = theme; await navigate(state.view, { preservePage: true }); } catch (e) { toast(e.message); }
    return;
  }
  if (button.id === 'qr-refresh') return startQR();
  if (button.dataset.logout) {
    if (!confirm('退出此账号？后续传送需要重新登录。')) return;
    try { await api('logout', { account: button.dataset.logout }); await refreshStatus(); navigate('accounts'); } catch (e) { toast(e.message); }
    return;
  }
  if (button.dataset.deleteHistory) {
    if (!confirm('从 Z-Library 下载历史中移除此条记录？')) return;
    try { await api('history-delete', { id: button.dataset.deleteHistory }); $('#book-dialog').close(); await loadBooks(); } catch (e) { toast(e.message); }
    return;
  }
  if (button.dataset.removeMirror) {
    if (!confirm(`停止信任镜像 ${button.dataset.removeMirror}？`)) return;
    try { await api('mirror', { action: 'remove', domain: button.dataset.removeMirror }); await loadMirrors(); } catch (e) { toast(e.message); }
    return;
  }
  if (button.dataset.domain) { const input = $('input[name=domain]') || $('input[name=ZLIB_DOMAIN]'); if (input) input.value = button.dataset.domain; toast('已填入域名'); return; }
  const action = button.dataset.action;
  if (action === 'retry') return navigate(state.view, { preservePage: true });
  if (action === 'refresh-jobs') return pollJobs();
  if (action === 'refresh-accounts') { button.disabled = true; await refreshStatus(); return navigate('accounts'); }
  if (action === 'qr-login') return startQR();
  if (action === 'select-upload' || action === 'upload-kindle') { $('#upload-file').dataset.target = action === 'upload-kindle' ? 'kindle' : 'weread'; $('#upload-file').click(); return; }
  if (action === 'check-domains') {
    button.disabled = true; $('#domain-results').innerHTML = '<p class="notice"><span class="spinner"></span>正在检查可用域名…</p>';
    try { const domains = await api('domains'); if ($('#domain-results')) $('#domain-results').innerHTML = `<div class="domains">${domains.length ? domains.map(d => `<button class="domain-chip" data-domain="${escape(d.domain)}">● ${escape(d.domain)}</button>`).join('') : '<p class="notice">当前网络下未找到可用域名，请检查代理设置。</p>'}</div>`; }
    catch (e) { if ($('#domain-results')) $('#domain-results').innerHTML = errorHTML(e.message); }
    finally { button.disabled = false; }
  }
});
document.addEventListener('submit', async event => {
  const form = event.target; event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  if (form.id === 'search-form') {
    state.query = String(values.query).trim();
    if (!state.query) { toast('请输入书名、作者或 ISBN'); return; }
    for (const key of ['format', 'language', 'order', 'from', 'to']) state[key] = values[key];
    state.exact = values.exact === 'on'; state.page = 1;
    return loadBooks();
  }
  const submit = $('button[type=submit]', form) || $('button', form);
  submit.disabled = true;
  try {
    if (form.id === 'login-form') {
      await api('login', values); form.elements.password.value = ''; await refreshStatus(); navigate('accounts'); toast('Z-Library 登录成功');
    }
    if (form.id === 'settings-form') {
      const theme = values['ui-theme']; delete values['ui-theme'];
      if (!values.ZLIB_SMTP_PWD) delete values.ZLIB_SMTP_PWD;
      // Send only changed settings so masked proxy credentials stay intact.
      const original = await api('settings');
      for (const row of original.rows) {
        const before = row.saved || (row.source === 'Default' ? '' : row.value);
        if (values[row.key] === before) delete values[row.key];
      }
      await api('settings', { values, preferences: { ...state.preferences, theme } });
      state.preferences.theme = theme; document.documentElement.dataset.theme = theme;
      form.elements.ZLIB_SMTP_PWD.value = ''; toast('设置已保存');
    }
    if (form.id === 'mirror-form') {
      if (!confirm(`信任 ${values.domain}？该域名将可用于你的 Z-Library 登录。`)) return;
      await api('mirror', { action: 'add', domain: values.domain }); form.reset(); await loadMirrors(); toast('镜像已添加');
    }
  } catch (e) { toast(e.message); }
  finally { submit.disabled = false; }
});
document.addEventListener('change', async event => {
  if (event.target.id !== 'upload-file') return;
  const file = event.target.files[0]; if (!file) return;
  const target = event.target.dataset.target || 'weread';
  if (target === 'kindle' && !confirm(`将 ${file.name} 发送至设置中的 Kindle 邮箱？`)) return;
  const max = /\.txt$/i.test(file.name) ? 20 * 1024 ** 2 : 300 * 1024 ** 2;
  if (file.size > max) { toast('文件超过格式对应的大小限制'); return; }
  $('#upload-label').textContent = '正在传入本机服务…';
  try {
    await api(`upload?target=${target}`, undefined, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Zlib-Token': state.token, 'X-File-Name': encodeURIComponent(file.name) }, body: file });
    toast('文件已加入传送队列'); await pollJobs();
  } catch (e) { toast(e.message); }
  finally { if ($('#upload-label')) $('#upload-label').textContent = '选择一本想读的电子书'; event.target.value = ''; }
});
document.addEventListener('keydown', event => {
  const filter = event.target.closest('.filter-control');
  if (filter) {
    const trigger = filter.querySelector('.filter-trigger');
    const menu = filter.querySelector('.filter-options');
    const options = [...menu.querySelectorAll('[role="option"]')];
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasClosed = menu.hidden;
      closeFilterMenus();
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      let index = options.indexOf(document.activeElement);
      if (wasClosed) index = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
      else if (event.key === 'ArrowDown') index = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') index = (index - 1 + options.length) % options.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = options.length - 1;
      options[Math.max(0, index)].focus();
    }
    if (event.key === 'Escape') { event.preventDefault(); closeFilterMenus(); trigger.focus(); }
    if (event.key === 'Tab') { trigger.focus(); closeFilterMenus(); }
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); if (state.view !== 'search') navigate('search').then(() => $('#search-query')?.focus()); else $('#search-query')?.focus(); }
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }
});
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
try {
  const bootstrap = await api('bootstrap'); state.token = bootstrap.token; state.preferences = bootstrap.preferences;
  state.format = '__default'; document.documentElement.dataset.theme = state.preferences.theme;
  const statusRequest = refreshStatus(); await pollJobs();
  await navigate(location.hash.slice(1) || 'search');
  await statusRequest;
  if (state.view === 'accounts') main.innerHTML = accountPage();
  if (state.view === 'search' && !$('.quota')) $('.page-heading').insertAdjacentHTML('beforeend', quota());
  setInterval(pollJobs, 2200);
} catch (e) { main.innerHTML = errorHTML(e.message); }
