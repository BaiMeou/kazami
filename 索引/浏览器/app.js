/**
 * AIbot 项目浏览器 — 和风古典版
 * 纯静态、零依赖、file:// 协议兼容
 */
(function () {
  'use strict';

  var DATA = window.APP_DATA;
  if (!DATA) { document.body.innerHTML = '<p>数据加载失败，请先运行 python 构建网页.py</p>'; return; }

  // ═══════════════════════════════════════════
  // 工具函数
  // ═══════════════════════════════════════════
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function show(el) { el && el.classList.remove('hidden'); }
  function hide(el) { el && el.classList.add('hidden'); }

  // ═══════════════════════════════════════════
  // 状态管理
  // ═══════════════════════════════════════════
  var state = {
    tab: 'home',
    file: null,
    volume: null,
    chapter: null,
    novelMode: false,
    theme: localStorage.getItem('aibot_theme') || '',
    fontSize: parseInt(localStorage.getItem('aibot_fontsize')) || 16,
  };

  // 阅读进度
  var PROGRESS_KEY = 'aibot_reading_progress';
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(path, data) {
    var p = getProgress();
    p[path] = Object.assign(p[path] || {}, data);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  }
  function isRead(path) { var p = getProgress(); return p[path] && p[path].read; }

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════
  function init() {
    applyTheme(state.theme);
    applyFontSize(state.fontSize);
    bindEvents();
    buildSidebar();
    renderDashboard();
    handleHash();
    window.addEventListener('hashchange', handleHash);
  }

  // ═══════════════════════════════════════════
  // 主题与字体
  // ═══════════════════════════════════════════
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    state.theme = t;
    localStorage.setItem('aibot_theme', t);
    var btn = $('#btn-theme');
    if (btn) btn.innerHTML = t === 'dark' ? '&#9788;' : '&#9790;';
  }
  function toggleTheme() { applyTheme(state.theme === 'dark' ? '' : 'dark'); }
  function applyFontSize(s) {
    document.documentElement.style.setProperty('--font-size', s + 'px');
    state.fontSize = s;
    localStorage.setItem('aibot_fontsize', s);
  }
  function cycleFontSize() {
    var sizes = [14, 16, 18];
    var i = (sizes.indexOf(state.fontSize) + 1) % sizes.length;
    applyFontSize(sizes[i]);
  }

  // ═══════════════════════════════════════════
  // 事件绑定
  // ═══════════════════════════════════════════
  function bindEvents() {
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });
    var btnTheme = $('#btn-theme'); if (btnTheme) btnTheme.addEventListener('click', toggleTheme);
    var btnFont = $('#btn-font-size'); if (btnFont) btnFont.addEventListener('click', cycleFontSize);
    var btnRead = $('#btn-reading-mode'); if (btnRead) btnRead.addEventListener('click', toggleReadingMode);
    var btnHelp = $('#btn-help'); if (btnHelp) btnHelp.addEventListener('click', function () { toggleModal('help-modal'); });
    var si = $('#search-input');
    if (si) si.addEventListener('input', debounce(doSearch, 200));
    var ff = $('#file-filter');
    if (ff) ff.addEventListener('input', debounce(filterFileTree, 150));
    var rc = $('#reading-close'); if (rc) rc.addEventListener('click', closeReading);
    var pc = $('#prev-chapter'); if (pc) pc.addEventListener('click', function () { navChapter(-1); });
    var nc = $('#next-chapter'); if (nc) nc.addEventListener('click', function () { navChapter(1); });
    $$('.modal-close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = btn.closest('[id$="-modal"]');
        if (modal) hide(modal);
      });
    });
    $$('.tl-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.tl-filter').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderTimeline(btn.dataset.vol);
      });
    });
    var mb = $('#mobile-menu-btn');
    if (mb) mb.addEventListener('click', function () { document.body.classList.toggle('sidebar-open'); });
    var ov = $('#sidebar-overlay');
    if (ov) ov.addEventListener('click', function () { document.body.classList.remove('sidebar-open'); });
    document.addEventListener('keydown', handleKey);
    var content = $('#content');
    if (content) content.addEventListener('scroll', debounce(highlightTOC, 50));
  }

  // ═══════════════════════════════════════════
  // Hash 路由
  // ═══════════════════════════════════════════
  function handleHash() {
    var h = location.hash.slice(1);
    if (!h) { switchTab('home'); showDashboard(); return; }
    var parts = h.split('/');
    var cmd = decodeURIComponent(parts[0]);
    var arg = parts.slice(1).map(decodeURIComponent).join('/');
    if (cmd === 'file' && arg) { switchTab('files'); showFile(arg); }
    else if (cmd === 'novel' && arg) { switchTab('novels'); openNovelChapter(arg); }
    else if (cmd === 'search' && arg) { switchTab('search'); $('#search-input').value = arg; doSearch(); }
    else if (cmd === 'timeline') { switchTab('timeline'); showTimelineView(); }
    else if (cmd === 'wiki') { switchTab('wiki'); if (arg) showWikiCategory(arg); else renderWikiHome(); }
    else if (cmd === 'char' && arg) { switchTab('characters'); showCharGraph(); highlightNode(arg); }
    else { switchTab('home'); showDashboard(); }
  }

  // ═══════════════════════════════════════════
  // 标签页切换
  // ═══════════════════════════════════════════
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    $$('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + tab); });
    hide($('#dashboard')); hide($('#file-content')); hide($('#timeline-view'));
    hide($('#wiki-content')); hide($('#character-graph')); hide($('#chapter-nav'));
    hide($('#toc'));
    if (tab === 'home') showDashboard();
    else if (tab === 'characters') showCharGraph();
    else if (tab === 'timeline') showTimelineView();
    else if (tab === 'wiki') { show($('#wiki-content')); renderWikiHome(); }
    document.body.classList.remove('sidebar-open');
  }

  // ═══════════════════════════════════════════
  // 侧边栏构建
  // ═══════════════════════════════════════════
  function buildSidebar() {
    buildFileTree();
    buildNovelList();
    buildWikiCategories();
    buildHomePanel();
  }

  function buildHomePanel() {
    var panel = $('#panel-home');
    if (!panel) return;
    var progress = getProgress();
    var novelFiles = [];
    DATA.volumes.forEach(function (v) { v.chapters.forEach(function (c) { novelFiles.push('小说/' + c + '.md'); }); });
    var readCount = novelFiles.filter(function (f) { return progress[f] && progress[f].read; }).length;
    var lastRead = null, lastTime = 0;
    Object.keys(progress).forEach(function (k) {
      if (progress[k].lastTime > lastTime) { lastTime = progress[k].lastTime; lastRead = k; }
    });
    var h = '<div class="home-stats">';
    h += '<div class="stat-badge"><span class="stat-num">' + DATA.stats.total_files + '</span><span class="stat-label">文件</span></div>';
    h += '<div class="stat-badge"><span class="stat-num">' + DATA.stats.total_lines.toLocaleString() + '</span><span class="stat-label">行</span></div>';
    h += '<div class="stat-badge"><span class="stat-num">' + readCount + '/29</span><span class="stat-label">已读</span></div>';
    h += '</div>';
    if (lastRead) {
      var name = lastRead.split('/').pop().replace('.md', '');
      h += '<a class="continue-btn" href="#file/' + esc(lastRead) + '">继续阅读: ' + esc(name) + '</a>';
    }
    panel.innerHTML = h;
  }

  function buildFileTree() {
    var container = $('#file-tree');
    if (!container) return;
    container.innerHTML = renderTree(DATA.tree, '');
  }

  function renderTree(node, prefix) {
    var h = '';
    var keys = Object.keys(node).sort(function (a, b) {
      var aDir = node[a] !== null, bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });
    keys.forEach(function (key) {
      var path = prefix ? prefix + '/' + key : key;
      if (node[key] !== null) {
        h += '<div class="tree-dir" data-path="' + esc(path) + '">';
        h += '<div class="tree-dir-label" onclick="APP.toggleDir(this)"><span class="tree-arrow">&#9654;</span> ' + esc(key) + '</div>';
        h += '<div class="tree-children hidden">' + renderTree(node[key], path) + '</div>';
        h += '</div>';
      } else {
        var readMark = isRead(path) ? '<span class="read-mark">&#10003;</span>' : '';
        h += '<div class="tree-file" onclick="APP.openFile(\'' + esc(path.replace(/'/g, "\\'")) + '\')">' + readMark + esc(key) + '</div>';
      }
    });
    return h;
  }

  function toggleDir(label) {
    var children = label.nextElementSibling;
    var arrow = label.querySelector('.tree-arrow');
    if (children) {
      children.classList.toggle('hidden');
      arrow.style.transform = children.classList.contains('hidden') ? '' : 'rotate(90deg)';
    }
  }

  function filterFileTree() {
    var val = ($('#file-filter') || {}).value || '';
    val = val.toLowerCase();
    $$('#file-tree .tree-file').forEach(function (el) {
      el.style.display = !val || el.textContent.toLowerCase().includes(val) ? '' : 'none';
    });
    if (val) $$('#file-tree .tree-children').forEach(function (el) { el.classList.remove('hidden'); });
  }

  function buildNovelList() {
    var container = $('#novel-list');
    if (!container) return;
    var h = '';
    DATA.volumes.forEach(function (vol) {
      h += '<div class="novel-vol">';
      h += '<div class="novel-vol-header" onclick="APP.toggleNovelVol(this)" style="border-left-color:' + vol.color + '">';
      h += '<span class="tree-arrow">&#9654;</span> ' + esc(vol.id) + ' · ' + esc(vol.title);
      h += '<span class="vol-time">' + esc(vol.time) + '</span></div>';
      h += '<div class="novel-chapters hidden">';
      vol.chapters.forEach(function (ch) {
        var fpath = '小说/' + ch + '.md';
        var name = ch.split('/').pop().replace(/_/g, ' ');
        var readMark = isRead(fpath) ? '<span class="read-mark">&#10003;</span>' : '';
        h += '<div class="novel-ch" onclick="APP.openNovelChapter(\'' + esc(ch.replace(/'/g, "\\'")) + '\')">' + readMark + esc(name) + '</div>';
      });
      h += '</div></div>';
    });
    container.innerHTML = h;
  }

  function toggleNovelVol(header) {
    var chapters = header.nextElementSibling;
    var arrow = header.querySelector('.tree-arrow');
    if (chapters) {
      chapters.classList.toggle('hidden');
      arrow.style.transform = chapters.classList.contains('hidden') ? '' : 'rotate(90deg)';
    }
  }

  function buildWikiCategories() {
    var container = $('#wiki-cats');
    if (!container) return;
    var h = '';
    Object.keys(DATA.encyclopedia).forEach(function (cat) {
      var info = DATA.encyclopedia[cat];
      h += '<div class="wiki-cat-btn" onclick="APP.showWikiCategory(\'' + esc(cat) + '\')">';
      h += '<span class="wiki-cat-name">' + esc(cat) + '</span>';
      h += '<span class="wiki-cat-count">' + info.entries.length + '</span>';
      h += '</div>';
    });
    container.innerHTML = h;
  }

  // ═══════════════════════════════════════════
  // 仪表盘
  // ═══════════════════════════════════════════
  function showDashboard() { show($('#dashboard')); renderDashboard(); }

  function renderDashboard() {
    var el = $('#dashboard');
    if (!el) return;
    var h = '';
    h += '<div class="dash-section"><h2>项目概览</h2><div class="stat-grid">';
    var mods = DATA.stats.modules;
    Object.keys(mods).forEach(function (m) {
      h += '<div class="stat-card"><div class="stat-card-num">' + mods[m].files + '</div><div class="stat-card-label">' + esc(m) + '</div></div>';
    });
    h += '</div></div>';
    h += '<div class="dash-section"><h2>核心角色</h2><div class="char-grid">';
    DATA.characters.forEach(function (c) {
      h += '<div class="char-card" onclick="APP.openFile(\'角色/' + esc(c.name) + '.md\')">';
      h += '<h3>' + esc(c.name) + '</h3>';
      h += '<p class="char-species">' + esc(c.species) + ' · ' + esc(c.age) + '岁</p>';
      h += '<p class="char-trait">' + esc(c.trait) + '</p>';
      h += '<p class="char-relation">' + esc(c.relation) + '</p>';
      h += '</div>';
    });
    h += '</div></div>';
    h += '<div class="dash-section"><h2>故事</h2><div class="vol-grid">';
    DATA.volumes.forEach(function (v) {
      h += '<div class="vol-card" style="border-left-color:' + v.color + '" onclick="APP.switchTab(\'novels\')">';
      h += '<h3>' + esc(v.id) + ' · ' + esc(v.title) + '</h3>';
      h += '<p>' + esc(v.subtitle) + '</p>';
      h += '<span class="vol-meta">' + esc(v.time) + ' · ' + v.chapters.length + '章</span>';
      h += '</div>';
    });
    h += '</div></div>';
    h += '<div class="dash-section"><h2>世界观</h2><div class="keyword-tags">';
    DATA.worldKeywords.forEach(function (kw) {
      h += '<span class="keyword-tag">' + esc(kw) + '</span>';
    });
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════
  // 文件显示
  // ═══════════════════════════════════════════
  function openFile(path) {
    state.file = path;
    location.hash = '#file/' + encodeURIComponent(path);
    showFile(path);
  }

  function showFile(path) {
    state.file = path;
    var content = DATA.files[path];
    if (!content) { $('#file-content').innerHTML = '<p>文件未找到: ' + esc(path) + '</p>'; show($('#file-content')); return; }
    saveProgress(path, { read: true, lastTime: Date.now() });
    hide($('#dashboard')); hide($('#timeline-view')); hide($('#wiki-content')); hide($('#character-graph'));
    show($('#file-content')); show($('#toc'));
    var parts = path.split('/');
    var bc = parts.map(function (p) { return '<span class="bc-part">' + esc(p) + '</span>'; }).join(' <span class="bc-sep">/</span> ');
    $('#breadcrumb').innerHTML = bc;
    var result = renderMarkdown(content);
    $('#file-content').innerHTML = '<div class="md-body">' + result.html + '</div>';
    renderTOC(result.headings);
    var prog = getProgress()[path];
    var ct = $('#content');
    if (prog && prog.scrollPos && ct) ct.scrollTop = prog.scrollPos;
    else if (ct) ct.scrollTop = 0;
    if (ct) ct.onscroll = function () { saveProgress(path, { scrollPos: ct.scrollTop }); };
    if (state.novelMode) { show($('#chapter-nav')); updateChapterNav(); }
  }

  // ═══════════════════════════════════════════
  // Markdown 渲染
  // ═══════════════════════════════════════════
  var slugCounts = {};
  function resetSlugs() { slugCounts = {}; }
  function slugify(text) {
    var base = text.replace(/[^\w\u4e00-\u9fff-]/g, '').toLowerCase();
    if (!base) base = 'heading';
    if (slugCounts[base]) { slugCounts[base]++; base += '-' + slugCounts[base]; } else { slugCounts[base] = 1; }
    return base;
  }

  function renderMarkdown(src) {
    resetSlugs();
    var headings = [];
    var lines = src.split('\n');
    var html = '';
    var inCode = false, codeLines = [];
    var inTable = false, tableLines = [];
    var inBlockquote = false, bqLines = [];
    var inList = false, listLines = [], listOrdered = false;

    function flushList() { if (!inList) return; html += renderList(listLines, listOrdered); listLines = []; inList = false; }
    function flushBq() { if (!inBlockquote) return; html += '<blockquote>' + bqLines.map(renderInline).join('<br>') + '</blockquote>'; bqLines = []; inBlockquote = false; }
    function flushTable() { if (!inTable) return; html += renderTableHTML(tableLines); tableLines = []; inTable = false; }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.match(/^```/)) {
        if (inCode) { html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>'; inCode = false; codeLines = []; }
        else { flushList(); flushBq(); flushTable(); inCode = true; }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }
      if (!line.trim()) { flushList(); flushBq(); flushTable(); continue; }
      if (line.trim().startsWith('|')) { flushList(); flushBq(); if (!inTable) inTable = true; tableLines.push(line); continue; } else { flushTable(); }
      if (line.match(/^>\s?/)) { flushList(); flushTable(); inBlockquote = true; bqLines.push(line.replace(/^>\s?/, '')); continue; } else { flushBq(); }
      var hm = line.match(/^(#{1,6})\s+(.+)/);
      if (hm) { flushList(); var lv = hm[1].length; var txt = hm[2].trim(); var sl = slugify(txt); headings.push({ level: lv, text: txt, slug: sl }); html += '<h' + lv + ' id="' + sl + '">' + renderInline(txt) + '</h' + lv + '>'; continue; }
      if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) { flushList(); html += '<hr>'; continue; }
      var ulm = line.match(/^(\s*)[*\-+]\s+(.+)/);
      var olm = line.match(/^(\s*)\d+\.\s+(.+)/);
      if (ulm || olm) { flushBq(); flushTable(); if (!inList) { inList = true; listOrdered = !!olm; } listLines.push(line); continue; } else { flushList(); }
      html += '<p>' + renderInline(line) + '</p>';
    }
    flushList(); flushBq(); flushTable();
    if (inCode) html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>';
    return { html: html, headings: headings };
  }

  function renderInline(text) {
    text = esc(text);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    return text;
  }

  function renderList(lines, ordered) {
    var tag = ordered ? 'ol' : 'ul';
    var h = '<' + tag + '>';
    lines.forEach(function (line) {
      var m = line.match(/^(\s*)[*\-+\d.]+\s+(.+)/);
      if (m) h += '<li>' + renderInline(m[2]) + '</li>';
    });
    return h + '</' + tag + '>';
  }

  function renderTableHTML(lines) {
    if (lines.length < 2) return '';
    var h = '<table>';
    lines.forEach(function (line, idx) {
      if (idx === 1 && line.match(/^\|[\s\-:|]+\|$/)) return;
      var cells = line.split('|').slice(1, -1);
      var tag = idx === 0 ? 'th' : 'td';
      h += '<tr>';
      cells.forEach(function (c) { h += '<' + tag + '>' + renderInline(c.trim()) + '</' + tag + '>'; });
      h += '</tr>';
    });
    return h + '</table>';
  }

  function renderTOC(headings) {
    var list = $('#toc-list');
    if (!list) return;
    if (!headings.length) { list.innerHTML = '<p class="toc-empty">无目录</p>'; return; }
    var h = '';
    headings.forEach(function (item) {
      h += '<a class="toc-item toc-h' + item.level + '" href="#' + item.slug + '" onclick="APP.scrollToHeading(\'' + esc(item.slug) + '\'); return false;">' + esc(item.text) + '</a>';
    });
    list.innerHTML = h;
  }

  function scrollToHeading(slug) {
    var el = document.getElementById(slug);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function highlightTOC() {
    var content = $('#content');
    if (!content) return;
    var headings = $$('.md-body h1, .md-body h2, .md-body h3, .md-body h4');
    var scrollTop = content.scrollTop;
    var current = null;
    headings.forEach(function (h) { if (h.offsetTop - 80 <= scrollTop) current = h.id; });
    $$('.toc-item').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
  }

  // ═══════════════════════════════════════════
  // 小说阅读
  // ═══════════════════════════════════════════
  function openNovelChapter(chapterPath) {
    state.novelMode = true;
    for (var vi = 0; vi < DATA.volumes.length; vi++) {
      var vol = DATA.volumes[vi];
      var ci = vol.chapters.indexOf(chapterPath);
      if (ci >= 0) { state.volume = vi; state.chapter = ci; break; }
    }
    var fpath = '小说/' + chapterPath + '.md';
    location.hash = '#novel/' + encodeURIComponent(chapterPath);
    showFile(fpath);
    show($('#chapter-nav'));
    updateChapterNav();
  }

  function updateChapterNav() {
    if (state.volume === null) return;
    var ci = state.chapter;
    var allChapters = [];
    DATA.volumes.forEach(function (v) { v.chapters.forEach(function (c) { allChapters.push(c); }); });
    var globalIdx = 0;
    for (var i = 0; i < state.volume; i++) globalIdx += DATA.volumes[i].chapters.length;
    globalIdx += ci;
    var prog = $('#chapter-progress');
    if (prog) prog.textContent = (globalIdx + 1) + ' / ' + allChapters.length;
    var pb = $('#prev-chapter'); if (pb) pb.disabled = globalIdx === 0;
    var nb = $('#next-chapter'); if (nb) nb.disabled = globalIdx === allChapters.length - 1;
  }

  function navChapter(dir) {
    if (!state.novelMode) return;
    var allChapters = [];
    DATA.volumes.forEach(function (v) { v.chapters.forEach(function (c) { allChapters.push(c); }); });
    var globalIdx = 0;
    for (var i = 0; i < state.volume; i++) globalIdx += DATA.volumes[i].chapters.length;
    globalIdx += state.chapter;
    var newIdx = globalIdx + dir;
    if (newIdx < 0 || newIdx >= allChapters.length) return;
    openNovelChapter(allChapters[newIdx]);
  }

  // ═══════════════════════════════════════════
  // 阅读模式
  // ═══════════════════════════════════════════
  function toggleReadingMode() {
    var overlay = $('#reading-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) openReading(); else closeReading();
  }
  function openReading() {
    if (!state.file) return;
    var content = DATA.files[state.file];
    if (!content) return;
    var result = renderMarkdown(content);
    $('#reading-body').innerHTML = '<div class="md-body">' + result.html + '</div>';
    $('#reading-title').textContent = state.file.split('/').pop().replace('.md', '');
    show($('#reading-overlay'));
  }
  function closeReading() { hide($('#reading-overlay')); }

  // ═══════════════════════════════════════════
  // 搜索
  // ═══════════════════════════════════════════
  function doSearch() {
    var input = $('#search-input');
    var results = $('#search-results');
    if (!input || !results) return;
    var q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    var matches = [];
    Object.keys(DATA.files).forEach(function (path) {
      var nameMatch = path.toLowerCase().includes(q);
      var content = DATA.files[path];
      var lines = content.split('\n');
      var lineMatches = [];
      for (var i = 0; i < lines.length && lineMatches.length < 3; i++) {
        if (lines[i].toLowerCase().includes(q)) lineMatches.push({ num: i + 1, text: lines[i] });
      }
      if (nameMatch || lineMatches.length) matches.push({ path: path, nameMatch: nameMatch, lines: lineMatches });
    });
    matches.sort(function (a, b) { return (b.nameMatch ? 1 : 0) - (a.nameMatch ? 1 : 0); });
    matches = matches.slice(0, 30);
    var h = '<div class="search-count">找到 ' + matches.length + ' 个结果</div>';
    matches.forEach(function (m) {
      h += '<div class="search-item" onclick="APP.openFile(\'' + esc(m.path.replace(/'/g, "\\'")) + '\')">';
      h += '<div class="search-path">' + highlightText(m.path, q) + '</div>';
      m.lines.forEach(function (l) {
        h += '<div class="search-line"><span class="line-num">' + l.num + '</span> ' + highlightText(truncate(l.text, 100), q) + '</div>';
      });
      h += '</div>';
    });
    results.innerHTML = h;
  }
  function highlightText(text, q) {
    var escaped = esc(text);
    var regex = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }
  function truncate(s, len) { return s.length > len ? s.slice(0, len) + '...' : s; }

  // ═══════════════════════════════════════════
  // 角色关系图谱 (Canvas 2D)
  // ═══════════════════════════════════════════
  var graphState = { nodes: [], edges: [], dragging: null, offset: { x: 0, y: 0 }, scale: 1, hover: null, animId: null };
  var GROUP_COLORS = { core: '#c41e3a', scb: '#4a90d9', baigui: '#5a9e6f', qingqiu: '#d4a574', enemy: '#7a5ea7', friend: '#d4748a', school: '#5ab5b0' };
  var EDGE_COLORS = { love: '#c41e3a', family: '#d4a574', friend: '#5a9e6f', enemy: '#7a5ea7', ally: '#4a90d9', neutral: '#888' };

  function showCharGraph() {
    show($('#character-graph'));
    var canvas = $('#graph-canvas');
    if (!canvas) return;
    var container = $('#character-graph');
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 600;
    if (!graphState.nodes.length) initGraph(canvas);
    if (!graphState.animId) animateGraph(canvas);
  }

  function initGraph(canvas) {
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    graphState.nodes = DATA.relationships.nodes.map(function (n, i) {
      var angle = (i / DATA.relationships.nodes.length) * Math.PI * 2;
      var r = n.group === 'core' ? 60 : 180;
      return { id: n.id, group: n.group, species: n.species, desc: n.desc,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0, radius: n.group === 'core' ? 28 : 20 };
    });
    graphState.edges = DATA.relationships.edges.slice();
    canvas.addEventListener('mousedown', graphMouseDown);
    canvas.addEventListener('mousemove', graphMouseMove);
    canvas.addEventListener('mouseup', graphMouseUp);
    canvas.addEventListener('wheel', graphWheel, { passive: false });
    canvas.addEventListener('click', graphClick);
  }

  function findNodeAt(x, y) {
    var nodes = graphState.nodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      var nx = (x - graphState.offset.x) / graphState.scale;
      var ny = (y - graphState.offset.y) / graphState.scale;
      var dx = nx - n.x, dy = ny - n.y;
      if (dx * dx + dy * dy < n.radius * n.radius) return n;
    }
    return null;
  }

  function graphMouseDown(e) {
    var rect = e.target.getBoundingClientRect();
    var node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node) { graphState.dragging = node; node.vx = 0; node.vy = 0; }
  }
  function graphMouseMove(e) {
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (graphState.dragging) {
      graphState.dragging.x = (x - graphState.offset.x) / graphState.scale;
      graphState.dragging.y = (y - graphState.offset.y) / graphState.scale;
    }
    graphState.hover = findNodeAt(x, y);
    e.target.style.cursor = graphState.hover ? 'pointer' : 'default';
  }
  function graphMouseUp() { graphState.dragging = null; }
  function graphWheel(e) { e.preventDefault(); var d = e.deltaY > 0 ? 0.9 : 1.1; graphState.scale = Math.max(0.3, Math.min(3, graphState.scale * d)); }
  function graphClick(e) {
    if (graphState.dragging) return;
    var rect = e.target.getBoundingClientRect();
    var node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node) showCharDetail(node);
  }

  function animateGraph(canvas) {
    var ctx = canvas.getContext('2d');
    var nodes = graphState.nodes;
    var edges = graphState.edges;
    function nodeById(id) { return nodes.find(function (n) { return n.id === id; }); }

    function step() {
      var damping = 0.85, repulsion = 3000, springLen = 150, springK = 0.01, centerK = 0.002;
      var cx = canvas.width / 2 / graphState.scale, cy = canvas.height / 2 / graphState.scale;
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var f = repulsion / (dist * dist);
          nodes[i].vx += (dx / dist) * f; nodes[i].vy += (dy / dist) * f;
          nodes[j].vx -= (dx / dist) * f; nodes[j].vy -= (dy / dist) * f;
        }
      }
      edges.forEach(function (e) {
        var s = nodeById(e.source), t = nodeById(e.target);
        if (!s || !t) return;
        var dx = t.x - s.x, dy = t.y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = (dist - springLen) * springK;
        s.vx += (dx / dist) * f; s.vy += (dy / dist) * f;
        t.vx -= (dx / dist) * f; t.vy -= (dy / dist) * f;
      });
      nodes.forEach(function (n) {
        if (n === graphState.dragging) return;
        n.vx += (cx - n.x) * centerK; n.vy += (cy - n.y) * centerK;
        n.vx *= damping; n.vy *= damping;
        n.x += n.vx; n.y += n.vy;
      });

      var isDark = state.theme === 'dark';
      var bgColor = isDark ? '#1a1a2e' : '#f5f0e8';
      var textColor = isDark ? '#e8dcc8' : '#2c2c2c';
      var labelColor = isDark ? '#9a8c78' : '#6b6b6b';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(graphState.offset.x, graphState.offset.y);
      ctx.scale(graphState.scale, graphState.scale);

      edges.forEach(function (e) {
        var s = nodeById(e.source), t = nodeById(e.target);
        if (!s || !t) return;
        ctx.beginPath();
        ctx.strokeStyle = EDGE_COLORS[e.type] || '#888';
        ctx.lineWidth = (e.type === 'love' || e.type === 'family') ? 2.5 : 1.5;
        if (e.type === 'enemy') ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
        ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px sans-serif'; ctx.fillStyle = labelColor; ctx.textAlign = 'center';
        ctx.fillText(e.label, (s.x + t.x) / 2, (s.y + t.y) / 2 - 5);
      });

      nodes.forEach(function (n) {
        var isHover = graphState.hover === n;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = GROUP_COLORS[n.group] || '#888';
        if (isHover) { ctx.shadowColor = GROUP_COLORS[n.group]; ctx.shadowBlur = 15; }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = isHover ? '#fff' : (isDark ? '#333' : '#ddd');
        ctx.lineWidth = isHover ? 3 : 1.5; ctx.stroke();
        ctx.font = (n.group === 'core' ? 'bold 14px' : '12px') + ' sans-serif';
        ctx.fillStyle = textColor; ctx.textAlign = 'center';
        ctx.fillText(n.id, n.x, n.y + n.radius + 16);
      });
      ctx.restore();
      graphState.animId = requestAnimationFrame(step);
    }
    step();
  }

  function highlightNode(name) {
    var node = graphState.nodes.find(function (n) { return n.id === name; });
    if (node) showCharDetail(node);
  }

  function showCharDetail(node) {
    $('#char-detail-name').textContent = node.id;
    $('#char-detail-species').textContent = node.species;
    $('#char-detail-desc').textContent = node.desc;
    var rels = graphState.edges.filter(function (e) { return e.source === node.id || e.target === node.id; });
    var h = '<h4>关系</h4>';
    rels.forEach(function (r) {
      var other = r.source === node.id ? r.target : r.source;
      h += '<div class="char-rel-item"><span class="rel-name">' + esc(other) + '</span><span class="rel-label">' + esc(r.label) + '</span></div>';
    });
    $('#char-detail-relations').innerHTML = h;
    show($('#char-detail-modal'));
  }

  // ═══════════════════════════════════════════
  // 时间线
  // ═══════════════════════════════════════════
  function showTimelineView() { show($('#timeline-view')); renderTimeline('all'); }

  function renderTimeline(vol) {
    var el = $('#timeline-view');
    if (!el) return;
    var events = DATA.timeline;
    if (vol && vol !== 'all') events = events.filter(function (e) { return e.vol === vol; });
    var h = '<div class="timeline-container">';
    events.forEach(function (evt) {
      var typeClass = 'tl-' + (evt.type || 'normal');
      var volColor = '';
      DATA.volumes.forEach(function (v) { if (v.id === evt.vol) volColor = v.color; });
      var clickAttr = evt.chapter ? ' onclick="APP.openNovelChapter(\'' + esc(evt.chapter.replace(/'/g, "\\'")) + '\')"' : '';
      var clickClass = evt.chapter ? ' clickable' : '';
      h += '<div class="tl-event ' + typeClass + clickClass + '"' + clickAttr + '>';
      h += '<div class="tl-dot" style="background:' + (volColor || 'var(--accent)') + '"></div>';
      h += '<div class="tl-line"></div>';
      h += '<div class="tl-card">';
      h += '<div class="tl-time">' + esc(evt.time) + '</div>';
      h += '<div class="tl-vol-tag" style="color:' + (volColor || 'var(--text-secondary)') + '">' + esc(evt.vol) + '</div>';
      h += '<div class="tl-text">' + esc(evt.event) + '</div>';
      h += '</div></div>';
    });
    h += '</div>';
    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════
  // 世界观百科
  // ═══════════════════════════════════════════
  function renderWikiHome() {
    var el = $('#wiki-content');
    if (!el) return;
    var h = '<div class="wiki-home"><h2>世界观百科</h2><div class="wiki-cat-grid">';
    Object.keys(DATA.encyclopedia).forEach(function (cat) {
      var info = DATA.encyclopedia[cat];
      h += '<div class="wiki-cat-card" onclick="APP.showWikiCategory(\'' + esc(cat) + '\')">';
      h += '<h3>' + esc(cat) + '</h3><p>' + esc(info.desc) + '</p>';
      h += '<span class="wiki-count">' + info.entries.length + ' 篇</span></div>';
    });
    h += '</div></div>';
    el.innerHTML = h;
  }

  function showWikiCategory(cat) {
    location.hash = '#wiki/' + encodeURIComponent(cat);
    show($('#wiki-content'));
    hide($('#dashboard')); hide($('#file-content')); hide($('#timeline-view')); hide($('#character-graph'));
    var info = DATA.encyclopedia[cat];
    if (!info) return;
    var el = $('#wiki-content');
    var h = '<div class="wiki-category">';
    h += '<a class="wiki-back" onclick="APP.renderWikiHome()">&larr; 返回百科</a>';
    h += '<h2>' + esc(cat) + '</h2><p class="wiki-cat-desc">' + esc(info.desc) + '</p>';
    h += '<div class="wiki-entries">';
    info.entries.forEach(function (entry) {
      h += '<div class="wiki-entry" onclick="APP.openFile(\'' + esc(entry.file.replace(/'/g, "\\'")) + '\')">';
      h += '<h3>' + esc(entry.title) + '</h3><p>' + esc(entry.summary) + '</p></div>';
    });
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════
  // 弹窗与键盘
  // ═══════════════════════════════════════════
  function toggleModal(id) { var el = $('#' + id); if (el) el.classList.toggle('hidden'); }

  function handleKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === '/' || (e.ctrlKey && e.key === 'k')) { e.preventDefault(); switchTab('search'); var si = $('#search-input'); if (si) si.focus(); }
    else if (e.key === 'Escape') {
      if (!$('#reading-overlay').classList.contains('hidden')) { closeReading(); return; }
      if (!$('#help-modal').classList.contains('hidden')) { hide($('#help-modal')); return; }
      if (!$('#char-detail-modal').classList.contains('hidden')) { hide($('#char-detail-modal')); return; }
      document.body.classList.remove('sidebar-open');
      location.hash = '';
    }
    else if (e.key === 'ArrowLeft') navChapter(-1);
    else if (e.key === 'ArrowRight') navChapter(1);
    else if (e.ctrlKey && e.key === 'r') { e.preventDefault(); toggleReadingMode(); }
    else if (e.key === '?') toggleModal('help-modal');
  }

  // ═══════════════════════════════════════════
  // 公开 API
  // ═══════════════════════════════════════════
  window.APP = {
    openFile: openFile, toggleDir: toggleDir, toggleNovelVol: toggleNovelVol,
    openNovelChapter: openNovelChapter, switchTab: switchTab, scrollToHeading: scrollToHeading,
    showWikiCategory: showWikiCategory, renderWikiHome: renderWikiHome,
    navChapter: navChapter, openReading: openReading, closeReading: closeReading,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
