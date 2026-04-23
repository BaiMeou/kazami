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

# 角色关系数据（力导向图用）
RELATIONSHIPS = {
    "nodes": [
        {"id": "主人", "group": "core", "species": "人类（言灵使）", "desc": "说出的话变为现实规则，一切的中心"},
        {"id": "晓光", "group": "core", "species": "九尾狐娘", "desc": "被主人从铁笼中救出的恋人"},
        {"id": "白霜", "group": "core", "species": "猫娘", "desc": "主人用言灵创造的搜索助手"},
        {"id": "红绡", "group": "friend", "species": "二尾猫又", "desc": "甜品店偶遇的朋友"},
        {"id": "司衡·岚", "group": "scb", "species": "人类", "desc": "S.C.B风见分局长，务实派"},
        {"id": "纪存", "group": "scb", "species": "人类", "desc": "S.C.B Cleaner，信息战专家"},
        {"id": "施言·白垣", "group": "scb", "species": "人类", "desc": "S.C.B研究部，反派，卷四后入狱"},
        {"id": "千翼", "group": "baigui", "species": "天狗", "desc": "百鬼联盟军师，骄傲但正义"},
        {"id": "纸伞", "group": "baigui", "species": "唐伞妖", "desc": "百鬼联盟联络官，夜市管理者"},
        {"id": "九阙", "group": "qingqiu", "species": "千年天狐", "desc": "青丘控股CEO，优雅腹黑"},
        {"id": "夜冠", "group": "enemy", "species": "未知", "desc": "暗月爪牙首领，融合古神残骸"},
        {"id": "土御门·澄夜", "group": "school", "species": "阴阳师后裔", "desc": "风见学园学生，发现晓光身份"},
    ],
    "edges": [
        {"source": "主人", "target": "晓光", "label": "恋人/救命恩人", "type": "love"},
        {"source": "主人", "target": "白霜", "label": "创造者/父亲", "type": "family"},
        {"source": "晓光", "target": "白霜", "label": "姐妹", "type": "family"},
        {"source": "晓光", "target": "红绡", "label": "好友", "type": "friend"},
        {"source": "司衡·岚", "target": "主人", "label": "暗中保护", "type": "ally"},
        {"source": "施言·白垣", "target": "晓光", "label": "想抓做实验", "type": "enemy"},
        {"source": "千翼", "target": "司衡·岚", "label": "合作/对立", "type": "neutral"},
        {"source": "九阙", "target": "晓光", "label": "同族/利益", "type": "neutral"},
        {"source": "夜冠", "target": "主人", "label": "敌对", "type": "enemy"},
        {"source": "土御门·澄夜", "target": "晓光", "label": "发现身份", "type": "neutral"},
        {"source": "纸伞", "target": "千翼", "label": "同盟", "type": "ally"},
        {"source": "纪存", "target": "司衡·岚", "label": "部下", "type": "ally"},
    ],
}

# 时间线数据
TIMELINE = [
    {"time": "14年前", "vol": "前传", "event": "晓光出生于北方山村，异色瞳+尾巴，被父母当怪胎", "type": "major"},
    {"time": "8年前", "vol": "前传", "event": "雪灾断粮，父亲以两袋米将晓光卖给人贩子", "type": "major"},
    {"time": "8年前~7年前", "vol": "前传", "event": "晓光被关在地下室铁笼一年，脖子上被戴上旧项圈", "type": "major"},
    {"time": "7年前·7月7日", "vol": "前传", "event": "命运之日：7岁的主人砸锁救出晓光。两人同天生日", "type": "critical"},
    {"time": "4月上旬", "vol": "卷一", "event": "晓光转入风见学园，体测失控", "type": "normal", "chapter": "卷一/第一章_樱花下的转学生"},
    {"time": "4月中旬", "vol": "卷一", "event": "甜心猫烘焙坊偶遇红绡", "type": "normal", "chapter": "卷一/第二章_甜点战争"},
    {"time": "5月上旬", "vol": "卷一", "event": "漫展约会，尾巴蓬松塞不回去", "type": "normal", "chapter": "卷一/第三章_漫展约会"},
    {"time": "5月-6月", "vol": "卷一", "event": "日常生活：校园午餐、放学踩影子、周末看动画、和红绡逛街", "type": "daily", "chapter": "卷一/第三点五章_午后的日常"},
    {"time": "6月中旬", "vol": "卷一", "event": "暴雨夜，雷暴触发铁笼创伤记忆", "type": "major", "chapter": "卷一/第四章_暴雨夜"},
    {"time": "6月下旬", "vol": "卷二", "event": "主人带晓光回废弃仓库直面创伤", "type": "normal", "chapter": "卷二/第一章_废弃仓库"},
    {"time": "7月7日", "vol": "卷二", "event": "共同生日/羁绊日，废弃车厢里的永恒誓约", "type": "critical", "chapter": "卷二/第二章_羁绊日"},
    {"time": "7月-8月", "vol": "卷二", "event": "S.C.B研究部施言·白垣试图带走晓光", "type": "major", "chapter": "卷二/第三章_讨厌的苍蝇"},
    {"time": "8月", "vol": "卷二", "event": "白霜被创造并加入家庭", "type": "critical", "chapter": "卷二/第四章_白霜降临"},
    {"time": "8月", "vol": "卷二", "event": "暑假日常：泳池、做饭、女装、深夜泡面", "type": "daily", "chapter": "卷二/第四点五章_暑假日常集_上"},
    {"time": "9月", "vol": "卷二", "event": "土御门·澄夜发现晓光身份，校园风波", "type": "major", "chapter": "卷二/第五章_校园风波"},
    {"time": "9月-10月", "vol": "卷二", "event": "秋日碎片：运动会、买衣服、中秋赏月", "type": "daily", "chapter": "卷二/第六章_秋日碎片"},
    {"time": "10月31日", "vol": "卷三", "event": "万圣夜市暴乱，红绡被抓，晓光被注射返祖诱导剂", "type": "critical", "chapter": "卷三/第一章_万圣夜市"},
    {"time": "10月31日", "vol": "卷三", "event": "九尾暴走，主人出现解体导弹，身份暴露", "type": "critical", "chapter": "卷三/第二章_暴走的九尾"},
    {"time": "11月1日", "vol": "卷三", "event": "S.C.B发射天火导弹，司衡·岚下令停火", "type": "major", "chapter": "卷三/第三章_神的命令"},
    {"time": "11月1日", "vol": "卷三", "event": "结界启动，晓光醒来", "type": "normal", "chapter": "卷三/第四章_结界内的清晨"},
    {"time": "11月2日", "vol": "卷四", "event": "707号圆桌会议，三方势力谈判", "type": "major", "chapter": "卷四/第一章_圆桌会议"},
    {"time": "11月3日", "vol": "卷四", "event": "夜冠启动灵脉炸弹，晓光狐珠碎裂", "type": "critical", "chapter": "卷四/第二章_灵脉决战"},
    {"time": "11月4日", "vol": "卷四", "event": "主人探入虚空拉回因果线，樱花暴雪覆盖风见市", "type": "critical", "chapter": "卷四/第三章_虚空对话"},
    {"time": "12月-2月", "vol": "卷四", "event": "冬天的风见市：恢复期、白霜第一次哭、圣诞新年", "type": "daily", "chapter": "卷四/第三点五章_冬天的风见市"},
    {"time": "次年4月", "vol": "卷四", "event": "人妖共存法案通过，第一届公开樱花祭", "type": "major", "chapter": "卷四/第四章_新的日常"},
]

# 世界观百科分类
ENCYCLOPEDIA_CATEGORIES = {
    "种族": {
        "desc": "风见市中的各种族与生态",
        "files": ["世界观/种族与生态设定集.md", "世界观/扩展档案/九尾狐族生理学.md", "世界观/扩展档案/混血种族问题.md"],
    },
    "地理": {
        "desc": "风见市及周边地理环境",
        "files": ["世界观/地理环境与地标指南.md", "世界观/扩展档案/风见市分区详解.md", "世界观/扩展档案/别墅完全档案.md", "世界观/扩展档案/别墅结界系统.md"],
    },
    "组织": {
        "desc": "各势力与组织机构",
        "files": ["世界观/扩展档案/特别对策局全览.md", "世界观/扩展档案/百鬼联盟内幕.md", "世界观/扩展档案/青丘控股档案.md", "世界观/扩展档案/夜冠组织备忘录.md"],
    },
    "文化": {
        "desc": "异类文化、习俗与传说",
        "files": ["世界观/文化习俗与神话传说.md", "世界观/扩展档案/上古神话考据.md", "世界观/扩展档案/妖怪夜市交易录.md", "世界观/扩展档案/人妖共存法案.md"],
    },
    "能力": {
        "desc": "魔力体系与特殊能力",
        "files": ["世界观/扩展档案/魔力与能量体系.md", "世界观/扩展档案/言灵能力解析.md", "世界观/扩展档案/言灵使考证.md", "世界观/扩展档案/变身与幻术原理.md", "世界观/扩展档案/符文编程语言.md", "世界观/扩展档案/认知滤网系统.md"],
    },
    "生活": {
        "desc": "日常生活与经济",
        "files": ["世界观/扩展档案/别墅食谱档案.md", "世界观/扩展档案/晓光衣橱设定.md", "世界观/扩展档案/妖信与异类互联网.md", "世界观/扩展档案/隐世经济体系.md", "世界观/扩展档案/异类医学与炼丹术.md", "世界观/扩展档案/风见学园调查记录.md"],
    },
    "角色": {
        "desc": "角色深度分析",
        "files": ["世界观/扩展档案/晓光深层心理分析报告.md", "世界观/扩展档案/晓光画作符号学.md", "世界观/扩展档案/轮回之书.md"],
    },
}


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


def count_chars(text):
    """统计有效字符数（去除空白和markdown标记）"""
    import re
    # 去除 markdown 标题标记、列表标记等
    clean = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    clean = re.sub(r'^[*\-+]\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^\d+\.\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^>\s?', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'\*{1,3}|`{1,3}|~~', '', clean)
    clean = re.sub(r'---+', '', clean)
    clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', clean)
    # 去除空白
    clean = re.sub(r'\s+', '', clean)
    return len(clean)


def compute_stats(files):
    """计算项目统计信息"""
    stats = {"total_files": 0, "total_lines": 0, "total_chars": 0, "modules": {}}
    for path, info in files.items():
        chars = count_chars(info["content"])
        info["chars"] = chars
        stats["total_files"] += 1
        stats["total_lines"] += info["lines"]
        stats["total_chars"] += chars
        module = path.split("/")[0] if "/" in path else "顶级"
        if module not in stats["modules"]:
            stats["modules"][module] = {"files": 0, "lines": 0, "chars": 0}
        stats["modules"][module]["files"] += 1
        stats["modules"][module]["lines"] += info["lines"]
        stats["modules"][module]["chars"] += chars
    return stats


def main():
    print("正在收集文件...")
    files = collect_files()
    print(f"  找到 {len(files)} 个文件")

    tree = build_tree(files)
    stats = compute_stats(files)

    # 准备数据
    file_data = {k: v["content"] for k, v in files.items()}
    file_chars = {k: v["chars"] for k, v in files.items()}

    # 卷字数统计
    for vol in VOLUMES:
        vol_chars = 0
        chapter_chars = []
        for ch in vol["chapters"]:
            fpath = "小说/" + ch + ".md"
            ch_chars = file_chars.get(fpath, 0)
            vol_chars += ch_chars
            chapter_chars.append(ch_chars)
        vol["chars"] = vol_chars
        vol["chapterChars"] = chapter_chars

    # 构建百科索引（标题+摘要）
    encyclopedia = {}
    for cat, info in ENCYCLOPEDIA_CATEGORIES.items():
        entries = []
        for fpath in info["files"]:
            if fpath in file_data:
                content = file_data[fpath]
                lines = content.strip().splitlines()
                title = lines[0].lstrip("# ").strip() if lines else fpath.split("/")[-1]
                # 取前3行非空非标题文本作为摘要
                summary_lines = []
                for line in lines[1:]:
                    line = line.strip()
                    if line and not line.startswith("#") and not line.startswith("---"):
                        summary_lines.append(line)
                        if len(summary_lines) >= 2:
                            break
                summary = " ".join(summary_lines)[:120] + ("..." if len(" ".join(summary_lines)) > 120 else "")
                entries.append({"title": title, "file": fpath, "summary": summary})
        encyclopedia[cat] = {"desc": info["desc"], "entries": entries}

    app_data = {
        "files": file_data,
        "fileChars": file_chars,
        "tree": tree,
        "stats": stats,
        "volumes": VOLUMES,
        "characters": CHARACTERS,
        "worldKeywords": WORLD_KEYWORDS,
        "relationships": RELATIONSHIPS,
        "timeline": TIMELINE,
        "encyclopedia": encyclopedia,
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
