#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 tools JSON 中「键位 — 说明」式 title 改为仅说明，并补全/规范化 keys（适配 Alfred 列表展示）。"""
from __future__ import annotations

import json
import re
from pathlib import Path

EM_DASH = " — "


def is_chord_like(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    if re.search(r"(?i)(ctrl|cmd|shift|option|alt)\s*\+", s):
        return True
    if re.match(r"^/.", s):
        return True
    if s in ("@", "!"):
        return True
    if "行首" in s and "/" in s:
        return True
    if re.match(r"^[a-z0-9]$", s, re.I):
        return True
    return False


def _norm_chord(s: str) -> str:
    return re.sub(r"\s+", "", s.lower())


def merge_keys(left: str, existing: str) -> str:
    ex = existing.strip()
    el = left.strip()
    if not ex:
        return el
    if not is_chord_like(el):
        return ex
    if _norm_chord(el) == _norm_chord(ex):
        return el
    nl, nx = _norm_chord(el), _norm_chord(ex)
    if nx and nx in nl:
        return el
    if nx and nl.startswith(nx) and len(el) > len(ex):
        return el
    return ex


def migrate_item(obj: dict) -> bool:
    t = obj.get("title")
    if not isinstance(t, str) or EM_DASH not in t:
        return False
    left, right = t.split(EM_DASH, 1)
    left, right = left.strip(), right.strip()
    if not right:
        return False
    obj["title"] = right
    k0 = str(obj.get("keys") or "").strip()
    merged = merge_keys(left, k0)
    obj["keys"] = _prefer_full_static_cmd(merged, obj)
    return True


def _prefer_full_static_cmd(keys: str, obj: dict) -> str:
    """无占位符的 cmd 若比 keys 更长（如带 --verbose），列表展示用完整命令更贴切。"""
    cmd = str(obj.get("cmd") or "").strip()
    if not cmd or "{" in cmd:
        return keys
    k = keys.strip()
    if not k:
        return cmd
    if cmd.lower().startswith(k.lower()) and len(cmd) > len(k):
        return cmd
    return keys


def migrate_file(path: Path) -> int:
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    n = 0
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and migrate_item(item):
                n += 1
    elif isinstance(data, dict):
        for key in ("tools", "commands", "items", "entries"):
            if key not in data or not isinstance(data[key], list):
                continue
            for item in data[key]:
                if isinstance(item, dict) and migrate_item(item):
                    n += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return n


def _iter_tool_dicts(data: Any) -> list[dict]:
    out: list[dict] = []
    if isinstance(data, list):
        out.extend(x for x in data if isinstance(x, dict))
    elif isinstance(data, dict):
        for key in ("tools", "commands", "items", "entries"):
            if key not in data or not isinstance(data[key], list):
                continue
            out.extend(x for x in data[key] if isinstance(x, dict))
    return out


def sync_static_cmd_keys(path: Path) -> int:
    """已迁移条目：将无占位符的 keys 与完整 cmd 对齐。"""
    data = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for obj in _iter_tool_dicts(data):
        k0 = str(obj.get("keys") or "").strip()
        new_k = _prefer_full_static_cmd(k0, obj)
        if new_k != k0:
            obj["keys"] = new_k
            n += 1
    if n:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return n


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "examples"
    skip = {"keymap_config.json", "discovery_hints.json"}
    total = 0
    for p in sorted(root.glob("*.json")):
        if p.name in skip:
            continue
        n = migrate_file(p)
        if n:
            print(f"{p.name}: {n} items (title split)")
        total += n
    sk = 0
    for p in sorted(root.glob("*.json")):
        if p.name in skip:
            continue
        n2 = sync_static_cmd_keys(p)
        if n2:
            print(f"{p.name}: {n2} items (keys←cmd)")
        sk += n2
    print(f"title migrations: {total}, keys sync: {sk}")


if __name__ == "__main__":
    main()
