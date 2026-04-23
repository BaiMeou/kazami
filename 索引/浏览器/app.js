/* AIbot 项目浏览器 — 应用逻辑 */
/* 运行于 file:// 协议，不使用 ES modules / fetch */

(function () {
  'use strict';

  var D = window.APP_DATA;
  var FILES = D.files;
  var TREE = D.tree;
  var STATS = D.stats;
  var VOLUMES = D.volumes;
  var CHARS = D.characters;
  var KEYWORDS = D.worldKeywords;

  // ===== 全局状态 =====
  var state = {
    currentFile: null,
    currentTab: 'home',
    novelMode: false,      // 是否在小说阅读流程中
    readingMode: false,
    allChapters: [],        // 扁平化的章节路径列表
  };

  // 构建扁平章节列表
  VOLUMES.forEach(function (v) {
    v.chapters.forEach(function (ch) {
      state.allChapters.push('小说/' + ch + '.md');
    });
  });

  // ===== DOM 引用 =====
  var $ = function (id) { return document.getElementById(id); };
  var contentEl = $('content');
  var contentScroll = $('content-scroll');
  var breadcrumbEl = $('breadcrumb');
  var headerActions = $('header-actions');
  var tocEl = $('toc');
  var readingOverlay = $('reading-overlay');
  var readingTitle = $('reading-title');
  var readingBody = $('reading-body');
  var shortcutsModal = $('shortcuts-modal');

  // ===== Markdown 渲染器 =====
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMarkdown(md) {
    var html = md;

    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code>' + escapeHtml(code.trimEnd()) + '</code></pre>';
    });

    // 行内代码
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 表格
    html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, function (_, header, sep, body) {
      var heads = header.split('|').slice(1, -1).map(function (h) { return '<th>' + h.trim() + '</th>'; }).join('');
      var rows = body.trim().split('\n').map(function (row) {
        var cells = row.split('|').slice(1, -1).map(function (c) { return '<td>' + c.trim() + '</td>'; }).join('');
        return '<tr>' + cells + '</tr>';
      }).join('');
      return '<table><thead><tr>' + heads + '</tr></thead><tbody>' + rows + '</tbody></table>';
    });

    // 标题 (加 id 用于 TOC 锚点)
    html = html.replace(/^#### (.+)$/gm, function (_, t) { return '<h4 id="' + slugify(t) + '">' + t + '</h4>'; });
    html = html.replace(/^### (.+)$/gm, function (_, t) { return '<h3 id="' + slugify(t) + '">' + t + '</h3>'; });
    html = html.replace(/^## (.+)$/gm, function (_, t) { return '<h2 id="' + slugify(t) + '">' + t + '</h2>'; });
    html = html.replace(/^# (.+)$/gm, function (_, t) { return '<h1 id="' + slugify(t) + '">' + t + '</h1>'; });

    // 引用块
    html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

    // 水平线
    html = html.replace(/^---+$/gm, '<hr>');

    // 粗体和斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 无序列表
    html = html.replace(/^(\s*)[-*] (.+)$/gm, function (_, indent, text) {
      return indent + '<li>' + text + '</li>';
    });
    html = html.replace(/((?:^<li>.*<\/li>\n?)+)/gm, '<ul>$1</ul>');

    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, function (match) {
      return '<ol>' + match.replace(/<\/?oli>/g, function (t) { return t.replace('oli', 'li'); }) + '</ol>';
    });

    // 段落
    var lines = html.split('\n');
    var result = [];
    var inPre = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('<pre>') !== -1) inPre = true;
      if (line.indexOf('</pre>') !== -1) { inPre = false; result.push(line); continue; }
      if (inPre) { result.push(line); continue; }
      if (line.trim() === '') { result.push(''); continue; }
      if (/^<[a-z]/.test(line.trim())) { result.push(line); continue; }
      if (!/^</.test(line.trim())) {
        result.push('<p>' + line + '</p>');
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  var slugCounter = {};
  function slugify(text) {
    var base = text.replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    if (!base) base = 'heading';
    if (slugCounter[base] === undefined) {
      slugCounter[base] = 0;
      return base;
    }
    slugCounter[base]++;
    return base + '-' + slugCounter[base];
  }

  function resetSlugs() { slugCounter = {}; }

  // ===== 标签页切换 =====
  var tabBtns = document.querySelectorAll('.tab-btn');
  var tabPanels = document.querySelectorAll('.tab-panel');

  function switchTab(tabName) {
    state.currentTab = tabName;
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === tabName);
    }
    for (var j = 0; j < tabPanels.length; j++) {
      tabPanels[j].classList.toggle('active', tabPanels[j].id === 'panel-' + tabName);
    }
    if (tabName === 'search') {
      setTimeout(function () { $('search-input').focus(); }, 50);
    }
  }

  for (var i = 0; i < tabBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    })(tabBtns[i]);
  }

  // ===== 首页面板 =====
  function renderHomeSidebar() {
    var h = '';

    // 统计
    h += '<h2>项目概况</h2>';
    h += '<div class="stats-mini">';
    h += '<div class="stat-mini"><div class="num">' + STATS.total_files + '</div><div class="lbl">活跃文件</div></div>';
    h += '<div class="stat-mini"><div class="num">' + STATS.total_lines.toLocaleString() + '</div><div class="lbl">总行数</div></div>';
    h += '</div>';

    // 角色
    h += '<h2>角色</h2>';
    CHARS.forEach(function (c) {
      h += '<div class="char-mini" onclick="APP.showCharacter(\'' + c.name + '\')">';
      h += '<div class="name">' + c.name + '</div>';
      h += '<div class="tag">' + c.species + ' · ' + c.age + '岁</div>';
      h += '<div class="desc">' + c.trait + '</div>';
      h += '</div>';
    });

    // 卷
    h += '<h2>故事</h2>';
    VOLUMES.forEach(function (v) {
      h += '<div class="vol-card" style="border-left-color:' + v.color + '" onclick="APP.openVolume(\'' + v.id + '\')">';
      h += '<div class="vol-title">' + v.id + '：' + v.title + '</div>';
      h += '<div class="vol-sub">' + v.subtitle + '</div>';
      h += '<div class="vol-meta"><span>' + v.time + '</span><span>' + v.chapters.length + '章</span></div>';
      h += '</div>';
    });

    // 关键词
    h += '<h2>世界观</h2>';
    h += '<div class="kw-wrap">';
    KEYWORDS.forEach(function (k) {
      h += '<span class="kw-tag">' + k + '</span>';
    });
    h += '</div>';

    $('home-content').innerHTML = h;
  }

  // ===== 仪表盘 (主内容区首页) =====
  function showDashboard() {
    state.currentFile = null;
    state.novelMode = false;
    breadcrumbEl.innerHTML = '<span class="bc-current">首页仪表盘</span>';
    headerActions.innerHTML = '';
    tocEl.classList.remove('visible');

    var h = '<div class="dashboard">';
    h += '<h1>AIbot 项目仪表盘</h1>';
    h += '<div class="dash-desc">AI 角色扮演 + 世界观构建项目 · AstrBot/QQ 平台</div>';

    // 统计
    h += '<div class="dash-stats">';
    h += '<div class="dash-stat"><div class="num">' + STATS.total_files + '</div><div class="lbl">活跃文件</div></div>';
    h += '<div class="dash-stat"><div class="num">' + STATS.total_lines.toLocaleString() + '</div><div class="lbl">总行数</div></div>';
    var mods = STATS.modules;
    for (var mod in mods) {
      h += '<div class="dash-stat"><div class="num">' + mods[mod].files + '</div><div class="lbl">' + mod + '/</div></div>';
    }
    h += '</div>';

    // 角色
    h += '<div class="dash-section"><h2>核心角色</h2><div class="dash-chars">';
    CHARS.forEach(function (c) {
      h += '<div class="dash-char">';
      h += '<h3>' + c.name + '</h3>';
      h += '<div class="species">' + c.species + ' · ' + c.age + '岁</div>';
      h += '<div class="trait">' + c.trait + '</div>';
      h += '<div class="relation">' + c.relation + '</div>';
      h += '<p>' + c.desc + '</p>';
      h += '</div>';
    });
    h += '</div></div>';

    // 故事概览
    h += '<div class="dash-section"><h2>故事概览</h2><div class="dash-volumes">';
    VOLUMES.forEach(function (v) {
      h += '<div class="dash-vol" style="border-left-color:' + v.color + '" onclick="APP.openVolume(\'' + v.id + '\')">';
      h += '<div class="dv-header"><span class="dv-id">' + v.id + '</span><span class="dv-title">' + v.title + '</span></div>';
      h += '<div class="dv-sub">' + v.subtitle + '</div>';
      h += '<div class="dv-meta"><span>' + v.time + '</span><span>' + v.chapters.length + ' 章</span></div>';
      h += '</div>';
    });
    h += '</div></div>';

    // 世界观关键词
    h += '<div class="dash-section"><h2>世界观关键词</h2><div class="dash-keywords">';
    KEYWORDS.forEach(function (k) {
      h += '<span class="dash-kw">' + k + '</span>';
    });
    h += '</div></div>';

    h += '</div>';
    contentEl.innerHTML = h;
    contentScroll.scrollTop = 0;
    updateHash('');
  }

  // ===== 显示角色详情 =====
  function showCharacter(name) {
    // 查找角色设定文件
    var path = '角色/' + name + '.md';
    if (FILES[path]) {
      showFile(path);
      switchTab('files');
    }
  }

  // ===== 文件树 =====
  function renderTree(tree, container, prefix) {
    var dirs = [];
    var files = [];

    for (var name in tree) {
      if (tree[name] === null) files.push(name);
      else dirs.push(name);
    }

    dirs.sort();
    files.sort();

    dirs.forEach(function (dir) {
      var dirEl = document.createElement('div');

      var label = document.createElement('div');
      label.className = 'tree-dir-label';
      label.innerHTML = '<span class="arrow open">\u25B6</span><span class="dir-name">' + dir + '</span>';

      var children = document.createElement('div');
      children.className = 'tree-children';

      label.addEventListener('click', function () {
        children.classList.toggle('collapsed');
        label.querySelector('.arrow').classList.toggle('open');
      });

      dirEl.appendChild(label);
      dirEl.appendChild(children);
      container.appendChild(dirEl);

      renderTree(tree[dir], children, prefix ? prefix + '/' + dir : dir);
    });

    files.forEach(function (file) {
      var fileEl = document.createElement('div');
      fileEl.className = 'tree-file';
      fileEl.textContent = file;
      var fullPath = prefix ? prefix + '/' + file : file;
      fileEl.setAttribute('data-path', fullPath);
      fileEl.addEventListener('click', function () {
        showFile(fullPath);
      });
      container.appendChild(fileEl);
    });
  }

  function highlightTreeFile(path) {
    var all = document.querySelectorAll('.tree-file.active');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    if (!path) return;
    var el = document.querySelector('.tree-file[data-path="' + CSS.escape(path) + '"]');
    if (el) {
      el.classList.add('active');
      // 展开父目录
      var parent = el.parentElement;
      while (parent && parent.id !== 'tree-container') {
        if (parent.classList.contains('tree-children')) {
          parent.classList.remove('collapsed');
          var arrow = parent.previousElementSibling;
          if (arrow) {
            var a = arrow.querySelector('.arrow');
            if (a) a.classList.add('open');
          }
        }
        parent = parent.parentElement;
      }
    }
  }

  // 文件过滤
  $('file-filter-input').addEventListener('input', function () {
    var query = this.value.trim().toLowerCase();
    var items = document.querySelectorAll('#tree-container .tree-file');
    var dirs = document.querySelectorAll('#tree-container .tree-dir-label');

    if (!query) {
      for (var i = 0; i < items.length; i++) items[i].style.display = '';
      for (var j = 0; j < dirs.length; j++) dirs[j].parentElement.style.display = '';
      return;
    }

    for (var k = 0; k < items.length; k++) {
      var path = items[k].getAttribute('data-path').toLowerCase();
      items[k].style.display = path.indexOf(query) !== -1 ? '' : 'none';
    }
    // 显示包含可见文件的目录
    for (var m = 0; m < dirs.length; m++) {
      var dirContainer = dirs[m].parentElement;
      var children = dirContainer.querySelector('.tree-children');
      if (children) {
        var hasVisible = children.querySelector('.tree-file:not([style*="display: none"])');
        dirContainer.style.display = hasVisible ? '' : 'none';
        if (hasVisible) children.classList.remove('collapsed');
      }
    }
  });

  // ===== 显示文件 =====
  function showFile(path) {
    var content = FILES[path];
    if (content === undefined) return;

    state.currentFile = path;
    highlightTreeFile(path);

    // 面包屑
    var parts = path.split('/');
    var bc = '';
    for (var i = 0; i < parts.length; i++) {
      if (i < parts.length - 1) {
        bc += '<span class="bc-part">' + parts[i] + '</span><span class="bc-sep">/</span>';
      } else {
        bc += '<span class="bc-current">' + parts[i] + '</span>';
      }
    }
    breadcrumbEl.innerHTML = bc;

    // 头部操作按钮
    headerActions.innerHTML =
      '<button class="header-btn" onclick="APP.openReading()">阅读模式</button>';

    // 渲染内容
    resetSlugs();
    contentEl.innerHTML = '<div class="md-content">' + renderMarkdown(content) + '</div>';

    // 小说章节导航
    if (state.novelMode) {
      appendChapterNav(path);
    }

    // TOC
    buildToc(content);

    contentScroll.scrollTop = 0;
    updateHash('file/' + path);

    // 高亮小说章节
    highlightNovelChapter(path);
  }

  // ===== TOC 目录 =====
  function buildToc(md) {
    var headings = [];
    var lines = md.split('\n');
    resetSlugs();
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(#{1,3}) (.+)$/);
      if (m) {
        headings.push({ level: m[1].length, text: m[2], id: slugify(m[2]) });
      }
    }

    if (headings.length < 3) {
      tocEl.classList.remove('visible');
      return;
    }

    tocEl.classList.add('visible');
    var h = '<h3>目录</h3>';
    headings.forEach(function (item) {
      h += '<div class="toc-item toc-h' + item.level + '" data-target="' + item.id + '">' + item.text + '</div>';
    });
    tocEl.innerHTML = h;

    // 点击跳转
    var tocItems = tocEl.querySelectorAll('.toc-item');
    for (var j = 0; j < tocItems.length; j++) {
      (function (el) {
        el.addEventListener('click', function () {
          var target = document.getElementById(el.getAttribute('data-target'));
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      })(tocItems[j]);
    }

    // 滚动高亮
    contentScroll.addEventListener('scroll', updateTocHighlight);
  }

  function updateTocHighlight() {
    var items = tocEl.querySelectorAll('.toc-item');
    if (!items.length) return;
    var scrollTop = contentScroll.scrollTop + 80;
    var activeId = null;

    var headings = contentEl.querySelectorAll('h1[id], h2[id], h3[id]');
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].offsetTop <= scrollTop) {
        activeId = headings[i].id;
      }
    }

    for (var j = 0; j < items.length; j++) {
      items[j].classList.toggle('active', items[j].getAttribute('data-target') === activeId);
    }
  }

  // ===== 小说面板 =====
  function renderNovelList() {
    var h = '';
    VOLUMES.forEach(function (v) {
      h += '<div class="novel-vol">';
      h += '<div class="novel-vol-header" style="border-left-color:' + v.color + '" data-vol="' + v.id + '">';
      h += '<span class="vol-arrow open">\u25B6</span>';
      h += '<span class="vol-name">' + v.id + '：' + v.title + '</span>';
      h += '<span class="vol-count">' + v.chapters.length + '章</span>';
      h += '</div>';
      h += '<div class="novel-chapters" data-vol-chapters="' + v.id + '">';
      v.chapters.forEach(function (ch) {
        var fullPath = '小说/' + ch + '.md';
        var chName = ch.split('/').pop().replace(/_/g, ' ');
        h += '<div class="novel-ch" data-novel-path="' + fullPath + '">' + chName + '</div>';
      });
      h += '</div></div>';
    });
    $('novel-list').innerHTML = h;

    // 绑定事件
    var volHeaders = document.querySelectorAll('.novel-vol-header');
    for (var i = 0; i < volHeaders.length; i++) {
      (function (header) {
        header.addEventListener('click', function () {
          var volId = header.getAttribute('data-vol');
          var chapters = document.querySelector('[data-vol-chapters="' + volId + '"]');
          chapters.classList.toggle('collapsed');
          header.querySelector('.vol-arrow').classList.toggle('open');
        });
      })(volHeaders[i]);
    }

    var chItems = document.querySelectorAll('.novel-ch');
    for (var j = 0; j < chItems.length; j++) {
      (function (el) {
        el.addEventListener('click', function () {
          state.novelMode = true;
          showFile(el.getAttribute('data-novel-path'));
        });
      })(chItems[j]);
    }
  }

  function highlightNovelChapter(path) {
    var all = document.querySelectorAll('.novel-ch.active');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    if (!path) return;
    var el = document.querySelector('.novel-ch[data-novel-path="' + CSS.escape(path) + '"]');
    if (el) el.classList.add('active');
  }

  function openVolume(volId) {
    switchTab('novel');
    // 展开对应卷，折叠其他
    VOLUMES.forEach(function (v) {
      var chapters = document.querySelector('[data-vol-chapters="' + v.id + '"]');
      var header = document.querySelector('.novel-vol-header[data-vol="' + v.id + '"]');
      if (!chapters || !header) return;
      if (v.id === volId) {
        chapters.classList.remove('collapsed');
        header.querySelector('.vol-arrow').classList.add('open');
      } else {
        chapters.classList.add('collapsed');
        header.querySelector('.vol-arrow').classList.remove('open');
      }
    });
    // 打开第一章
    var vol = VOLUMES.filter(function (v) { return v.id === volId; })[0];
    if (vol && vol.chapters.length > 0) {
      state.novelMode = true;
      showFile('小说/' + vol.chapters[0] + '.md');
    }
  }

  // 章节导航
  function appendChapterNav(path) {
    var idx = state.allChapters.indexOf(path);
    if (idx === -1) return;

    var prevPath = idx > 0 ? state.allChapters[idx - 1] : null;
    var nextPath = idx < state.allChapters.length - 1 ? state.allChapters[idx + 1] : null;

    var nav = document.createElement('div');
    nav.className = 'chapter-nav';

    var prevBtn = '<button class="chapter-nav-btn' + (prevPath ? '' : ' disabled') + '" ' +
      (prevPath ? 'onclick="APP.navChapter(\'' + prevPath + '\')"' : '') +
      '>\u2190 上一章</button>';

    var nextBtn = '<button class="chapter-nav-btn' + (nextPath ? '' : ' disabled') + '" ' +
      (nextPath ? 'onclick="APP.navChapter(\'' + nextPath + '\')"' : '') +
      '>下一章 \u2192</button>';

    var info = '<span class="chapter-nav-info">' + (idx + 1) + ' / ' + state.allChapters.length + '</span>';

    nav.innerHTML = prevBtn + info + nextBtn;
    contentEl.appendChild(nav);
  }

  function navChapter(path) {
    state.novelMode = true;
    showFile(path);
  }

  function navPrev() {
    if (!state.novelMode || !state.currentFile) return;
    var idx = state.allChapters.indexOf(state.currentFile);
    if (idx > 0) showFile(state.allChapters[idx - 1]);
  }

  function navNext() {
    if (!state.novelMode || !state.currentFile) return;
    var idx = state.allChapters.indexOf(state.currentFile);
    if (idx >= 0 && idx < state.allChapters.length - 1) showFile(state.allChapters[idx + 1]);
  }

  // ===== 搜索 =====
  var searchInput = $('search-input');
  var searchResults = $('search-results');
  var searchStatus = $('search-status');
  var searchTimeout;

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(doSearch, 200);
  });

  function doSearch() {
    var query = searchInput.value.trim();
    if (!query) {
      searchResults.innerHTML = '';
      searchStatus.textContent = '';
      return;
    }

    var queryLower = query.toLowerCase();
    var results = [];

    for (var path in FILES) {
      var content = FILES[path];
      var contentLines = content.split('\n');
      var matches = [];

      // 文件名匹配
      var pathMatch = path.toLowerCase().indexOf(queryLower) !== -1;

      // 内容匹配
      for (var i = 0; i < contentLines.length; i++) {
        if (contentLines[i].toLowerCase().indexOf(queryLower) !== -1) {
          matches.push({ line: i + 1, text: contentLines[i] });
          if (matches.length >= 5) break; // 每文件最多5条
        }
      }

      if (pathMatch || matches.length > 0) {
        results.push({ path: path, pathMatch: pathMatch, matches: matches });
      }
    }

    // 路径匹配优先，然后按匹配数排序
    results.sort(function (a, b) {
      if (a.pathMatch !== b.pathMatch) return b.pathMatch ? 1 : -1;
      return b.matches.length - a.matches.length;
    });

    var totalMatches = results.reduce(function (sum, r) { return sum + r.matches.length; }, 0);
    searchStatus.textContent = results.length + ' 个文件, ' + totalMatches + ' 处匹配';

    var h = '';
    results.slice(0, 30).forEach(function (r) {
      h += '<div class="search-file-group">';
      h += '<div class="search-file-header" onclick="APP.showFile(\'' + escapeAttr(r.path) + '\')">';
      h += '<span>' + highlightText(r.path, query) + '</span>';
      h += '<span class="match-count">' + r.matches.length + '</span>';
      h += '</div>';
      r.matches.forEach(function (m) {
        h += '<div class="search-match" onclick="APP.showFileAtLine(\'' + escapeAttr(r.path) + '\',' + m.line + ')">';
        h += '<span class="line-num">L' + m.line + '</span>';
        h += '<span class="line-text">' + highlightText(truncate(m.text.trim(), 80), query) + '</span>';
        h += '</div>';
      });
      h += '</div>';
    });

    if (results.length === 0) {
      h = '<div class="empty-state"><p>未找到匹配结果</p></div>';
    }

    searchResults.innerHTML = h;
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var queryEscaped = escapeHtml(query);
    var re = new RegExp('(' + queryEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function showFileAtLine(path, line) {
    showFile(path);
    // 尝试滚动到对应行 (近似)
    setTimeout(function () {
      var allP = contentEl.querySelectorAll('p, li, h1, h2, h3, h4, tr, blockquote');
      if (line - 1 < allP.length) {
        allP[Math.max(0, line - 2)].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // ===== 阅读模式 =====
  function openReading() {
    if (!state.currentFile) return;
    var content = FILES[state.currentFile];
    if (!content) return;

    state.readingMode = true;
    readingTitle.textContent = state.currentFile.split('/').pop();
    resetSlugs();
    readingBody.innerHTML = renderMarkdown(content);
    readingOverlay.classList.add('active');
    readingOverlay.scrollTop = 0;
  }

  function closeReading() {
    state.readingMode = false;
    readingOverlay.classList.remove('active');
  }

  // ===== 快捷键帮助 =====
  function showShortcuts() {
    shortcutsModal.classList.add('active');
  }
  function hideShortcuts() {
    shortcutsModal.classList.remove('active');
  }
  shortcutsModal.addEventListener('click', function (e) {
    if (e.target === shortcutsModal) hideShortcuts();
  });

  // ===== URL Hash 路由 =====
  function updateHash(hash) {
    if (history.replaceState) {
      history.replaceState(null, '', hash ? '#' + hash : window.location.pathname);
    }
  }

  function handleHash() {
    var hash = window.location.hash.slice(1);
    if (!hash) {
      showDashboard();
      return;
    }

    if (hash.indexOf('file/') === 0) {
      var path = decodeURIComponent(hash.slice(5));
      if (FILES[path]) {
        // 判断是否小说
        if (path.indexOf('小说/') === 0) {
          state.novelMode = true;
          switchTab('novel');
        } else {
          switchTab('files');
        }
        showFile(path);
      } else {
        showDashboard();
      }
    } else if (hash.indexOf('novel/') === 0) {
      var volId = decodeURIComponent(hash.slice(6));
      openVolume(volId);
    } else if (hash.indexOf('search/') === 0) {
      var query = decodeURIComponent(hash.slice(7));
      switchTab('search');
      searchInput.value = query;
      doSearch();
    } else {
      showDashboard();
    }
  }

  window.addEventListener('hashchange', handleHash);

  // ===== 键盘快捷键 =====
  document.addEventListener('keydown', function (e) {
    // 忽略输入框中的按键 (除了 Esc)
    var isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.readingMode) { closeReading(); return; }
      if (shortcutsModal.classList.contains('active')) { hideShortcuts(); return; }
      if (isInput) { e.target.blur(); return; }
      showDashboard();
      switchTab('home');
      return;
    }

    if (isInput) return;

    if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
      e.preventDefault();
      switchTab('search');
      return;
    }

    if (e.key === '?' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      showShortcuts();
      return;
    }

    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      if (state.readingMode) closeReading();
      else openReading();
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (state.novelMode) { e.preventDefault(); navPrev(); }
      return;
    }
    if (e.key === 'ArrowRight') {
      if (state.novelMode) { e.preventDefault(); navNext(); }
      return;
    }
  });

  // ===== 初始化 =====
  renderHomeSidebar();
  renderTree(TREE, $('tree-container'), '');
  renderNovelList();

  // 处理初始 hash
  if (window.location.hash) {
    handleHash();
  } else {
    showDashboard();
  }

  // ===== 暴露全局 API =====
  window.APP = {
    showFile: showFile,
    showFileAtLine: showFileAtLine,
    showCharacter: showCharacter,
    openVolume: openVolume,
    navChapter: navChapter,
    openReading: openReading,
    closeReading: closeReading,
  };

})();
