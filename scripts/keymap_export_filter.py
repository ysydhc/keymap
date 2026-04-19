#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Alfred Script Filter：kexport 导出选项列表（ argument 传给 keymap_export_run.py）。"""
from __future__ import annotations

import json
import os
import sys
import unicodedata
from typing import Any


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s).casefold()


def _subseq(needle: str, hay: str) -> bool:
    if not needle:
        return True
    n, h = _norm(needle), _norm(hay)
    i = 0
    for ch in h:
        if i < len(n) and ch == n[i]:
            i += 1
    return i >= len(n)


def _items() -> list[dict[str, Any]]:
    return [
        {
            "title": "导出：仅配置（keymap_config + discovery_hints）",
            "subtitle": "ZIP 在桌面 · 体积最小",
            "arg": "config",
            "valid": True,
        },
        {
            "title": "导出：配置 + 命令库（tools 全部 JSON）",
            "subtitle": "适合换机或备份自定义命令",
            "arg": "bundle",
            "valid": True,
        },
        {
            "title": "导出：完整状态（配置 + tools + 常用/最近/占位符记忆）",
            "subtitle": "不含向导 sessions 与 *.cache.json",
            "arg": "state",
            "valid": True,
        },
    ]


def main() -> None:
    q = _norm(sys.argv[1] if len(sys.argv) > 1 else "")
    items = _items()
    if q:
        items = [
            it
            for it in items
            if _subseq(q, it.get("title", "") + " " + it.get("subtitle", ""))
        ]
    if not items:
        items = [
            {
                "title": "无匹配选项",
                "subtitle": "换关键词试试",
                "valid": False,
            }
        ]
    print(json.dumps({"items": items}, ensure_ascii=False))


if __name__ == "__main__":
    if not os.environ.get("TOOLS_DIR", "").strip():
        print(
            json.dumps(
                {
                    "items": [
                        {
                            "title": "未设置 TOOLS_DIR",
                            "subtitle": "编辑工作流 → 画布右上角 [x] → Environment Variables",
                            "valid": False,
                        }
                    ]
                },
                ensure_ascii=False,
            )
        )
    else:
        main()
