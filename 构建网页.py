#!/usr/bin/env python3
"""AIbot 项目浏览器构建脚本

遍历项目目录，读取所有 Markdown 文件，生成数据文件供浏览器使用。
仅依赖 Python 标准库。

用法：python 构建网页.py
输出：索引/浏览器/data.js
"""

import json
import os
import sys
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).parent.resolve()
OUTPUT_DIR = ROOT / "索引" / "浏览器"
OUTPUT_DATA = OUTPUT_DIR / "data.js"

# 要扫描的目录（不含归档）
SCAN_DIRS = ["提示词", "角色", "世界观", "剧情", "小说", "索引"]
SCAN_EXTS = {".md", ".txt", ".json"}

# 卷信息（含章节顺序）
VOLUMES = [
    {
        "id": "前传",
        "title": "凛冬之花",
        "subtitle": "晓光的悲惨童年 → 七月七日的救赎",
        "time": "14年前 - 7年前",
        "color": "#f85149",
        "chapters": [
            "前传/第一章_异兆降生",
            "前传/第二章_灰色的童年",
            "前传/第三章_两袋大米",
            "前传/第四章_铁笼",
            "前传/第五章_七月七日",
            "前传/第六章_第一个夜晚",
        ],
    },
    {
        "id": "卷一",
        "title": "隐秘的日常",
        "subtitle": "校园生活、甜点战争、暴雨夜的拥抱",
        "time": "4月 - 6月",
        "color": "#3fb950",
        "chapters": [
            "卷一/第一章_樱花下的转学生",
            "卷一/第二章_甜点战争",
            "卷一/第三章_漫展约会",
            "卷一/第三点五章_午后的日常",
            "卷一/第四章_暴雨夜",
            "卷一/第五章_羁绊日",
        ],
    },
    {
        "id": "卷二",
        "title": "小小的波澜",
        "subtitle": "外部威胁、白霜诞生、第一次危机",
        "time": "7月 - 9月",
        "color": "#58a6ff",
        "chapters": [
            "卷二/第一章_废弃仓库",
            "卷二/第二章_羁绊日",
            "卷二/第三章_讨厌的苍蝇",
            "卷二/第四章_白霜降临",
            "卷二/第四点五章_暑假日常集_上",
            "卷二/第四点六章_暑假日常集_下",
            "卷二/第五章_校园风波",
            "卷二/第六章_秋日碎片",
        ],
    },
    {
        "id": "卷三",
        "title": "风见之乱",
        "subtitle": "夜市陷落、九尾暴走、身份暴露",
        "time": "10月 - 11月初",
        "color": "#f0883e",
        "chapters": [
            "卷三/第一章_万圣夜市",
            "卷三/第二章_暴走的九尾",
            "卷三/第三章_神的命令",
            "卷三/第四章_结界内的清晨",
        ],
    },
    {
        "id": "卷四",
        "title": "阵眼保卫战",
        "subtitle": "最终决战、虚空对话、新秩序",
        "time": "11月 - 次年4月",
        "color": "#bc8cff",
        "chapters": [
            "卷四/第一章_圆桌会议",
            "卷四/第二章_灵脉决战",
            "卷四/第三章_虚空对话",
            "卷四/第三点五章_冬天的风见市",
            "卷四/第四章_新的日常",
        ],
    },
]

CHARACTERS = [
    {
        "name": "晓光",
        "species": "九尾狐娘",
        "age": "14",
        "trait": "活泼小恶魔，纯爱战神",
        "relation": "主人的恋人，被救者",
        "desc": "被主人从铁笼中救出，从此以\u201c主人\u201d称呼救命恩人。战斗时九尾全开，日常中是爱撒娇的狐狸少女。",
    },
    {
        "name": "白霜",
        "species": "猫娘",
        "age": "14",
        "trait": "温柔学霸，服务型人格",
        "relation": "主人的造物，女儿般的存在",
        "desc": "由主人的言灵能力创造，兼具AI的精确与少女的细腻。搜索助手出身，视主人为信仰。",
    },
    {
        "name": "主人",
        "species": "人类（言灵使）",
        "age": "14",
        "trait": "外柔内刚，女装大佬",
        "relation": "一切的中心",
        "desc": "说出的话会变为现实规则。外表是女装大佬，内心坚定温柔。晓光和白霜生活的中心。",
    },
]

WORLD_KEYWORDS = [
    "风见市", "认知滤网", "言灵", "S.C.B 特别对策局", "百鬼联盟",
    "707号别墅", "青丘控股", "夜冠", "妖怪夜市", "灵脉阵眼",
]


def collect_files():
    """收集所有活跃文件的路径和内容"""
    files = {}

    # 顶级 .md 文件
    for f in ROOT.iterdir():
        if f.is_file() and f.suffix in SCAN_EXTS and f.name != "构建网页.py":
            rel = f.name
            content = f.read_text(encoding="utf-8")
            files[rel] = {"content": content, "lines": len(content.splitlines())}

    # 各子目录（排除浏览器输出目录）
    for dirname in SCAN_DIRS:
        dirpath = ROOT / dirname
        if not dirpath.exists():
            continue
        for f in sorted(dirpath.rglob("*")):
            if f.is_file() and f.suffix in SCAN_EXTS:
                # 排除浏览器目录下的非 .md 文件
                rel = str(f.relative_to(ROOT)).replace("\\", "/")
                if rel.startswith("索引/浏览器/"):
                    continue
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


def main():
    print("正在收集文件...")
    files = collect_files()
    print(f"  找到 {len(files)} 个文件")

    tree = build_tree(files)
    stats = compute_stats(files)

    # 准备数据
    file_data = {k: v["content"] for k, v in files.items()}

    app_data = {
        "files": file_data,
        "tree": tree,
        "stats": stats,
        "volumes": VOLUMES,
        "characters": CHARACTERS,
        "worldKeywords": WORLD_KEYWORDS,
    }

    print("正在生成数据文件...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 写入 data.js
    data_json = json.dumps(app_data, ensure_ascii=False, indent=None)
    data_js = f"window.APP_DATA = {data_json};\n"
    OUTPUT_DATA.write_text(data_js, encoding="utf-8")

    size_kb = OUTPUT_DATA.stat().st_size / 1024
    print(f"完成！输出到 {OUTPUT_DIR}")
    print(f"  data.js 大小: {size_kb:.0f} KB")
    print(f"  包含 {len(files)} 个文件, {stats['total_lines']} 行内容")
    print(f"  打开 {OUTPUT_DIR / 'index.html'} 即可浏览")


if __name__ == "__main__":
    main()
