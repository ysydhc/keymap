#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Alfred Script Filter：kset / kdel 引导式增删改 tools/*.json。

约定查询：
- 首次可输入不含前缀的过滤词，用于筛选文件名。
- 选中项后使用 `__KMe|d|<urlsafe_b64(draft)>` 传递状态；可选 `##` 后缀做列表过滤。
- 文本字段提交：`__KMe|d|<b64>|>|` + 值（值可含 |）。「文件名过滤」只用 `##`，勿与同一轮的 `|>|` 拼在一行。
- 新增（推荐）：先 `cmd_first` 输入命令 → 自动推断 id / keyword / title → 再补剩余字段。
环境：KEYMAP_EDIT_MODE=set | del；TOOLS_DIR；KEYMAP_STATE。
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

import keymap_wizard as kw

EDIT_PFX = "__KMe|d|"
TAIL_SUB = "|>|"
FILTER_HASH = "##"

_BRACE = re.compile(r"\{([a-zA-Z0-9_]+)\}")

CONFIG_NAME = "keymap_config.json"


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


def _tool_json_paths(tools_dir: Path) -> list[Path]:
    if not tools_dir.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(tools_dir.glob("*.json")):
        if not p.is_file() or p.name.startswith("_"):
            continue
        if p.name == CONFIG_NAME:
            continue
        if p.name == "discovery_hints.json":
            continue
        out.append(p)
    return out


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def enc_draft(d: dict[str, Any]) -> str:
    return _b64e(json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def dec_draft(s: str) -> dict[str, Any]:
    o = json.loads(_b64d(s.strip()).decode("utf-8"))
    return o if isinstance(o, dict) else {}


def parse_query(q: str) -> tuple[dict[str, Any] | None, str, str | None]:
    """Returns (draft_or_none, list_filter, tail_value_for_field)."""
    q = (q or "").strip()
    tail_val: str | None = None
    if TAIL_SUB in q and q.startswith(EDIT_PFX):
        head, _, rest = q.partition(TAIL_SUB)
        q = head
        tail_val = rest
    list_filter = ""
    if FILTER_HASH in q and q.startswith(EDIT_PFX):
        main, _, lf = q.partition(FILTER_HASH)
        q = main
        list_filter = lf.strip()
    if not q.startswith(EDIT_PFX):
        return None, q, tail_val
    body = q[len(EDIT_PFX) :].strip()
    if not body:
        return None, list_filter, tail_val
    try:
        d = dec_draft(body)
    except (json.JSONDecodeError, OSError, ValueError):
        return None, list_filter, tail_val
    return d, list_filter, tail_val


def load_tool_structure(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not path.is_file():
        return [], {"kind": "list"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], {"kind": "list"}
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)], {"kind": "list"}
    if isinstance(data, dict):
        for key in ("tools", "commands", "items", "entries"):
            if key in data and isinstance(data[key], list):
                wrap = {k: v for k, v in data.items() if k != key}
                return [x for x in data[key] if isinstance(x, dict)], {
                    "kind": "keyed",
                    "key": key,
                    "wrap": wrap,
                }
        return [data], {"kind": "single_dict"}
    return [], {"kind": "list"}


def build_tool_file_object(
    items: list[dict[str, Any]], envelope: dict[str, Any]
) -> Any:
    """与 load_tool_structure 对称：由内存条目 + 信封生成将要写入磁盘的 JSON 根对象。"""
    kind = envelope.get("kind", "list")
    if kind == "list":
        return items
    if kind == "keyed":
        key = str(envelope.get("key") or "tools")
        wrap = envelope.get("wrap")
        if not isinstance(wrap, dict):
            wrap = {}
        return {**wrap, key: items}
    if kind == "single_dict":
        return items[0] if len(items) == 1 else (items[0] if items else {})
    return items


def save_tool_structure(
    path: Path, items: list[dict[str, Any]], envelope: dict[str, Any]
) -> None:
    """与 load_tool_structure 对称写回；使用临时文件再 replace（无校验/备份，供本地脚本使用）。"""
    out = build_tool_file_object(items, envelope)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


FIELDS: tuple[tuple[str, str, bool], ...] = (
    ("id", "条目 id（唯一）", True),
    ("keyword", "检索 keyword", True),
    ("title", "列表标题", True),
    ("cmd", "命令模板，占位符 {name}", True),
    ("description", "详细描述（可空）", False),
    ("weight", "权重数字（可空=5）", False),
    ("aliases", "别名，逗号分隔（可空）", False),
    ("tags", "标签，逗号分隔（可空，默认同文件名 stem）", False),
    ("platform", "平台：all / darwin / linux / windows，逗号分隔（可空=all）", False),
)

# 新增条目：命令优先流程里，在 cmd 已填且已推断核心字段之后，再补这些。
REMAINING_FIELDS: tuple[tuple[str, str, bool], ...] = (
    ("description", "详细描述（可空）", False),
    ("weight", "权重数字（可空=5）", False),
    ("aliases", "别名，逗号分隔（可空）", False),
    ("tags", "标签，逗号分隔（可空，默认同文件名 stem）", False),
    ("platform", "平台：all / darwin / linux / windows，逗号分隔（可空=all）", False),
)

CORE_TWEAK_FIELDS: tuple[tuple[str, str, bool], ...] = (
    ("id", "条目 id（唯一）", True),
    ("keyword", "检索 keyword", True),
    ("title", "列表标题（列表主行）", True),
)


def _slug_from_cmd(cmd: str, stem_hint: str) -> str:
    first = cmd.strip().split("\n")[0].strip()
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", first)
    slug = re.sub(r"-+", "-", slug).strip("-").lower()
    if not slug:
        slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", stem_hint).strip("-").lower()
    if not slug:
        slug = "cmd"
    if len(slug) > 48:
        slug = slug[:48].rstrip("-")
    return slug


def _keyword_from_cmd(cmd: str, slug: str) -> str:
    line = cmd.strip().split("\n")[0].strip()
    words = [w for w in re.split(r"[^\w\u4e00-\u9fff]+", line) if w]
    if not words:
        return (slug[:10] if slug else "k")[:10]
    w0 = words[0]
    if len(w0) <= 12:
        return w0[:12]
    return slug[:10] if len(slug) >= 3 else w0[:10]


def _title_from_cmd(cmd: str) -> str:
    one = cmd.strip().split("\n")[0].strip()
    if len(one) <= 80:
        return one
    return one[:77] + "…"


def _autogen_entry_from_cmd(cmd: str, file_basename: str) -> dict[str, Any]:
    stem = Path(file_basename).stem if file_basename else "tool"
    slug = _slug_from_cmd(cmd, stem)
    kid = slug
    # 同一文件内尽量可读：若 slug 过长，压缩为 stem 前缀 + 尾段
    if len(kid) > 40:
        kid = f"{stem}-{slug[-12:]}" if len(stem) + 13 < 40 else slug[:40]
    return {
        "id": kid,
        "keyword": _keyword_from_cmd(cmd, slug),
        "title": _title_from_cmd(cmd),
        "cmd": cmd.strip(),
    }


def _norm_fname(name: str) -> str:
    s = name.strip()
    if not s:
        return ""
    if not s.lower().endswith(".json"):
        s = f"{s}.json"
    base = Path(s).name
    if ".." in base or "/" in base or base.startswith("."):
        return ""
    return base


def _split_csv(s: str) -> list[str]:
    parts = re.split(r"[,，;；]", s)
    return [p.strip() for p in parts if p.strip()]


def _apply_field_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None:
        return draft
    step = str(draft.get("step", ""))
    if step != "field":
        return draft
    fi = int(draft.get("field_i", 0))
    if fi >= len(FIELDS):
        return draft
    key, _lbl, required = FIELDS[fi]
    v = tail.strip()
    ent = draft.setdefault("entry", {})
    if key == "weight":
        if not v:
            ent["weight"] = 5
        else:
            try:
                ent["weight"] = float(v)
            except ValueError:
                ent["weight"] = 5
    elif key == "aliases":
        ent["aliases"] = _split_csv(v) if v else []
    elif key == "tags":
        ent["tags"] = _split_csv(v) if v else []
    elif key == "platform":
        if not v:
            ent["platform"] = ["all"]
        else:
            ent["platform"] = _split_csv(v)
    else:
        ent[key] = v
        if not required and not v and key == "description":
            ent[key] = ""
    draft["field_i"] = fi + 1
    draft["step"] = "field"
    if draft["field_i"] >= len(FIELDS):
        draft["step"] = "brace_review"
    return draft


def _apply_cmd_first_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None or str(draft.get("step", "")) != "cmd_first":
        return draft
    cmd = tail.strip()
    if not cmd:
        return draft
    fname = str(draft.get("file") or "")
    draft["entry"] = _autogen_entry_from_cmd(cmd, fname)
    draft["step"] = "autogen_review"
    return draft


def _apply_remaining_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None:
        return draft
    if str(draft.get("step", "")) != "remaining":
        return draft
    fi = int(draft.get("remaining_i", 0))
    if fi >= len(REMAINING_FIELDS):
        return draft
    key, _lbl, required = REMAINING_FIELDS[fi]
    v = tail.strip()
    ent = draft.setdefault("entry", {})
    if key == "weight":
        if not v:
            ent["weight"] = 5
        else:
            try:
                ent["weight"] = float(v)
            except ValueError:
                ent["weight"] = 5
    elif key == "aliases":
        ent["aliases"] = _split_csv(v) if v else []
    elif key == "tags":
        ent["tags"] = _split_csv(v) if v else []
    elif key == "platform":
        if not v:
            ent["platform"] = ["all"]
        else:
            ent["platform"] = _split_csv(v)
    else:
        ent[key] = v
        if not required and not v and key == "description":
            ent[key] = ""
    draft["remaining_i"] = fi + 1
    draft["step"] = "remaining"
    if draft["remaining_i"] >= len(REMAINING_FIELDS):
        draft["step"] = "brace_review"
    return draft


def _apply_core_tweak_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None:
        return draft
    if str(draft.get("step", "")) != "core_tweak":
        return draft
    fi = int(draft.get("core_i", 0))
    if fi >= len(CORE_TWEAK_FIELDS):
        return draft
    key, _lbl, required = CORE_TWEAK_FIELDS[fi]
    v = tail.strip()
    ent = draft.setdefault("entry", {})
    if not v and required:
        return draft
    ent[key] = v
    draft["core_i"] = fi + 1
    draft["step"] = "core_tweak"
    if draft["core_i"] >= len(CORE_TWEAK_FIELDS):
        draft["step"] = "remaining"
        draft["remaining_i"] = 0
    return draft


def _apply_brace_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None:
        return draft
    if str(draft.get("step", "")) != "brace_detail":
        return draft
    ent = draft.setdefault("entry", {})
    params: list[dict[str, Any]] = list(ent.get("params") or [])
    bi = int(draft.get("brace_i", 0))
    bq = list(draft.get("brace_queue") or [])
    if bi >= len(bq):
        return draft
    pid = bq[bi]
    phase = str(draft.get("brace_phase", "label"))
    idx = next((i for i, p in enumerate(params) if p.get("id") == pid), -1)
    if idx < 0:
        return draft
    if phase == "label":
        params[idx]["label"] = tail.strip() or pid
        draft["brace_phase"] = "hint"
        return draft
    if phase == "hint":
        params[idx]["hint"] = tail.strip()
        draft["brace_phase"] = "examples"
        return draft
    if phase == "examples":
        params[idx]["examples"] = _split_csv(tail) if tail.strip() else []
        draft["brace_i"] = bi + 1
        if draft["brace_i"] >= len(bq):
            draft["step"] = "flag_ask"
        else:
            draft["brace_phase"] = "optional"
        return draft
    return draft


def _ensure_params_for_entry(ent: dict[str, Any]) -> None:
    cmd = str(ent.get("cmd", ""))
    ids = _BRACE.findall(cmd)
    have = {str(p.get("id")) for p in (ent.get("params") or []) if isinstance(p, dict)}
    params = list(ent.get("params") or [])
    for pid in ids:
        if pid in have:
            continue
        params.append(
            {
                "id": pid,
                "type": "brace",
                "label": pid,
                "optional": False,
                "hint": "",
                "examples": [],
            }
        )
        have.add(pid)
    ent["params"] = params


def _finalize_entry(draft: dict[str, Any]) -> dict[str, Any]:
    ent: dict[str, Any] = json.loads(json.dumps(draft.get("entry") or {}))
    fname = str(draft.get("file") or "")
    stem = Path(fname).stem if fname else "custom"
    if not ent.get("tags"):
        ent["tags"] = [stem]
    if not ent.get("platform"):
        ent["platform"] = ["all"]
    if "description" not in ent:
        ent["description"] = ""
    if "weight" not in ent:
        ent["weight"] = 5
    if "aliases" not in ent:
        ent["aliases"] = []
    ent["params"] = kw.collect_params(str(ent.get("cmd", "")), ent.get("params"))
    return ent


def _ke_arg(obj: dict[str, Any]) -> str:
    b = _b64e(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return f"KE:{b}"


def items_file_pick(
    tools_dir: Path, mode: str, list_filter: str
) -> list[dict[str, Any]]:
    paths = _tool_json_paths(tools_dir)
    rows: list[dict[str, Any]] = []
    d0 = {"v": 1, "mode": mode, "step": "file_custom", "file": None, "entry": {}}
    rows.append(
        {
            "title": "【自定义】新 JSON 文件名…",
            "subtitle": f"选中后在本行 autocomplete 后追加 {FILTER_HASH}文件名.json 刷新",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d0)}{FILTER_HASH}",
        }
    )
    for p in paths:
        label = p.name
        if list_filter and not _subseq(list_filter, label):
            continue
        d = {"v": 1, "mode": mode, "step": "op" if mode == "set" else "del_pick", "file": p.name, "entry": {}}
        rows.append(
            {
                "title": p.name,
                "subtitle": f"tools/{p.name}",
                "arg": _ke_arg({"noop": True}),
                "valid": False,
                "autocomplete": f"{EDIT_PFX}{enc_draft(d)}",
            }
        )
    if not rows:
        return [
            {
                "title": "无匹配 JSON 文件",
                "subtitle": str(tools_dir),
                "valid": False,
            }
        ]
    return rows


def items_custom_name(draft: dict[str, Any], list_filter: str) -> list[dict[str, Any]]:
    fn = _norm_fname(list_filter)
    if not fn:
        return [
            {
                "title": "输入文件名（须 .json）",
                "subtitle": f"在查询框粘贴 autocomplete 后追加 ##myfile.json · 当前 {EDIT_PFX}…",
                "valid": False,
            }
        ]
    d = {**draft, "step": "op" if draft.get("mode") == "set" else "del_pick", "file": fn}
    return [
        {
            "title": f"使用 tools/{fn}",
            "subtitle": "若不存在将新建数组格式文件",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d)}",
        }
    ]


def items_op_pick(tools_dir: Path, draft: dict[str, Any]) -> list[dict[str, Any]]:
    path = tools_dir / str(draft.get("file"))
    items, _ = load_tool_structure(path)
    rows: list[dict[str, Any]] = []
    d_new = {
        **draft,
        "step": "cmd_first",
        "entry": {},
        "edit_orig_id": None,
        "brace_queue": [],
        "brace_i": 0,
    }
    d_legacy = {
        **draft,
        "step": "field",
        "field_i": 0,
        "entry": {},
        "edit_orig_id": None,
        "brace_queue": [],
        "brace_i": 0,
    }
    rows.append(
        {
            "title": "【新增】先输入命令（自动推断 id / keyword / title）",
            "subtitle": "再补描述、权重等；避免先填 id 与文件名混淆",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_new)}",
        }
    )
    rows.append(
        {
            "title": "【新增】传统顺序（id → keyword → title → cmd…）",
            "subtitle": "熟悉旧流程时用",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_legacy)}",
        }
    )
    seen: set[str] = set()

    def _add_edit(it: dict[str, Any]) -> None:
        eid = str(it.get("id", ""))
        if not eid or eid in seen:
            return
        seen.add(eid)
        tit = str(it.get("title", eid))
        d_e = {
            **draft,
            "step": "field",
            "field_i": 0,
            "entry": json.loads(json.dumps(it)),
            "edit_orig_id": eid,
            "brace_queue": [],
            "brace_i": 0,
        }
        rows.append(
            {
                "title": f"修改：{tit}",
                "subtitle": f"id={eid}",
                "arg": _ke_arg({"noop": True}),
                "valid": False,
                "autocomplete": f"{EDIT_PFX}{enc_draft(d_e)}",
            }
        )

    for it in items:
        _add_edit(it)
    return rows


def items_cmd_first(draft: dict[str, Any]) -> list[dict[str, Any]]:
    b64 = enc_draft(draft)
    return [
        {
            "title": "① 输入完整命令模板（可先写这一行）",
            "subtitle": f"autocomplete 后只接 {TAIL_SUB}命令 · 本步不要加 {FILTER_HASH}",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_autogen_review(draft: dict[str, Any]) -> list[dict[str, Any]]:
    ent = draft.get("entry") or {}
    sid = str(ent.get("id", ""))
    skw = str(ent.get("keyword", ""))
    sti = str(ent.get("title", ""))[:72]
    scmd = str(ent.get("cmd", ""))[:64]
    d_go = {
        **draft,
        "step": "remaining",
        "remaining_i": 0,
    }
    d_retry = {
        **draft,
        "step": "cmd_first",
        "entry": {},
    }
    d_tweak = {
        **draft,
        "step": "core_tweak",
        "core_i": 0,
    }
    return [
        {
            "title": f"已推断 id「{sid}」keyword「{skw}」",
            "subtitle": sti or scmd,
            "valid": False,
        },
        {
            "title": "② 确认并继续 → 描述 / 权重 / 标签…",
            "subtitle": "下一步只问剩余项",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_go)}",
        },
        {
            "title": "↩ 重输命令（重新推断）",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_retry)}",
        },
        {
            "title": "✎ 先改 id / keyword / title",
            "subtitle": "逐项用 |>| 提交",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_tweak)}",
        },
    ]


def items_remaining_prompt(draft: dict[str, Any]) -> list[dict[str, Any]]:
    fi = int(draft.get("remaining_i", 0))
    if fi >= len(REMAINING_FIELDS):
        draft["step"] = "brace_review"
        return items_brace_review(draft)
    key, label, required = REMAINING_FIELDS[fi]
    ent = draft.get("entry") or {}
    cur = ent.get(key, "")
    sub = f"当前：{cur!r} · 必填" if required else f"当前：{cur!r} · 可留空"
    b64 = enc_draft(draft)
    return [
        {
            "title": f"填写：{label}",
            "subtitle": sub + f" · {EDIT_PFX}{b64}{TAIL_SUB}值 · 勿混用 {FILTER_HASH}",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_core_tweak_prompt(draft: dict[str, Any]) -> list[dict[str, Any]]:
    fi = int(draft.get("core_i", 0))
    if fi >= len(CORE_TWEAK_FIELDS):
        draft["step"] = "remaining"
        draft["remaining_i"] = 0
        return items_remaining_prompt(draft)
    key, label, required = CORE_TWEAK_FIELDS[fi]
    ent = draft.get("entry") or {}
    cur = ent.get(key, "")
    sub = f"当前：{cur!r} · 必填"
    b64 = enc_draft(draft)
    return [
        {
            "title": f"修改：{label}",
            "subtitle": sub + f" · {EDIT_PFX}{b64}{TAIL_SUB}",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_field_prompt(draft: dict[str, Any]) -> list[dict[str, Any]]:
    fi = int(draft.get("field_i", 0))
    if fi >= len(FIELDS):
        draft["step"] = "brace_review"
        return items_brace_review(draft)
    key, label, required = FIELDS[fi]
    ent = draft.get("entry") or {}
    cur = ent.get(key, "")
    sub = f"当前：{cur!r} · 必填" if required else f"当前：{cur!r} · 可留空"
    b64 = enc_draft(draft)
    return [
        {
            "title": f"填写：{label}",
            "subtitle": sub + f" · {EDIT_PFX}{b64}{TAIL_SUB}值 · 与 {FILTER_HASH} 不要同一次混用",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_brace_review(draft: dict[str, Any]) -> list[dict[str, Any]]:
    ent = draft.setdefault("entry", {})
    _ensure_params_for_entry(ent)
    cmd = str(ent.get("cmd", ""))
    ids = _BRACE.findall(cmd)
    draft["brace_queue"] = ids
    draft["brace_i"] = 0
    if not ids:
        draft["step"] = "flag_ask"
        return items_flag_ask(draft)
    draft["step"] = "brace_detail"
    draft["brace_phase"] = "optional"
    return items_brace_optional(draft)


def items_brace_optional(draft: dict[str, Any]) -> list[dict[str, Any]]:
    bq = list(draft.get("brace_queue") or [])
    bi = int(draft.get("brace_i", 0))
    if bi >= len(bq):
        draft["step"] = "flag_ask"
        return items_flag_ask(draft)
    pid = bq[bi]

    def _draft_with_optional(opt: bool) -> dict[str, Any]:
        d = json.loads(json.dumps(draft))
        ent = d.setdefault("entry", {})
        params = [p for p in (ent.get("params") or []) if isinstance(p, dict)]
        for p in params:
            if str(p.get("id")) == pid:
                p["optional"] = opt
                break
        d["brace_phase"] = "label"
        return d

    d_yes = _draft_with_optional(True)
    d_no = _draft_with_optional(False)
    return [
        {
            "title": f"占位符 {{{pid}}}：选为可选",
            "subtitle": "可选时空串会删掉该段占位",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_yes)}",
        },
        {
            "title": f"占位符 {{{pid}}}：必填（默认）",
            "subtitle": "与 keymap_wizard 一致",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_no)}",
        },
    ]


def items_brace_label_hint_examples(draft: dict[str, Any]) -> list[dict[str, Any]]:
    phase = str(draft.get("brace_phase", "label"))
    bq = list(draft.get("brace_queue") or [])
    bi = int(draft.get("brace_i", 0))
    pid = bq[bi]
    b64 = enc_draft(draft)
    if phase == "label":
        return [
            {
                "title": f"{{{pid}}} 显示标签（label）",
                "subtitle": f"{EDIT_PFX}{b64}{TAIL_SUB}标签文字",
                "arg": _ke_arg({"noop": True}),
                "valid": False,
                "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
            }
        ]
    if phase == "hint":
        return [
            {
                "title": f"{{{pid}}} hint（可空）",
                "subtitle": f"{EDIT_PFX}{b64}{TAIL_SUB}提示语",
                "arg": _ke_arg({"noop": True}),
                "valid": False,
                "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
            }
        ]
    return [
        {
            "title": f"{{{pid}}} examples（逗号分隔，可空）",
            "subtitle": f"{EDIT_PFX}{b64}{TAIL_SUB}a,b,c",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_flag_ask(draft: dict[str, Any]) -> list[dict[str, Any]]:
    d_skip = {**draft, "step": "confirm"}
    d_add = {**draft, "step": "flag_id", "flag_buf": {}}
    return [
        {
            "title": "跳过 flag 参数",
            "subtitle": "仅占位 {brace}；需要 --foo 可稍后手改 JSON",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_skip)}",
        },
        {
            "title": "添加一个 flag 参数",
            "subtitle": "双引号前缀 --name value",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{enc_draft(d_add)}",
        },
    ]


def _apply_flag_tail(draft: dict[str, Any], tail: str | None) -> dict[str, Any]:
    if tail is None:
        return draft
    step = str(draft.get("step", ""))
    if step not in (
        "flag_id",
        "flag_name",
        "flag_prefix",
        "flag_optional",
        "flag_values",
    ):
        return draft
    ent = draft.setdefault("entry", {})
    buf = draft.setdefault("flag_buf", {})
    if step == "flag_id":
        buf["id"] = tail.strip()
        draft["step"] = "flag_name"
        return draft
    if step == "flag_name":
        buf["flag"] = tail.strip() or buf.get("id", "flag")
        draft["step"] = "flag_prefix"
        return draft
    if step == "flag_prefix":
        t = tail.strip().lower()
        buf["prefix"] = "single" if t in ("1", "single", "-", "s") else "double"
        draft["step"] = "flag_optional"
        return draft
    if step == "flag_optional":
        buf["optional"] = tail.strip().lower() in (
            "y",
            "yes",
            "1",
            "true",
            "可选",
            "是",
        )
        draft["step"] = "flag_values"
        return draft
    if step == "flag_values":
        vals = _split_csv(tail)
        pid = str(buf.get("id", ""))
        fname = str(buf.get("flag") or pid)
        opt = bool(buf.get("optional"))
        pref = str(buf.get("prefix") or "double")
        prm: dict[str, Any] = {
            "id": pid,
            "type": "flag",
            "label": fname,
            "flag": fname,
            "prefix": pref,
            "optional": opt,
            "values": vals,
            "hint": "",
        }
        params = [p for p in (ent.get("params") or []) if p.get("id") != pid]
        params.append(prm)
        ent["params"] = params
        draft["step"] = "confirm"
        del draft["flag_buf"]
    return draft


def items_flag_prompt(draft: dict[str, Any]) -> list[dict[str, Any]]:
    step = str(draft.get("step", ""))
    b64 = enc_draft(draft)
    prompts = {
        "flag_id": "flag 参数 id（与 cmd 无关，用于向导里选值）",
        "flag_name": "命令行标志名（生成 --name value 里的 name）",
        "flag_prefix": "前缀：输入 single 或 double（默认 double）",
        "flag_optional": "是否可选：y / n",
        "flag_values": "枚举值，逗号分隔（可空=自由输入）",
    }
    msg = prompts.get(step, step)
    return [
        {
            "title": msg,
            "subtitle": f"{EDIT_PFX}{b64}{TAIL_SUB}…",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
            "autocomplete": f"{EDIT_PFX}{b64}{TAIL_SUB}",
        }
    ]


def items_confirm(draft: dict[str, Any]) -> list[dict[str, Any]]:
    ent = _finalize_entry(draft)
    draft["entry"] = ent
    summ = f'{ent.get("id")} · {ent.get("keyword")} · {str(ent.get("cmd", ""))[:56]}'
    payload = {
        "op": "apply",
        "file": draft.get("file"),
        "entry": ent,
        "replace_id": draft.get("edit_orig_id"),
    }
    return [
        {
            "title": "确认写入 JSON（回车执行）",
            "subtitle": summ,
            "arg": _ke_arg(payload),
            "valid": True,
        },
        {
            "title": "取消",
            "subtitle": "不换行即可关闭",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
        },
    ]


def items_del_pick(
    tools_dir: Path, draft: dict[str, Any], list_filter: str
) -> list[dict[str, Any]]:
    path = tools_dir / str(draft.get("file"))
    items, _ = load_tool_structure(path)
    rows: list[dict[str, Any]] = []
    for it in items:
        eid = str(it.get("id", ""))
        if not eid:
            continue
        hay = " ".join(
            [
                eid,
                str(it.get("title", "")),
                str(it.get("keyword", "")),
                str(it.get("cmd", "")),
            ]
        )
        if list_filter and not _subseq(list_filter, hay):
            continue
        tit = str(it.get("title", eid))
        d2 = {**draft, "step": "del_confirm", "del_target": eid}
        rows.append(
            {
                "title": f"删除：{tit}",
                "subtitle": f"id={eid} · 回车下一步确认",
                "arg": _ke_arg({"noop": True}),
                "valid": False,
                "autocomplete": f"{EDIT_PFX}{enc_draft(d2)}",
            }
        )
    if not rows:
        return [{"title": "没有可删条目", "subtitle": path.name, "valid": False}]
    head = f"过滤：{list_filter}" if list_filter else "选择要删除的条目"
    return [{"title": head, "subtitle": f"## 可输入过滤词 · {draft.get('file')}", "valid": False}, *rows]


def items_del_confirm(draft: dict[str, Any]) -> list[dict[str, Any]]:
    eid = str(draft.get("del_target", ""))
    payload = {"op": "delete", "file": draft.get("file"), "id": eid}
    return [
        {
            "title": f"最终确认：删除 id={eid}",
            "subtitle": "回车从 JSON 移除该条目",
            "arg": _ke_arg(payload),
            "valid": True,
        },
        {
            "title": "取消",
            "subtitle": "",
            "arg": _ke_arg({"noop": True}),
            "valid": False,
        },
    ]


def run_editor_filter(tools_dir: Path, query: str, mode: str) -> dict[str, Any]:
    mode = mode.strip().lower()
    if mode not in ("set", "del"):
        return {
            "items": [{"title": "KEYMAP_EDIT_MODE 须为 set 或 del", "valid": False}]
        }

    draft, list_filter, tail = parse_query(query)

    if draft is None:
        return {"items": items_file_pick(tools_dir, mode, list_filter)}

    if str(draft.get("mode", mode)) != mode:
        draft["mode"] = mode

    step = str(draft.get("step", "file"))

    if step == "file_custom":
        return {"items": items_custom_name(draft, list_filter)}

    if tail is not None:
        if step == "field":
            draft = _apply_field_tail(draft, tail)
        elif step == "cmd_first":
            draft = _apply_cmd_first_tail(draft, tail)
        elif step == "remaining":
            draft = _apply_remaining_tail(draft, tail)
        elif step == "core_tweak":
            draft = _apply_core_tweak_tail(draft, tail)
        elif step == "brace_detail":
            draft = _apply_brace_tail(draft, tail)
        else:
            draft = _apply_flag_tail(draft, tail)

    step = str(draft.get("step", "file"))

    if step == "op":
        return {"items": items_op_pick(tools_dir, draft)}

    if step == "cmd_first":
        return {"items": items_cmd_first(draft)}

    if step == "autogen_review":
        return {"items": items_autogen_review(draft)}

    if step == "remaining":
        if int(draft.get("remaining_i", 0)) >= len(REMAINING_FIELDS):
            draft["step"] = "brace_review"
            return {"items": items_brace_review(draft)}
        return {"items": items_remaining_prompt(draft)}

    if step == "core_tweak":
        return {"items": items_core_tweak_prompt(draft)}

    if step == "field":
        if int(draft.get("field_i", 0)) >= len(FIELDS):
            draft["step"] = "brace_review"
            return {"items": items_brace_review(draft)}
        return {"items": items_field_prompt(draft)}

    if step == "brace_review":
        return {"items": items_brace_review(draft)}

    if step == "brace_detail":
        ph = str(draft.get("brace_phase", "optional"))
        if ph == "optional":
            return {"items": items_brace_optional(draft)}
        return {"items": items_brace_label_hint_examples(draft)}

    if step == "flag_ask":
        return {"items": items_flag_ask(draft)}

    if step in ("flag_id", "flag_name", "flag_prefix", "flag_optional", "flag_values"):
        return {"items": items_flag_prompt(draft)}

    if step == "confirm":
        return {"items": items_confirm(draft)}

    if step == "del_pick":
        return {"items": items_del_pick(tools_dir, draft, list_filter)}

    if step == "del_confirm":
        return {"items": items_del_confirm(draft)}

    return {"items": [{"title": f"未知步骤：{step}", "valid": False}]}


def main() -> None:
    tools = os.environ.get("TOOLS_DIR", "").strip()
    if not tools:
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
        return
    q = sys.argv[1] if len(sys.argv) > 1 else ""
    mode = os.environ.get("KEYMAP_EDIT_MODE", "set").strip().lower()
    out = run_editor_filter(Path(tools).expanduser(), q, mode)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
