#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Alfred Run Script：将 keymap 配置 / 命令库 / 状态打包为桌面 ZIP。

参数 argv[1]：config | bundle | state
环境：TOOLS_DIR、KEYMAP_STATE
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path


def _notify(title: str, message: str) -> None:
    subprocess.run(
        [
            "osascript",
            "-e",
            "display notification "
            + json.dumps(message, ensure_ascii=False)
            + " with title "
            + json.dumps(title, ensure_ascii=False),
        ],
        check=False,
    )


def _desktop() -> Path:
    home = Path.home()
    for name in ("Desktop", "桌面"):
        d = home / name
        if d.is_dir():
            return d
    return home


def _add_tools(zf: zipfile.ZipFile, tools: Path) -> int:
    n = 0
    if not tools.is_dir():
        return 0
    for p in sorted(tools.glob("*.json")):
        if p.is_file():
            zf.write(p, arcname=f"tools/{p.name}")
            n += 1
    return n


def _add_state_core(zf: zipfile.ZipFile, state: Path) -> int:
    n = 0
    for name in ("keymap_config.json", "discovery_hints.json"):
        p = state / name
        if p.is_file():
            zf.write(p, arcname=f"keymap_state/{name}")
            n += 1
    return n


def _add_state_full(zf: zipfile.ZipFile, state: Path) -> int:
    """除 sessions 目录与 *.cache.json 外，打包整个 keymap_state。"""
    n = 0
    if not state.is_dir():
        return 0
    for p in state.rglob("*"):
        if p.is_dir():
            continue
        rel = p.relative_to(state)
        if "sessions" in rel.parts:
            continue
        if p.name.endswith(".cache.json") or p.name == "tool_names.cache.json":
            continue
        zf.write(p, arcname=f"keymap_state/{rel.as_posix()}")
        n += 1
    return n


def _run(mode: str) -> Path:
    mode = (mode or "config").strip().lower()
    if mode not in ("config", "bundle", "state"):
        raise ValueError(f"bad_mode:{mode}")

    tools = Path(os.environ.get("TOOLS_DIR", "").strip() or ".").expanduser()
    state = Path(os.environ.get("KEYMAP_STATE", "").strip() or ".").expanduser()

    desk = _desktop()
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = desk / f"KeyMap-export-{mode}-{ts}.zip"

    readme = (
        "KeyMap 导出包\n"
        "============\n\n"
        "将本 zip 解压到 Alfred Workflow bundle 展开目录（与 tools、keymap_state 同级），\n"
        "覆盖对应文件即可恢复。建议先备份原目录。\n\n"
        f"导出模式：{mode}\n"
        "- config：仅 keymap_config.json、discovery_hints.json\n"
        "- bundle：上述配置 + tools/*.json\n"
        "- state：tools/*.json + keymap_state（无 sessions、无 *.cache.json）\n"
    )

    with zipfile.ZipFile(
        out, "w", compression=zipfile.ZIP_DEFLATED, strict_timestamps=False
    ) as zf:
        zf.writestr("README_KeyMap_export.txt", readme)

        if mode == "config":
            _add_state_core(zf, state)
        elif mode == "bundle":
            _add_state_core(zf, state)
            _add_tools(zf, tools)
        else:
            _add_tools(zf, tools)
            _add_state_full(zf, state)

    return out


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "config"
    try:
        path = _run(mode)
    except ValueError as e:
        _notify("KeyMap 导出失败", str(e))
        sys.exit(1)
    except OSError as e:
        _notify("KeyMap 导出失败", str(e))
        sys.exit(1)
    _notify("KeyMap 已导出", path.name)


if __name__ == "__main__":
    main()
