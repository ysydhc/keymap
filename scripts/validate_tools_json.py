#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 tools 目录下命令库 JSON；--install 时在备份（若目标已存在）后校验候选并覆盖目标。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from keymap_tool_json import (
    atomic_validate_and_replace,
    iter_tool_json_files,
    validate_tool_json_path,
)


def _state_dir_for_tools_layout(tools_dir: Path) -> Path:
    raw = os.environ.get("KEYMAP_STATE", "").strip()
    if raw:
        return Path(raw).expanduser()
    return tools_dir.parent / "keymap_state"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="校验 KeyMap 工具 JSON；--install 先校验候选再覆盖目标（可选备份）。"
    )
    ap.add_argument(
        "tools_dir",
        nargs="?",
        type=Path,
        default=None,
        help="tools 目录（默认 TOOLS_DIR 或当前目录）",
    )
    ap.add_argument("--file", type=Path, help="只校验单个文件")
    ap.add_argument(
        "--install",
        nargs=2,
        metavar=("CANDIDATE", "TARGET"),
        help="将 CANDIDATE 安装到 TARGET：校验通过后写入（目标已存在则先备份到 keymap_state/backups/tools）",
    )
    args = ap.parse_args()

    if args.install:
        cand = Path(args.install[0]).expanduser()
        target = Path(args.install[1]).expanduser()
        if not cand.is_file():
            print(f"候选不存在: {cand}", file=sys.stderr)
            return 1
        text = cand.read_text(encoding="utf-8")
        tools_dir = target.parent
        state = _state_dir_for_tools_layout(tools_dir)
        state.mkdir(parents=True, exist_ok=True)
        try:
            atomic_validate_and_replace(
                target,
                text,
                target.stem,
                tools_dir,
                state,
                do_validate=True,
                do_backup=target.is_file(),
            )
        except ValueError as e:
            print(str(e), file=sys.stderr)
            return 1
        print(f"已写入 {target}")
        print(f"备份目录: {state / 'backups' / 'tools'}")
        return 0

    if args.file:
        p = args.file.expanduser()
        err = validate_tool_json_path(p)
        if err:
            print(f"{p}: {err}", file=sys.stderr)
            return 1
        print(f"{p}: ok")
        return 0

    td = args.tools_dir
    if td is None:
        raw = os.environ.get("TOOLS_DIR", "").strip()
        td = Path(raw).expanduser() if raw else Path.cwd()
    td = td.expanduser()
    if not td.is_dir():
        print(f"不是目录: {td}", file=sys.stderr)
        return 1

    files = iter_tool_json_files(td)
    if not files:
        print(f"{td}: 没有可校验的工具 .json（已排除配置与 discovery_hints）", file=sys.stderr)
        return 0

    bad = 0
    for p in files:
        err = validate_tool_json_path(p)
        if err:
            print(f"{p}: {err}", file=sys.stderr)
            bad += 1
        else:
            print(f"{p}: ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
