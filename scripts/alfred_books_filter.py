#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Alfred Script Filter：按 books 目录中的 JSON 构建索引，用于搜索文档/手册。
支持 Quick Look（Shift 预览）和回车打开（本地文件或 URL）。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

def _as_str_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if x is not None and str(x).strip()]
    if isinstance(val, str):
        return [p for p in val.replace(",", " ").replace(";", " ").split() if p]
    return [str(val).strip()]

def _load_books(books_dir: Path) -> list[dict[str, Any]]:
    if not books_dir.is_dir():
        return []
    
    books = []
    for p in sorted(books_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            items = data.get("books") or data.get("items") or []
            if isinstance(data, list):
                items = data
            
            for item in items:
                if not isinstance(item, dict):
                    continue
                
                target = str(item.get("target") or item.get("url") or item.get("path") or "").strip()
                if not target:
                    continue
                    
                title = str(item.get("title") or item.get("name") or target).strip()
                subtitle = str(item.get("subtitle") or item.get("desc") or item.get("description") or "").strip()
                tags = _as_str_list(item.get("tags"))
                
                # 构建用于搜索的文本
                haystack = f"{title} {subtitle} {' '.join(tags)}".lower()
                
                books.append({
                    "title": title,
                    "subtitle": subtitle,
                    "target": target,
                    "tags": tags,
                    "haystack": haystack,
                    "source_file": p.name
                })
        except Exception:
            pass
    return books

def _score_book(book: dict[str, Any], query: str) -> float:
    if not query:
        return 1.0
        
    q_lower = query.lower()
    haystack = book["haystack"]
    
    if q_lower in book["title"].lower():
        return 100.0
    if q_lower in haystack:
        return 50.0
        
    # 简单的分词匹配
    parts = q_lower.split()
    if all(p in haystack for p in parts):
        return 10.0
        
    return 0.0

def main() -> None:
    # 尝试从环境变量获取，如果没有则默认使用 tools 同级的 books 目录
    tools_dir_env = os.environ.get("TOOLS_DIR", "").strip()
    if tools_dir_env:
        books_dir = Path(tools_dir_env).parent / "books"
    else:
        # 兜底：当前目录的 books 文件夹
        books_dir = Path(__file__).resolve().parent / "books"
        
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    
    if not books_dir.is_dir():
        print(json.dumps({
            "items": [{
                "title": "books 目录不存在",
                "subtitle": f"请在 {books_dir} 目录下创建 JSON 文件",
                "valid": False
            }]
        }, ensure_ascii=False))
        return
        
    books = _load_books(books_dir)
    if not books:
        print(json.dumps({
            "items": [{
                "title": "未找到任何手册配置",
                "subtitle": f"请在 {books_dir} 目录下添加包含 books 数组的 JSON 文件",
                "valid": False
            }]
        }, ensure_ascii=False))
        return
        
    scored = []
    for b in books:
        score = _score_book(b, query)
        if score > 0:
            scored.append((score, b))
            
    scored.sort(key=lambda x: x[0], reverse=True)
    
    import urllib.parse
    
    items = []
    for _, b in scored[:50]:
        target = b["target"]
        is_url = target.startswith("http://") or target.startswith("https://")
        
        # 处理本地路径的 ~ 展开
        if not is_url and target.startswith("~/"):
            target = os.path.expanduser(target)
            
        if not is_url:
            encoded_path = urllib.parse.quote(target)
            main_arg = f"hammerspoon://show_md?path={encoded_path}"
        else:
            main_arg = target
            
        subtitle_parts = []
        if b["subtitle"]:
            subtitle_parts.append(b["subtitle"])
        if b["tags"]:
            subtitle_parts.append(f"[{', '.join(b['tags'])}]")
            
        subtitle = " · ".join(subtitle_parts) if subtitle_parts else target
        
        item = {
            "uid": f"kb-{hashlib.md5(target.encode()).hexdigest()[:12]}" if 'hashlib' in sys.modules else target,
            "title": b["title"],
            "subtitle": subtitle,
            "arg": main_arg,  # 传递给 Hammerspoon URL 或 HTTP URL
            "valid": True,
            "quicklookurl": target, # Shift 预览的关键字段
            "text": {
                "copy": target,
                "largetype": target
            },
            "mods": {
                "cmd": {
                    "valid": True,
                    "subtitle": "⌘↩ 用默认编辑器打开文件 / 浏览器打开网页",
                    "arg": target
                },
                "alt": {
                    "valid": True,
                    "subtitle": "⌥↩ 复制终端渲染命令 (glow '文件路径')",
                    "arg": f"glow '{target}'" if not is_url else target
                }
            }
        }
        items.append(item)
        
    if not items:
        items = [{
            "title": "未找到匹配的手册",
            "subtitle": f"查询词: {query}",
            "valid": False
        }]
        
    print(json.dumps({"items": items}, ensure_ascii=False))

if __name__ == "__main__":
    import hashlib
    main()
