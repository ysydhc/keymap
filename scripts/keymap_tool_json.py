#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/*.json 校验与安全写回：校验通过后可选备份，再写入 .tmp 二次校验，最后 replace。"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

DISCOVERY_HINTS_NAME = "discovery_hints.json"


def _config_name() -> str:
    from keymap_editor_filter import CONFIG_NAME

    return CONFIG_NAME


def is_tool_library_json(path: Path) -> bool:
    name = path.name
    if not name.endswith(".json"):
        return False
    if name.startswith("_"):
        return False
    if name == _config_name():
        return False
    if name == DISCOVERY_HINTS_NAME:
        return False
    return True


def iter_tool_json_files(tools_dir: Path) -> list[Path]:
    if not tools_dir.is_dir():
        return []
    return sorted(p for p in tools_dir.glob("*.json") if is_tool_library_json(p))


def validate_tool_json_data(data: Any, stem: str) -> str | None:
    """若无法按当前规则建条目则返回错误说明，否则 None。"""
    try:
        from alfred_tools_filter import _extract_items

        _extract_items(data, stem)
    except Exception as e:
        return str(e)
    return None


def validate_tool_json_text(text: str, stem: str) -> str | None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return f"json: {e}"
    return validate_tool_json_data(data, stem)


def validate_tool_json_path(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return f"read: {e}"
    return validate_tool_json_text(text, path.stem)


def backup_tool_json(path: Path, state: Path) -> Path:
    """将当前 path 复制到 state/backups/tools/<stem>.<时间>.json。"""
    bdir = state / "backups" / "tools"
    bdir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    dest = bdir / f"{path.stem}.{ts}.json"
    shutil.copy2(path, dest)
    return dest


def atomic_validate_and_replace(
    path: Path,
    text: str,
    stem: str,
    tools_dir: Path,
    state: Path,
    *,
    do_validate: bool = True,
    do_backup: bool = True,
) -> None:
    """
    先内存校验 text，再（若存在原文件且开启备份）备份 path，
    写入 path.tmp，读盘再校验，成功则 replace 为正式文件。
    tools_dir、state 用于与 workflow 目录布局一致（备份进 state）。
    """
    _ = tools_dir  # 保留参数便于调用方与今后扩展（如整目录试建索引）
    if do_validate:
        err = validate_tool_json_text(text, stem)
        if err:
            raise ValueError(f"validate_before_write:{err}")

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")

    if path.is_file() and do_backup:
        backup_tool_json(path, state)

    try:
        tmp.write_text(text, encoding="utf-8")
        if do_validate:
            err2 = validate_tool_json_path(tmp)
            if err2:
                raise ValueError(f"validate_after_tmp:{err2}")
        tmp.replace(path)
    finally:
        if tmp.is_file():
            try:
                tmp.unlink()
            except OSError:
                pass


def save_tool_structure_validated(
    path: Path,
    items: list[dict[str, Any]],
    envelope: dict[str, Any],
    tools_dir: Path,
    state: Path,
    *,
    do_validate: bool = True,
    do_backup: bool = True,
) -> None:
    from keymap_editor_filter import build_tool_file_object

    out = build_tool_file_object(items, envelope)
    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    atomic_validate_and_replace(
        path,
        text,
        path.stem,
        tools_dir,
        state,
        do_validate=do_validate,
        do_backup=do_backup,
    )
