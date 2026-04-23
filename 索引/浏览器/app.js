/**
 * 风见市物语 — Vue 3 现代阅读器
 * 纯静态、file:// 兼容、Vue 3 CDN (本地)
 */
;(function () {
  'use strict';

  var DATA = window.APP_DATA;
  if (!DATA) {
    document.body.innerHTML = '<p style="padding:2em;font-size:1.2em">数据加载失败，请先运行 <code>python 构建网页.py</code></p>';
    return;
  }

  var Vue = window.Vue;
  if (!Vue) {
    document.body.innerHTML = '<p style="padding:2em">Vue 加载失败，请确认 vue.global.prod.js 存在</p>';
    return;
  }

  var ref = Vue.ref;
  var computed = Vue.computed;
  var watch = Vue.watch;
  var onMounted = Vue.onMounted;
  var onUnmounted = Vue.onUnmounted;
  var nextTick = Vue.nextTick;

  /* ═══════════════════════════════════════════
     工具函数
     ═══════════════════════════════════════════ */
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ── 所有小说章节 (flat) ── */
  var allChapters = [];
  DATA.volumes.forEach(function (v) { v.chapters.forEach(function (c) { allChapters.push(c); }); });
  var novelTotalChars = 0;
  DATA.volumes.forEach(function (v) { novelTotalChars += (v.chars || 0); });

  /* ── localStorage 工具 ── */
  var PROGRESS_KEY = 'aibot_reading_progress';
  function getProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; } }
  function saveProgressData(path, data) {
    try {
      var p = getProgress();
      p[path] = Object.assign(p[path] || {}, data);
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch (e) { /* QuotaExceededError or Private mode — silently skip */ }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsGet(k, d) { var v = localStorage.getItem(k); return v !== null ? v : d; }
  function lsGetInt(k, d) { var v = parseInt(localStorage.getItem(k), 10); return isNaN(v) ? d : v; }

  /* ═══════════════════════════════════════════
     Markdown 渲染器
     ═══════════════════════════════════════════ */
  var slugCounts = {};
  function resetSlugs() { slugCounts = {}; }
  function slugify(text) {
    var base = text.replace(/[^\w\u4e00-\u9fff-]/g, '').toLowerCase();
    if (!base) base = 'heading';
    if (slugCounts[base]) { slugCounts[base]++; base += '-' + slugCounts[base]; } else { slugCounts[base] = 1; }
    return base;
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

  function renderMarkdown(src) {
    resetSlugs();
    var headings = [];
    var lines = src.split('\n');
    var html = '';
    var inCode = false, codeLines = [], codeLang = '';
    var inTable = false, tableLines = [];
    var inBlockquote = false, bqLines = [];
    var inList = false, listLines = [], listOrdered = false;

    function flushList() { if (!inList) return; html += renderList(listLines, listOrdered); listLines = []; inList = false; }
    function flushBq() { if (!inBlockquote) return; html += '<blockquote>' + bqLines.map(renderInline).join('<br>') + '</blockquote>'; bqLines = []; inBlockquote = false; }
    function flushTable() { if (!inTable) return; html += renderTableHTML(tableLines); tableLines = []; inTable = false; }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var codeMatch = line.match(/^```(\w*)/);
      if (codeMatch !== null && line.trim().indexOf('```') === 0) {
        if (inCode) { html += '<pre><code' + (codeLang ? ' class="lang-' + codeLang + '"' : '') + '>' + esc(codeLines.join('\n')) + '</code></pre>'; inCode = false; codeLines = []; codeLang = ''; }
        else { flushList(); flushBq(); flushTable(); inCode = true; codeLang = codeMatch[1] || ''; }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }
      if (!line.trim()) { flushList(); flushBq(); flushTable(); continue; }
      if (line.trim().charAt(0) === '|') { flushList(); flushBq(); if (!inTable) inTable = true; tableLines.push(line); continue; } else { flushTable(); }
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
    return { html: '<div class="md-body">' + html + '</div>', headings: headings };
  }

  /* ═══════════════════════════════════════════
     角色关系图 (Canvas 2D)
     ═══════════════════════════════════════════ */
  var GROUP_COLORS = {
    core: '#c24050', scb: '#4a90d9', baigui: '#5a9e6f', qingqiu: '#c9a96e',
    sanran: '#e08040', nekomata: '#d4748a', tsuchimikado: '#5ab5b0',
    enemy: '#7a5ea7', neutral: '#888', weaver: '#6a8ab0',
    friend: '#d4748a', school: '#5ab5b0', huangfu: '#7eaa55'
  };
  var EDGE_COLORS = { love: '#c24050', family: '#c9a96e', friend: '#5a9e6f', enemy: '#7a5ea7', ally: '#4a90d9', neutral: '#888' };

  function createGraph(canvas, theme, onClickNode) {
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var nodes = DATA.relationships.nodes.map(function (n, i) {
      var angle = (i / DATA.relationships.nodes.length) * Math.PI * 2;
      var r = n.group === 'core' ? 60 : 180;
      return {
        id: n.id, group: n.group, species: n.species, desc: n.desc,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0, radius: n.group === 'core' ? 28 : 20
      };
    });
    var edges = DATA.relationships.edges.slice();
    var dragging = null, hover = null, scale = 1, offset = { x: 0, y: 0 };
    var animId = null;

    function nodeById(id) { for (var i = 0; i < nodes.length; i++) { if (nodes[i].id === id) return nodes[i]; } return null; }
    function findNodeAt(x, y) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        var nx = (x - offset.x) / scale, ny = (y - offset.y) / scale;
        var dx = nx - n.x, dy = ny - n.y;
        if (dx * dx + dy * dy < n.radius * n.radius) return n;
      }
      return null;
    }

    function onMousedown(e) {
      var rect = canvas.getBoundingClientRect();
      var node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node) { dragging = node; node.vx = 0; node.vy = 0; }
    }
    function onMousemove(e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (dragging) { dragging.x = (x - offset.x) / scale; dragging.y = (y - offset.y) / scale; }
      hover = findNodeAt(x, y);
      canvas.style.cursor = hover ? 'pointer' : 'default';
    }
    function onMouseup() { dragging = null; }
    function onWheel(e) {
      e.preventDefault();
      var d = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.3, Math.min(3, scale * d));
    }
    function onClick(e) {
      if (dragging) return;
      var rect = canvas.getBoundingClientRect();
      var node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node && onClickNode) onClickNode(node);
    }
    canvas.addEventListener('mousedown', onMousedown);
    canvas.addEventListener('mousemove', onMousemove);
    canvas.addEventListener('mouseup', onMouseup);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    function animate() {
      var ctx = canvas.getContext('2d');
      var damping = 0.85, repulsion = 3000, springLen = 150, springK = 0.01, centerK = 0.002;
      var gcx = W / 2 / scale, gcy = H / 2 / scale;

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
        if (n === dragging) return;
        n.vx += (gcx - n.x) * centerK; n.vy += (gcy - n.y) * centerK;
        n.vx *= damping; n.vy *= damping;
        n.x += n.vx; n.y += n.vy;
      });

      var isDark = theme.value === 'dark';
      var bgColor = isDark ? '#141820' : '#faf8f4';
      var textColor = isDark ? '#e8e0d0' : '#2a2520';
      var labelColor = isDark ? '#8a7e70' : '#6b6b6b';

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(scale, scale);

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
        var isHover = hover === n;
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
      animId = requestAnimationFrame(animate);
    }

    animate();

    return {
      destroy: function () {
        if (animId) cancelAnimationFrame(animId);
        canvas.removeEventListener('mousedown', onMousedown);
        canvas.removeEventListener('mousemove', onMousemove);
        canvas.removeEventListener('mouseup', onMouseup);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('click', onClick);
      },
      highlightNode: function (name) {
        var node = nodes.find(function (n) { return n.id === name; });
        if (node && onClickNode) onClickNode(node);
      },
      resize: function (w, h) { W = canvas.width = w; H = canvas.height = h; }
    };
  }

  /* ═══════════════════════════════════════════
     Tree 组件
     ═══════════════════════════════════════════ */
  var TreeNode = {
    name: 'TreeNode',
    props: ['name', 'node', 'prefix', 'filter', 'progress'],
    emits: ['open-file', 'toggle-dir'],
    template: '<div v-if="isDir" class="tree-dir">' +
      '<div class="tree-dir-label" @click="toggle">' +
        '<span class="tree-arrow" :class="{ expanded: open }">&#9654;</span> {{ name }}' +
      '</div>' +
      '<div class="tree-children" v-show="open">' +
        '<tree-node v-for="(val, key) in node" :key="key" :name="key" :node="val" ' +
          ':prefix="prefix + \'/\' + key" :filter="filter" :progress="progress" ' +
          '@open-file="$emit(\'open-file\', $event)" @toggle-dir="$emit(\'toggle-dir\', $event)" />' +
      '</div>' +
    '</div>' +
    '<div v-else-if="visible" class="tree-file" @click="$emit(\'open-file\', prefix)">' +
      '<span v-if="isFileRead" class="read-mark">&#10003;</span>{{ name }}' +
    '</div>',
    data: function () { return { open: false }; },
    computed: {
      isDir: function () { return this.node !== null && typeof this.node === 'object'; },
      visible: function () {
        if (!this.filter) return true;
        return this.name.toLowerCase().indexOf(this.filter.toLowerCase()) >= 0;
      },
      isFileRead: function () {
        return this.progress[this.prefix] && this.progress[this.prefix].read;
      }
    },
    methods: {
      toggle: function () { this.open = !this.open; }
    },
    watch: {
      filter: function (val) { if (val) this.open = true; }
    }
  };

  /* ═══════════════════════════════════════════
     Vue App
     ═══════════════════════════════════════════ */
  var app = Vue.createApp({
    setup: function () {
      /* ── 响应式状态 ── */
      var tab = ref('home');
      var view = ref('dashboard'); // dashboard | file | timeline | wiki | characters | factions | stats
      var theme = ref(lsGet('aibot_theme', ''));
      var fontSize = ref(lsGetInt('aibot_fontsize', 16));
      var sidebarCollapsed = ref(lsGet('aibot_sidebar', '0') === '1');
      var mobileOpen = ref(false);
      var currentFile = ref(null);
      var novelMode = ref(false);
      var currentVolIdx = ref(null);
      var currentChIdx = ref(null);
      var showHelp = ref(false);
      var fileFilter = ref('');
      var searchQuery = ref('');
      var searchResults = ref([]);
      var tlFilter = ref('all');
      var wikiCategory = ref(null);
      var charDetail = ref(null);
      var progress = ref(getProgress());
      var expanded = ref({});
      var renderedHTML = ref('');
      var tocHeadings = ref([]);
      var tocVisible = ref(false);
      var activeTocSlug = ref('');
      var scrollPct = ref(0);
      var graphInstance = ref(null);

      /* ── 书签系统 ── */
      var BOOKMARKS_KEY = 'aibot_bookmarks';
      var bookmarks = ref(JSON.parse(lsGet(BOOKMARKS_KEY, '[]')));

      function addBookmark() {
        if (!currentFile.value) return;
        var el = contentEl.value;
        var pct = el ? Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100) : 0;
        var bm = {
          id: Date.now(),
          file: currentFile.value,
          name: currentFile.value.split('/').pop().replace('.md', '').replace(/_/g, ' '),
          pct: pct,
          scrollPos: el ? el.scrollTop : 0,
          time: new Date().toLocaleString('zh-CN')
        };
        bookmarks.value.push(bm);
        lsSet(BOOKMARKS_KEY, JSON.stringify(bookmarks.value));
      }

      function removeBookmark(id) {
        bookmarks.value = bookmarks.value.filter(function (b) { return b.id !== id; });
        lsSet(BOOKMARKS_KEY, JSON.stringify(bookmarks.value));
      }

      function loadBookmark(bm) {
        openFile(bm.file);
        nextTick(function () {
          if (contentEl.value) contentEl.value.scrollTop = bm.scrollPos;
        });
      }

      /* ── 阅读模式状态 ── */
      var readingMode = ref(false);
      var readingFontSize = ref(lsGetInt('aibot_rfontsize', 20));
      var readingTheme = ref(lsGet('aibot_rtheme', ''));
      var readingWidth = ref(lsGet('aibot_rwidth', 'normal'));
      var readingScrollPct = ref(0);
      var readingHTML = ref('');

      /* ── refs ── */
      var contentEl = ref(null);
      var graphCanvas = ref(null);
      var readingBody = ref(null);
      var searchInput = ref(null);

      /* ── 侧边栏Tab定义 ── */
      var tabs = [
        { id: 'home', label: '首页', icon: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'novels', label: '小说', icon: '<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'files', label: '文件', icon: '<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'characters', label: '人物', icon: '<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'timeline', label: '时间线', icon: '<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'wiki', label: '百科', icon: '<path d="M12 6.253v13m0-13c-2.198-.926-4.708-1.252-7.284-.81M12 6.253c2.198-.926 4.708-1.252 7.284-.81M4.716 5.443A9.97 9.97 0 003 11.25C3 16.635 7.365 21 12.75 21c.638 0 1.262-.061 1.866-.178" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'search', label: '搜索', icon: '<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'factions', label: '势力', icon: '<path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
        { id: 'stats', label: '统计', icon: '<path d="M3 13h4v8H3zm7-5h4v13h-4zm7-5h4v18h-4z" stroke="currentColor" stroke-width="1.5" fill="none"/>' }
      ];

      /* ── 计算属性 ── */
      var totalChapters = computed(function () { return allChapters.length; });

      var readCount = computed(function () {
        var p = progress.value;
        var count = 0;
        allChapters.forEach(function (c) {
          var fpath = '小说/' + c + '.md';
          if (p[fpath] && p[fpath].read) count++;
        });
        return count;
      });

      var lastReadFile = computed(function () {
        var p = progress.value;
        var best = null, bestTime = 0;
        Object.keys(p).forEach(function (k) {
          if (p[k].lastTime > bestTime) { bestTime = p[k].lastTime; best = k; }
        });
        return best;
      });

      var lastReadName = computed(function () {
        if (!lastReadFile.value) return '';
        return lastReadFile.value.split('/').pop().replace('.md', '').replace(/_/g, ' ');
      });

      var filteredTimeline = computed(function () {
        var events = DATA.timeline;
        if (tlFilter.value && tlFilter.value !== 'all') {
          events = events.filter(function (e) { return e.vol === tlFilter.value; });
        }
        return events;
      });

      var charRelations = computed(function () {
        if (!charDetail.value) return [];
        var id = charDetail.value.id;
        return DATA.relationships.edges.filter(function (e) {
          return e.source === id || e.target === id;
        }).map(function (e) {
          return { other: e.source === id ? e.target : e.source, label: e.label };
        });
      });

      var maxVolChars = computed(function () {
        var max = 0;
        DATA.volumes.forEach(function (v) { if (v.chars > max) max = v.chars; });
        return max || 1;
      });

      var maxChapterChars = computed(function () {
        var max = 0;
        DATA.volumes.forEach(function (v) {
          v.chapterChars.forEach(function (c) { if (c > max) max = c; });
        });
        return max || 1;
      });

      var sortedChapters = computed(function () {
        var list = [];
        DATA.volumes.forEach(function (v) {
          v.chapters.forEach(function (ch, ci) {
            list.push({ path: ch, chars: v.chapterChars[ci] });
          });
        });
        list.sort(function (a, b) { return b.chars - a.chars; });
        return list;
      });

      var chapterProgressText = computed(function () {
        if (currentVolIdx.value === null) return '';
        var globalIdx = 0;
        for (var i = 0; i < currentVolIdx.value; i++) globalIdx += DATA.volumes[i].chapters.length;
        globalIdx += currentChIdx.value;
        return (globalIdx + 1) + ' / ' + allChapters.length;
      });

      var canPrevChapter = computed(function () {
        if (currentVolIdx.value === null) return false;
        var globalIdx = 0;
        for (var i = 0; i < currentVolIdx.value; i++) globalIdx += DATA.volumes[i].chapters.length;
        return (globalIdx + currentChIdx.value) > 0;
      });

      var canNextChapter = computed(function () {
        if (currentVolIdx.value === null) return false;
        var globalIdx = 0;
        for (var i = 0; i < currentVolIdx.value; i++) globalIdx += DATA.volumes[i].chapters.length;
        return (globalIdx + currentChIdx.value) < allChapters.length - 1;
      });

      var readingTitle = computed(function () {
        if (!currentFile.value) return '';
        return currentFile.value.split('/').pop().replace('.md', '').replace(/_/g, ' ');
      });

      var readingCharsText = computed(function () {
        if (!currentFile.value) return '';
        var c = DATA.fileChars[currentFile.value];
        return c ? formatChars(c) : '';
      });

      var readingTimeText = computed(function () {
        if (!currentFile.value) return '';
        var c = DATA.fileChars[currentFile.value];
        return c ? '~' + Math.ceil(c / 500) + '分钟' : '';
      });

      var readingMaxWidth = computed(function () {
        if (readingWidth.value === 'wide') return '900px';
        if (readingWidth.value === 'full') return '100%';
        return '680px';
      });

      var readingWidthLabel = computed(function () {
        if (readingWidth.value === 'wide') return '宽';
        if (readingWidth.value === 'full') return '满';
        return '窄';
      });

      var readingThemeLabel = computed(function () {
        if (readingTheme.value === 'sepia') return '暖';
        if (readingTheme.value === 'green') return '绿';
        if (readingTheme.value === 'dark') return '暗';
        return '默';
      });

      /* ── 方法 ── */
      function formatNum(n) { return n ? n.toLocaleString() : '0'; }
      function formatChars(n) {
        if (!n) return '0';
        if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万字';
        return n.toLocaleString() + '字';
      }

      function chapterName(ch) {
        return ch.split('/').pop().replace(/_/g, ' ');
      }

      function isRead(path) {
        return progress.value[path] && progress.value[path].read;
      }

      function volColor(volId) {
        for (var i = 0; i < DATA.volumes.length; i++) {
          if (DATA.volumes[i].id === volId) return DATA.volumes[i].color;
        }
        return 'var(--accent)';
      }

      function volReadPct(vol) {
        var p = progress.value;
        var read = 0;
        vol.chapters.forEach(function (c) {
          if (p['小说/' + c + '.md'] && p['小说/' + c + '.md'].read) read++;
        });
        return (read / vol.chapters.length * 100);
      }

      function toggleExpand(key, forceOpen) {
        if (forceOpen) {
          expanded.value[key] = true;
        } else {
          expanded.value[key] = !expanded.value[key];
        }
        // Vue 3 reactivity: we need a new object reference
        expanded.value = Object.assign({}, expanded.value);
      }

      function switchTab(t) {
        tab.value = t;
        mobileOpen.value = false;
        if (t === 'home') { view.value = 'dashboard'; currentFile.value = null; novelMode.value = false; tocVisible.value = false; }
        else if (t === 'characters') { view.value = 'characters'; tocVisible.value = false; initGraph(); }
        else if (t === 'timeline') { view.value = 'timeline'; tocVisible.value = false; }
        else if (t === 'wiki') { view.value = 'wiki'; wikiCategory.value = null; tocVisible.value = false; }
        else if (t === 'factions') { view.value = 'factions'; tocVisible.value = false; }
        else if (t === 'stats') { view.value = 'stats'; tocVisible.value = false; }
        else if (t === 'search') {
          nextTick(function () {
            if (searchInput.value) searchInput.value.focus();
          });
        }
      }

      function openFile(path) {
        currentFile.value = path;
        novelMode.value = false;
        view.value = 'file';

        var content = DATA.files[path];
        if (!content) {
          renderedHTML.value = '<p>文件未找到: ' + esc(path) + '</p>';
          tocHeadings.value = [];
          return;
        }

        var result = renderMarkdown(content);
        renderedHTML.value = result.html;
        tocHeadings.value = result.headings;
        tocVisible.value = result.headings.length > 0;

        // Save progress
        saveProgressData(path, { read: true, lastTime: Date.now() });
        progress.value = getProgress();

        // Scroll to saved position
        nextTick(function () {
          var el = contentEl.value;
          if (!el) return;
          var prog = progress.value[path];
          if (prog && prog.scrollPos) el.scrollTop = prog.scrollPos;
          else el.scrollTop = 0;
        });

        location.hash = '#file/' + encodeURIComponent(path);
      }

      function openNovelChapter(chapterPath) {
        novelMode.value = true;
        for (var vi = 0; vi < DATA.volumes.length; vi++) {
          var vol = DATA.volumes[vi];
          var ci = vol.chapters.indexOf(chapterPath);
          if (ci >= 0) { currentVolIdx.value = vi; currentChIdx.value = ci; break; }
        }
        var fpath = '小说/' + chapterPath + '.md';
        currentFile.value = fpath;
        view.value = 'file';

        var content = DATA.files[fpath];
        if (!content) {
          renderedHTML.value = '<p>章节未找到</p>';
          tocHeadings.value = [];
          return;
        }

        var result = renderMarkdown(content);
        renderedHTML.value = result.html;
        tocHeadings.value = result.headings;
        tocVisible.value = result.headings.length > 0;

        saveProgressData(fpath, { read: true, lastTime: Date.now() });
        progress.value = getProgress();

        nextTick(function () {
          if (contentEl.value) contentEl.value.scrollTop = 0;
        });

        location.hash = '#novel/' + encodeURIComponent(chapterPath);
      }

      function navChapter(dir) {
        if (!novelMode.value || currentVolIdx.value === null) return;
        var globalIdx = 0;
        for (var i = 0; i < currentVolIdx.value; i++) globalIdx += DATA.volumes[i].chapters.length;
        globalIdx += currentChIdx.value;
        var newIdx = globalIdx + dir;
        if (newIdx < 0 || newIdx >= allChapters.length) return;
        openNovelChapter(allChapters[newIdx]);
      }

      function showWikiCategory(cat) {
        wikiCategory.value = cat;
        view.value = 'wiki';
        tab.value = 'wiki';
        location.hash = '#wiki/' + encodeURIComponent(cat);
      }

      /* ── 搜索 ── */
      function doSearch() {
        var q = searchQuery.value.trim().toLowerCase();
        if (!q) { searchResults.value = []; return; }
        var matches = [];
        Object.keys(DATA.files).forEach(function (path) {
          var nameMatch = path.toLowerCase().indexOf(q) >= 0;
          var content = DATA.files[path];
          var lines = content.split('\n');
          var lineMatches = [];
          for (var i = 0; i < lines.length && lineMatches.length < 3; i++) {
            if (lines[i].toLowerCase().indexOf(q) >= 0) {
              lineMatches.push({ num: i + 1, text: lines[i] });
            }
          }
          if (nameMatch || lineMatches.length) {
            matches.push({ path: path, nameMatch: nameMatch, lines: lineMatches });
          }
        });
        matches.sort(function (a, b) { return (b.nameMatch ? 1 : 0) - (a.nameMatch ? 1 : 0); });
        searchResults.value = matches.slice(0, 30);
      }
      var doSearchDebounced = debounce(doSearch, 200);

      function highlightText(text, q) {
        if (!q) return esc(text);
        var escaped = esc(text);
        var regex = new RegExp('(' + q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
      }

      function truncate(s, len) { return s.length > len ? s.slice(0, len) + '...' : s; }

      /* ── 主题 ── */
      function toggleTheme() {
        theme.value = theme.value === 'dark' ? '' : 'dark';
        document.documentElement.setAttribute('data-theme', theme.value);
        lsSet('aibot_theme', theme.value);
      }

      function changeFontSize(delta) {
        fontSize.value = clamp(fontSize.value + delta, 12, 24);
        document.documentElement.style.setProperty('--font-size', fontSize.value + 'px');
        lsSet('aibot_fontsize', fontSize.value);
      }

      /* ── 阅读模式 ── */
      function toggleReadingMode() {
        if (readingMode.value) {
          readingMode.value = false;
        } else {
          openReading();
        }
      }

      function openReading() {
        if (!currentFile.value) return;
        var content = DATA.files[currentFile.value];
        if (!content) return;
        var result = renderMarkdown(content);
        readingHTML.value = result.html;
        readingMode.value = true;
        readingScrollPct.value = 0;
        nextTick(function () {
          if (readingBody.value) readingBody.value.scrollTop = 0;
        });
      }

      function cycleReadingWidth() {
        var cycle = { normal: 'wide', wide: 'full', full: 'normal' };
        readingWidth.value = cycle[readingWidth.value] || 'normal';
        lsSet('aibot_rwidth', readingWidth.value);
      }

      function cycleReadingTheme() {
        var cycle = { '': 'sepia', sepia: 'green', green: 'dark', dark: '' };
        readingTheme.value = cycle[readingTheme.value] || '';
        lsSet('aibot_rtheme', readingTheme.value);
      }

      function onReadingScroll() {
        var el = readingBody.value;
        if (!el) return;
        var pct = el.scrollHeight <= el.clientHeight ? 100 : (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
        readingScrollPct.value = pct;
      }

      /* ── 内容滚动 ── */
      function onContentScroll() {
        var el = contentEl.value;
        if (!el) return;

        // Progress bar
        if (el.scrollHeight > el.clientHeight) {
          scrollPct.value = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
        }

        // Save scroll position
        if (currentFile.value) {
          saveProgressData(currentFile.value, { scrollPos: el.scrollTop });
        }

        // Auto-mark as read at 80%
        if (currentFile.value && scrollPct.value > 80) {
          saveProgressData(currentFile.value, { read: true, lastTime: Date.now() });
          progress.value = getProgress();
        }

        // TOC highlight
        highlightTOC(el);
      }

      function highlightTOC(container) {
        var headings = container.querySelectorAll('.md-body h1, .md-body h2, .md-body h3, .md-body h4');
        var current = '';
        headings.forEach(function (h) {
          if (h.offsetTop - 80 <= container.scrollTop) current = h.id;
        });
        activeTocSlug.value = current;
      }

      function scrollToHeading(slug) {
        var el = document.getElementById(slug);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      /* ── 角色图谱 ── */
      function initGraph() {
        nextTick(function () {
          var canvas = graphCanvas.value;
          if (!canvas) return;
          var container = canvas.parentElement;
          canvas.width = container.clientWidth || 800;
          canvas.height = container.clientHeight || 600;
          if (graphInstance.value) graphInstance.value.destroy();
          graphInstance.value = createGraph(canvas, theme, function (node) {
            charDetail.value = node;
          });
        });
      }

      function highlightCharNode(name) {
        if (graphInstance.value) graphInstance.value.highlightNode(name);
        else {
          switchTab('characters');
          nextTick(function () {
            if (graphInstance.value) graphInstance.value.highlightNode(name);
          });
        }
      }

      function openCharArchive(name) {
        // 名字到文件名的映射（处理特殊情况）
        var nameMap = {
          '司衡·岚': '司衡岚',
          '鸣海·枫': '鸣海枫',
          '施言·白垣': '白垣',
          '土御门·澄夜': '澄夜'
        };
        var fileName = nameMap[name] || name;
        var archivePath = '角色/档案/' + fileName + '.md';
        if (DATA.files[archivePath]) {
          openFile(archivePath);
          tab.value = 'files';
        }
      }

      /* ── Hash 路由 ── */
      function handleHash() {
        var h = location.hash.slice(1);
        if (!h) { switchTab('home'); return; }
        var parts = h.split('/');
        var cmd = decodeURIComponent(parts[0]);
        var arg = parts.slice(1).map(decodeURIComponent).join('/');
        if (cmd === 'file' && arg) { tab.value = 'files'; openFile(arg); }
        else if (cmd === 'novel' && arg) { tab.value = 'novels'; openNovelChapter(arg); }
        else if (cmd === 'search' && arg) { tab.value = 'search'; searchQuery.value = arg; doSearch(); }
        else if (cmd === 'timeline') { switchTab('timeline'); }
        else if (cmd === 'wiki') { tab.value = 'wiki'; view.value = 'wiki'; if (arg) wikiCategory.value = arg; }
        else if (cmd === 'char' && arg) { switchTab('characters'); nextTick(function () { highlightCharNode(arg); }); }
        else if (cmd === 'factions') { switchTab('factions'); }
        else if (cmd === 'stats') { switchTab('stats'); }
        else { switchTab('home'); }
      }

      /* ── 键盘快捷键 ── */
      function handleKey(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
          e.preventDefault();
          switchTab('search');
        } else if (e.key === 'Escape') {
          if (readingMode.value) { readingMode.value = false; return; }
          if (showHelp.value) { showHelp.value = false; return; }
          if (charDetail.value) { charDetail.value = null; return; }
          mobileOpen.value = false;
          location.hash = '';
          switchTab('home');
        } else if (e.key === 'ArrowLeft') { navChapter(-1); }
        else if (e.key === 'ArrowRight') { navChapter(1); }
        else if (e.ctrlKey && e.key === 'r') { e.preventDefault(); toggleReadingMode(); }
        else if (e.key === '+' || e.key === '=') { changeFontSize(2); }
        else if (e.key === '-') { changeFontSize(-2); }
        else if (e.key === '?') { showHelp.value = !showHelp.value; }
        else if (e.key === 'H' || e.key === 'h') { switchTab('home'); location.hash = ''; }
      }

      /* ── 生命周期 ── */
      onMounted(function () {
        // Apply theme
        document.documentElement.setAttribute('data-theme', theme.value);
        document.documentElement.style.setProperty('--font-size', fontSize.value + 'px');

        // Keyboard
        document.addEventListener('keydown', handleKey);

        // Hash routing
        handleHash();
        window.addEventListener('hashchange', handleHash);
      });

      onUnmounted(function () {
        document.removeEventListener('keydown', handleKey);
        window.removeEventListener('hashchange', handleHash);
        if (graphInstance.value) graphInstance.value.destroy();
      });

      /* ── Watch ── */
      watch(readingFontSize, function (v) { lsSet('aibot_rfontsize', v); });

      // Sync sidebar state to body for CSS selectors like body.sidebar-collapsed
      watch(sidebarCollapsed, function (v) {
        document.body.classList.toggle('sidebar-collapsed', v);
        lsSet('aibot_sidebar', v ? '1' : '0');
      }, { immediate: true });

      watch(mobileOpen, function (v) {
        document.body.classList.toggle('sidebar-open', v);
      });

      return {
        /* 数据 */
        DATA: DATA,
        tabs: tabs,
        groupColors: GROUP_COLORS,
        novelTotalChars: novelTotalChars,

        /* 状态 */
        tab: tab,
        view: view,
        theme: theme,
        fontSize: fontSize,
        sidebarCollapsed: sidebarCollapsed,
        mobileOpen: mobileOpen,
        currentFile: currentFile,
        novelMode: novelMode,
        showHelp: showHelp,
        fileFilter: fileFilter,
        searchQuery: searchQuery,
        searchResults: searchResults,
        tlFilter: tlFilter,
        wikiCategory: wikiCategory,
        charDetail: charDetail,
        progress: progress,
        expanded: expanded,
        renderedHTML: renderedHTML,
        tocHeadings: tocHeadings,
        tocVisible: tocVisible,
        activeTocSlug: activeTocSlug,
        scrollPct: scrollPct,

        /* 阅读模式 */
        readingMode: readingMode,
        readingFontSize: readingFontSize,
        readingTheme: readingTheme,
        readingWidth: readingWidth,
        readingScrollPct: readingScrollPct,
        readingHTML: readingHTML,
        readingMaxWidth: readingMaxWidth,
        readingWidthLabel: readingWidthLabel,
        readingThemeLabel: readingThemeLabel,
        readingTitle: readingTitle,
        readingCharsText: readingCharsText,
        readingTimeText: readingTimeText,

        /* 计算属性 */
        totalChapters: totalChapters,
        readCount: readCount,
        lastReadFile: lastReadFile,
        lastReadName: lastReadName,
        filteredTimeline: filteredTimeline,
        charRelations: charRelations,
        maxVolChars: maxVolChars,
        maxChapterChars: maxChapterChars,
        sortedChapters: sortedChapters,
        chapterProgressText: chapterProgressText,
        canPrevChapter: canPrevChapter,
        canNextChapter: canNextChapter,

        /* refs */
        contentEl: contentEl,
        graphCanvas: graphCanvas,
        readingBody: readingBody,
        searchInput: searchInput,

        /* 方法 */
        formatNum: formatNum,
        formatChars: formatChars,
        chapterName: chapterName,
        isRead: isRead,
        volColor: volColor,
        volReadPct: volReadPct,
        toggleExpand: toggleExpand,
        switchTab: switchTab,
        openFile: openFile,
        openNovelChapter: openNovelChapter,
        navChapter: navChapter,
        showWikiCategory: showWikiCategory,
        toggleTheme: toggleTheme,
        changeFontSize: changeFontSize,
        toggleReadingMode: toggleReadingMode,
        cycleReadingWidth: cycleReadingWidth,
        cycleReadingTheme: cycleReadingTheme,
        onReadingScroll: onReadingScroll,
        onContentScroll: onContentScroll,
        scrollToHeading: scrollToHeading,
        highlightCharNode: highlightCharNode,
        openCharArchive: openCharArchive,
        highlightText: highlightText,
        truncate: truncate,
        doSearchDebounced: doSearchDebounced,
        initGraph: initGraph,
        bookmarks: bookmarks,
        addBookmark: addBookmark,
        removeBookmark: removeBookmark,
        loadBookmark: loadBookmark
      };
    }
  });

  /* 注册 TreeNode 组件 */
  app.component('tree-node', TreeNode);

  /* 挂载 */
  app.mount('#app');

})();
