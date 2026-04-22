#!/usr/bin/env python3
"""AIbot 项目浏览器构建脚本

遍历项目目录，读取所有 Markdown 文件，生成一个自包含的 HTML 仪表盘。
仅依赖 Python 标准库。

用法：python 构建网页.py
输出：索引/浏览器.html
"""

import json
import os
import sys
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).parent.resolve()
OUTPUT = ROOT / "索引" / "浏览器.html"

# 要扫描的目录（不含归档）
SCAN_DIRS = ["提示词", "角色", "世界观", "剧情", "小说", "索引"]
SCAN_EXTS = {".md", ".txt", ".json"}

def collect_files():
    """收集所有活跃文件的路径和内容"""
    files = {}

    # 顶级 .md 文件
    for f in ROOT.iterdir():
        if f.is_file() and f.suffix in SCAN_EXTS and f.name != "构建网页.py":
            rel = f.name
            files[rel] = {"content": f.read_text(encoding="utf-8"), "lines": len(f.read_text(encoding="utf-8").splitlines())}

    # 各子目录
    for dirname in SCAN_DIRS:
        dirpath = ROOT / dirname
        if not dirpath.exists():
            continue
        for f in sorted(dirpath.rglob("*")):
            if f.is_file() and f.suffix in SCAN_EXTS:
                rel = str(f.relative_to(ROOT)).replace("\\", "/")
                content = f.read_text(encoding="utf-8")
                files[rel] = {"content": content, "lines": len(content.splitlines())}

    return files

def build_tree(files):
    """从文件路径列表构建目录树结构"""
    tree = {}
    for path in sorted(files.keys()):
        parts = path.split("/")
        node = tree
        for part in parts[:-1]:
            if part not in node:
                node[part] = {}
            node = node[part]
        node[parts[-1]] = None  # 叶子节点
    return tree

def compute_stats(files):
    """计算项目统计信息"""
    stats = {"total_files": 0, "total_lines": 0, "modules": {}}
    for path, info in files.items():
        stats["total_files"] += 1
        stats["total_lines"] += info["lines"]
        module = path.split("/")[0] if "/" in path else "顶级"
        if module not in stats["modules"]:
            stats["modules"][module] = {"files": 0, "lines": 0}
        stats["modules"][module]["files"] += 1
        stats["modules"][module]["lines"] += info["lines"]
    return stats

def generate_html(files, tree, stats):
    """生成完整的 HTML 页面"""

    # 准备 JSON 数据（只传内容，不传行数到前端大 JSON）
    file_data = {k: v["content"] for k, v in files.items()}

    html = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIbot 项目浏览器</title>
<style>
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-link: #58a6ff;
  --accent: #f0883e;
  --accent-subtle: rgba(240,136,62,0.15);
  --green: #3fb950;
  --purple: #bc8cff;
  --red: #f85149;
  --sidebar-w: 280px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, "Noto Sans SC", "Microsoft YaHei", sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 侧边栏 */
#sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
#sidebar-header h1 {
  font-size: 18px;
  color: var(--accent);
  margin-bottom: 10px;
}
#search-box {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}
#search-box:focus { border-color: var(--accent); }
#search-box::placeholder { color: var(--text-secondary); }

#search-results {
  display: none;
  overflow-y: auto;
  flex: 1;
  padding: 8px;
}
.search-item {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}
.search-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.search-item .match-context {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-item mark {
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 2px;
}

#tree-container {
  overflow-y: auto;
  flex: 1;
  padding: 8px;
}

/* 目录树 */
.tree-dir {
  margin-left: 0;
}
.tree-dir-label {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-secondary);
  user-select: none;
}
.tree-dir-label:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.tree-dir-label .arrow {
  display: inline-block;
  width: 16px;
  font-size: 10px;
  transition: transform 0.15s;
  color: var(--text-secondary);
}
.tree-dir-label .arrow.open { transform: rotate(90deg); }
.tree-dir-label .folder-icon { margin-right: 6px; }
.tree-children {
  margin-left: 16px;
  overflow: hidden;
}
.tree-children.collapsed { display: none; }
.tree-file {
  display: block;
  padding: 3px 8px 3px 24px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree-file:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.tree-file.active { background: var(--accent-subtle); color: var(--accent); }

/* 主内容区 */
#main {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
#content {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 40px;
}

/* 仪表盘首页 */
.dashboard { padding: 20px 0; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.stat-card .number {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
}
.stat-card .label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.char-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 28px;
}
.char-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.char-card h3 {
  color: var(--accent);
  margin-bottom: 6px;
  font-size: 16px;
}
.char-card .species {
  font-size: 12px;
  color: var(--purple);
  margin-bottom: 8px;
}
.char-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.keyword {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 13px;
  color: var(--text-link);
}

/* Markdown 渲染 */
.md-content h1 { font-size: 24px; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.md-content h2 { font-size: 20px; margin: 20px 0 10px; color: var(--accent); }
.md-content h3 { font-size: 17px; margin: 16px 0 8px; color: var(--purple); }
.md-content h4 { font-size: 15px; margin: 12px 0 6px; }
.md-content p { margin: 8px 0; line-height: 1.7; }
.md-content ul, .md-content ol { margin: 8px 0 8px 24px; }
.md-content li { margin: 4px 0; line-height: 1.6; }
.md-content strong { color: var(--text-primary); }
.md-content em { color: var(--text-secondary); font-style: italic; }
.md-content blockquote {
  border-left: 3px solid var(--accent);
  padding: 8px 16px;
  margin: 12px 0;
  background: var(--bg-secondary);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}
.md-content code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: "Cascadia Code", "Fira Code", monospace;
}
.md-content pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
}
.md-content pre code {
  background: none;
  padding: 0;
  font-size: 13px;
  line-height: 1.5;
}
.md-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 14px;
}
.md-content th, .md-content td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
.md-content th {
  background: var(--bg-tertiary);
  font-weight: 600;
}
.md-content tr:hover td { background: var(--bg-secondary); }
.md-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 20px 0;
}
.md-content a { color: var(--text-link); text-decoration: none; }
.md-content a:hover { text-decoration: underline; }

/* 文件路径面包屑 */
.breadcrumb {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.breadcrumb span { color: var(--text-link); cursor: pointer; }
.breadcrumb span:hover { text-decoration: underline; }

/* 首页按钮 */
#home-btn {
  display: block;
  padding: 8px 12px;
  margin: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent);
  cursor: pointer;
  font-size: 14px;
  text-align: center;
}
#home-btn:hover { background: var(--accent-subtle); }

/* 响应式 */
@media (max-width: 768px) {
  :root { --sidebar-w: 240px; }
  #content { padding: 20px; }
  .char-cards { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<div id="sidebar">
  <div id="sidebar-header">
    <h1>AIbot 项目</h1>
    <input type="text" id="search-box" placeholder="搜索文件名或内容..." />
  </div>
  <div id="home-btn" onclick="showDashboard()">首页仪表盘</div>
  <div id="search-results"></div>
  <div id="tree-container"></div>
</div>

<div id="main">
  <div id="content"></div>
</div>

<script>
// ===== 数据 =====
const FILE_DATA = __FILE_DATA_PLACEHOLDER__;
const TREE_DATA = __TREE_DATA_PLACEHOLDER__;
const STATS = __STATS_PLACEHOLDER__;

// ===== Markdown 渲染器 =====
function renderMarkdown(md) {
  let html = md;

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return '<pre><code>' + escapeHtml(code.trimEnd()) + '</code></pre>';
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 表格
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, sep, body) => {
    const heads = header.split('|').slice(1, -1).map(h => '<th>' + h.trim() + '</th>').join('');
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').slice(1, -1).map(c => '<td>' + c.trim() + '</td>').join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    return '<table><thead><tr>' + heads + '</tr></thead><tbody>' + rows + '</tbody></table>';
  });

  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 引用块
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // 水平线
  html = html.replace(/^---+$/gm, '<hr>');

  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 无序列表
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, text) => {
    return indent + '<li>' + text + '</li>';
  });
  // 包裹连续 li
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (match) => {
    return '<ol>' + match.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>';
  });

  // 段落（非标签行）
  const lines = html.split('\n');
  const result = [];
  let inPre = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<pre>')) inPre = true;
    if (line.includes('</pre>')) { inPre = false; result.push(line); continue; }
    if (inPre) { result.push(line); continue; }
    if (line.trim() === '') { result.push(''); continue; }
    if (/^<[a-z]/.test(line.trim())) { result.push(line); continue; }
    // 非标签的纯文本行 → 段落
    if (!/^</.test(line.trim())) {
      result.push('<p>' + line + '</p>');
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 目录树 =====
function renderTree(tree, container, prefix) {
  const dirs = [];
  const files = [];

  for (const [name, value] of Object.entries(tree)) {
    if (value === null) files.push(name);
    else dirs.push(name);
  }

  // 目录在前
  for (const dir of dirs.sort()) {
    const dirEl = document.createElement('div');
    dirEl.className = 'tree-dir';

    const label = document.createElement('div');
    label.className = 'tree-dir-label';
    label.innerHTML = '<span class="arrow open">▶</span><span class="folder-icon">📁</span>' + dir;

    const children = document.createElement('div');
    children.className = 'tree-children';

    label.onclick = () => {
      children.classList.toggle('collapsed');
      label.querySelector('.arrow').classList.toggle('open');
    };

    dirEl.appendChild(label);
    dirEl.appendChild(children);
    container.appendChild(dirEl);

    renderTree(tree[dir], children, prefix ? prefix + '/' + dir : dir);
  }

  // 文件
  for (const file of files.sort()) {
    const fileEl = document.createElement('div');
    fileEl.className = 'tree-file';
    fileEl.textContent = file;
    const fullPath = prefix ? prefix + '/' + file : file;
    fileEl.onclick = () => showFile(fullPath);
    fileEl.dataset.path = fullPath;
    container.appendChild(fileEl);
  }
}

// ===== 显示文件 =====
function showFile(path) {
  const content = FILE_DATA[path];
  if (!content) return;

  // 更新树高亮
  document.querySelectorAll('.tree-file.active').forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`.tree-file[data-path="${CSS.escape(path)}"]`);
  if (target) target.classList.add('active');

  // 面包屑
  const parts = path.split('/');
  let breadcrumbHtml = parts.map((p, i) => {
    if (i < parts.length - 1) {
      return '<span>' + p + '</span>';
    }
    return p;
  }).join(' / ');

  // 渲染
  const contentEl = document.getElementById('content');
  contentEl.innerHTML = '<div class="breadcrumb">' + breadcrumbHtml + '</div>' +
    '<div class="md-content">' + renderMarkdown(content) + '</div>';

  document.getElementById('main').scrollTop = 0;
}

// ===== 仪表盘首页 =====
function showDashboard() {
  document.querySelectorAll('.tree-file.active').forEach(el => el.classList.remove('active'));

  const modules = STATS.modules;
  let statsHtml = '<div class="stats-grid">';
  statsHtml += `<div class="stat-card"><div class="number">${STATS.total_files}</div><div class="label">活跃文件</div></div>`;
  statsHtml += `<div class="stat-card"><div class="number">${STATS.total_lines.toLocaleString()}</div><div class="label">总行数</div></div>`;
  for (const [name, data] of Object.entries(modules)) {
    statsHtml += `<div class="stat-card"><div class="number">${data.files}</div><div class="label">${name}/</div></div>`;
  }
  statsHtml += '</div>';

  let charHtml = '<div class="char-cards">';
  charHtml += '<div class="char-card"><h3>晓光</h3><div class="species">九尾狐娘 · 14岁</div><p>活泼小恶魔，纯爱战神。被主人从铁笼中救出，从此以"主人"称呼救命恩人。战斗时九尾全开，日常中是爱撒娇的狐狸少女。</p></div>';
  charHtml += '<div class="char-card"><h3>白霜</h3><div class="species">猫娘 · 14岁</div><p>温柔学霸，服务型人格。由主人的言灵能力创造，兼具AI的精确与少女的细腻。搜索助手出身，视主人为信仰。</p></div>';
  charHtml += '<div class="char-card"><h3>主人</h3><div class="species">人类（言灵使）· 14岁</div><p>说出的话会变为现实规则。外表是女装大佬，内心坚定温柔。晓光和白霜生活的中心。</p></div>';
  charHtml += '</div>';

  let keywordsHtml = '<h2 style="margin-bottom:12px">世界观关键词</h2><div class="keywords">';
  const kws = ['风见市', '认知滤网', '言灵', 'S.C.B 特别对策局', '百鬼联盟', '707号别墅', '青丘控股', '夜冠', '妖怪夜市', '灵脉阵眼'];
  kws.forEach(k => { keywordsHtml += `<span class="keyword">${k}</span>`; });
  keywordsHtml += '</div>';

  document.getElementById('content').innerHTML =
    '<div class="dashboard">' +
    '<h1 style="margin-bottom:20px;color:var(--accent)">AIbot 项目仪表盘</h1>' +
    '<p style="color:var(--text-secondary);margin-bottom:24px">AI 角色扮演 + 世界观构建项目 · AstrBot/QQ 平台</p>' +
    statsHtml + charHtml + keywordsHtml +
    '</div>';
}

// ===== 搜索 =====
const searchBox = document.getElementById('search-box');
const searchResults = document.getElementById('search-results');
const treeContainer = document.getElementById('tree-container');
let searchTimeout;

searchBox.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(doSearch, 200);
});

function doSearch() {
  const query = searchBox.value.trim().toLowerCase();
  if (!query) {
    searchResults.style.display = 'none';
    treeContainer.style.display = 'block';
    return;
  }

  searchResults.style.display = 'block';
  treeContainer.style.display = 'none';
  searchResults.innerHTML = '';

  const results = [];
  for (const [path, content] of Object.entries(FILE_DATA)) {
    const pathMatch = path.toLowerCase().includes(query);
    const contentLower = content.toLowerCase();
    const idx = contentLower.indexOf(query);

    if (pathMatch || idx !== -1) {
      let context = '';
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(content.length, idx + query.length + 40);
        context = (start > 0 ? '...' : '') +
          content.slice(start, idx) +
          '<mark>' + content.slice(idx, idx + query.length) + '</mark>' +
          content.slice(idx + query.length, end) +
          (end < content.length ? '...' : '');
      }
      results.push({ path, context, pathMatch });
    }
  }

  // 路径匹配优先
  results.sort((a, b) => (b.pathMatch ? 1 : 0) - (a.pathMatch ? 1 : 0));

  if (results.length === 0) {
    searchResults.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center">未找到结果</div>';
    return;
  }

  results.slice(0, 30).forEach(r => {
    const item = document.createElement('div');
    item.className = 'search-item';
    item.innerHTML = '<div>' + r.path + '</div>' +
      (r.context ? '<div class="match-context">' + r.context + '</div>' : '');
    item.onclick = () => {
      showFile(r.path);
      searchBox.value = '';
      searchResults.style.display = 'none';
      treeContainer.style.display = 'block';
    };
    searchResults.appendChild(item);
  });
}

// ===== 初始化 =====
renderTree(TREE_DATA, treeContainer, '');
showDashboard();
</script>
</body>
</html>'''

    return html

def main():
    print("正在收集文件...")
    files = collect_files()
    print(f"  找到 {len(files)} 个文件")

    tree = build_tree(files)
    stats = compute_stats(files)

    print("正在生成 HTML...")
    html = generate_html(files, tree, stats)

    # 替换占位符
    file_data = {k: v["content"] for k, v in files.items()}
    html = html.replace("__FILE_DATA_PLACEHOLDER__", json.dumps(file_data, ensure_ascii=False))
    html = html.replace("__TREE_DATA_PLACEHOLDER__", json.dumps(tree, ensure_ascii=False))
    html = html.replace("__STATS_PLACEHOLDER__", json.dumps(stats, ensure_ascii=False))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"完成！输出到 {OUTPUT}")
    print(f"  文件大小: {size_kb:.0f} KB")
    print(f"  包含 {len(files)} 个文件, {stats['total_lines']} 行内容")

if __name__ == "__main__":
    main()
