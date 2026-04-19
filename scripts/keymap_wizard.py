#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tab 向导：__KMw| 协议、会话、draft 与 KM 条目的拼装。

主页：`__KMw|e|<entry_id>|` → 仅「复制」+ 各参数一行摘要；Tab 用项上 autocomplete 进入子级。
子级：`__KMw|e|<id>|pick|<param_id>|`（或自由输入中的 `|f|<param_id>|`）→「← 返回」+ 该参数的枚举/自由输入。
返回：autocomplete 回到 `__KMw|e|<entry_id>|`。
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

WIZ_PREFIX = "__KMw|"
_BRACE_IN_CMD = re.compile(r"\{([a-zA-Z0-9_]+)\}")


def pure_copy_cmd(cmd: str) -> str:
    """将命令转换为纯净输出版本（供 ⌥↩ 复制结果使用）。"""
    if not cmd:
        return ""
    c = cmd.strip()
    
    if c.startswith("lsof -i"):
        return c.replace("lsof -i", "lsof -t -i")
    if c.startswith("ps aux | grep"):
        parts = c.split("grep", 1)
        if len(parts) == 2:
            return f"pgrep -f {parts[1].strip()}"
            
    if c == "docker ps":
        return "docker ps -q"
    if c == "docker ps -a":
        return "docker ps -aq"
    if c == "docker images":
        return "docker images -q"
    if c == "docker volume ls":
        return "docker volume ls -q"
    if c == "docker network ls":
        return "docker network ls -q"
        
    if c == "git branch":
        return "git branch --show-current"
    if c == "git log -1" or c == "git log":
        return "git rev-parse HEAD"
    if c == "git remote -v" or c == "git remote":
        return "git config --get remote.origin.url"
    if c == "git status --short" or c == "git status":
        return "git diff --name-only"
        
    return c


def _parse_hint_examples(p: dict[str, Any]) -> tuple[str, list[str]]:
    """从 JSON param 读取说明与示例，用于向导副标题。"""
    h = p.get("hint")
    hint = str(h).strip() if h is not None and str(h).strip() else ""
    exs: list[str] = []
    er = p.get("examples")
    if isinstance(er, list):
        exs = [str(x).strip() for x in er if x is not None and str(x).strip()]
    elif isinstance(er, str) and er.strip():
        exs = [x.strip() for x in re.split(r"[,;，；]", er) if x.strip()]
    return hint, exs


def _wizard_hint_subtitle(p: dict[str, Any]) -> str:
    hint, cleaned = _parse_hint_examples(p)
    parts: list[str] = []
    if hint:
        parts.append(hint)
    if cleaned:
        tail = "、".join(cleaned[:14])
        if len(cleaned) > 14:
            tail += "…"
        parts.append(f"示例：{tail}")
    return " · ".join(parts)


def collect_params(cmd: str, raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for p in raw:
            if isinstance(p, dict) and str(p.get("id", "")).strip():
                out.append(_normalize_param(p))
    have = {p["id"] for p in out}
    for bid in _BRACE_IN_CMD.findall(cmd):
        if bid not in have:
            out.append(
                {
                    "id": bid,
                    "type": "brace",
                    "label": bid,
                    "flag_field": bid,
                    "prefix": "double",
                    "values": [],
                    "optional": False,
                    "default": None,
                    "hint": "",
                    "examples": [],
                    "freeform_after_values": False,
                }
            )
            have.add(bid)
    return out


def _normalize_param(p: dict[str, Any]) -> dict[str, Any]:
    pid = str(p["id"]).strip()
    typ = str(p.get("type", "flag")).strip().lower()
    if typ not in ("brace", "flag"):
        typ = "flag"
    pref = str(p.get("prefix") or "double").strip().lower()
    if pref in ("--", "double", "long"):
        pref_norm = "double"
    else:
        pref_norm = "single"
    vals: list[str] = []
    vraw = p.get("values")
    if isinstance(vraw, list):
        vals = [str(x).strip() for x in vraw if x is not None and str(x).strip()]
    elif isinstance(vraw, str) and vraw.strip():
        vals = [x.strip() for x in re.split(r"[,;，；]", vraw) if x.strip()]
    dflt = p.get("default")
    default = None if dflt is None else str(dflt)
    ph, pex = _parse_hint_examples(p)
    return {
        "id": pid,
        "type": typ,
        "label": str(p.get("label") or pid).strip(),
        "flag_field": str(p.get("flag") or pid).strip(),
        "prefix": pref_norm,
        "values": vals,
        "optional": bool(p.get("optional")),
        "default": default,
        "hint": ph,
        "examples": pex,
        "freeform_after_values": bool(p.get("freeform_after_values")),
    }


def session_path(state: Path, entry_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", entry_id)[:64]
    return state / "sessions" / f"w_{safe}.json"


def load_session(state: Path, entry_id: str) -> dict[str, Any]:
    p = session_path(state, entry_id)
    if not p.is_file():
        return {"brace": {}, "flag": {}}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            b = d.get("brace")
            f = d.get("flag")
            return {
                "brace": dict(b) if isinstance(b, dict) else {},
                "flag": dict(f) if isinstance(f, dict) else {},
            }
    except (OSError, json.JSONDecodeError):
        pass
    return {"brace": {}, "flag": {}}


def save_session(state: Path, entry_id: str, sess: dict[str, Any]) -> None:
    p = session_path(state, entry_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(
            {"brace": sess.get("brace", {}), "flag": sess.get("flag", {})},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def apply_default_values(params: list[dict[str, Any]]) -> dict[str, Any]:
    brace: dict[str, str] = {}
    flag: dict[str, str] = {}
    for p in params:
        d = p.get("default")
        if d is None:
            continue
        s = str(d)
        if p["type"] == "brace":
            brace[p["id"]] = s
        else:
            flag[p["id"]] = s
    return {"brace": brace, "flag": flag}


def build_draft(cmd_tpl: str, params: list[dict[str, Any]], brace: dict[str, str], flag: dict[str, str]) -> str:
    s = cmd_tpl
    for p in params:
        if p["type"] != "brace":
            continue
        pid = p["id"]
        s = s.replace("{" + pid + "}", brace.get(pid, ""))
    tails: list[str] = []
    for p in params:
        if p["type"] != "flag":
            continue
        pid = p["id"]
        v = flag.get(pid, "").strip()
        if not v:
            continue
        fname = p["flag_field"]
        if p["prefix"] == "double":
            tails.append(f"--{fname} {v}")
        else:
            tails.append(f"-{fname} {v}")
    if tails:
        s = (s.rstrip() + " " + " ".join(tails)).strip()
    return s.strip()


def is_draft(draft: str) -> bool:
    return "{" in draft


def cmd_incomplete(
    cmd: str, params: list[dict[str, Any]], brace: dict[str, str], flag: dict[str, str]
) -> bool:
    return is_draft(cmd) or not required_ok(params, brace, flag)


def required_ok(
    params: list[dict[str, Any]], brace: dict[str, str], flag: dict[str, str]
) -> bool:
    for p in params:
        if p.get("optional"):
            continue
        if p["type"] == "brace":
            if not str(brace.get(p["id"], "")).strip():
                return False
        else:
            if not str(flag.get(p["id"], "")).strip():
                return False
    return True


def row_needs_wizard(row: dict[str, Any]) -> bool:
    params = row.get("_params") or []
    if not params:
        return False
    cmd = str(row.get("cmd") or "")
    init = apply_default_values(params)
    d = build_draft(cmd, params, init["brace"], init["flag"])
    return cmd_incomplete(d, params, init["brace"], init["flag"])


def merge_session_with_defaults(
    params: list[dict[str, Any]], stored: dict[str, Any]
) -> dict[str, Any]:
    base = apply_default_values(params)
    b = {**base["brace"], **dict(stored.get("brace") or {})}
    f = {**base["flag"], **dict(stored.get("flag") or {})}
    return {"brace": b, "flag": f}


def parse_wizard_query(q: str) -> dict[str, Any] | None:
    q = q.strip()
    if not q.startswith(WIZ_PREFIX):
        return None
    body = q[len(WIZ_PREFIX) :]
    parts = body.split("|")
    if len(parts) < 2 or parts[0] != "e":
        return None
    eid = parts[1]
    if len(parts) == 2:
        return {"op": "home", "eid": eid}
    op = parts[2]
    if op == "pick":
        if len(parts) < 4:
            return {"op": "home", "eid": eid}
        return {"op": "pick", "eid": eid, "pid": parts[3]}
    if op == "v":
        if len(parts) < 4:
            return {"op": "home", "eid": eid}
        pid = parts[3]
        val = unquote("|".join(parts[4:])) if len(parts) > 4 else ""
        if val.strip():
            return {"op": "set", "eid": eid, "pid": pid, "val": val.strip()}
        return {"op": "home", "eid": eid}
    if op == "f":
        if len(parts) < 4:
            return {"op": "home", "eid": eid}
        pid = parts[3]
        val = unquote("|".join(parts[4:])) if len(parts) > 4 else ""
        if val.strip():
            return {"op": "set", "eid": eid, "pid": pid, "val": val.strip()}
        return {"op": "freeform", "eid": eid, "pid": pid}
    return {"op": "home", "eid": eid}


def apply_freeform_prefix(full_query: str, entry_id: str, param_id: str) -> str | None:
    prefix = f"{WIZ_PREFIX}e|{entry_id}|f|{param_id}|"
    fq = full_query.strip()
    if not fq.startswith(prefix):
        return None
    return fq[len(prefix) :].strip()


def encode_km_arg(payload: dict[str, Any], paste: bool) -> str:
    body = {**{k: v for k, v in payload.items() if k != "paste"}, "paste": paste}
    b = base64.b64encode(json.dumps(body, ensure_ascii=False).encode("utf-8")).decode("ascii")
    return "KM:" + b


def write_quicklook_preview(state: Path, entry_id: str, payload: dict[str, Any]) -> str:
    """写入 quicklook_cache 下 JSON，返回 file:// URI（供 Alfred Quick Look / Shift）。"""
    d = state / "quicklook_cache"
    d.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", entry_id).strip("_")[:96] or "entry"
    path = d / f"{safe}.json"
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    try:
        old = path.read_text(encoding="utf-8")
    except OSError:
        old = ""
    if old != text:
        path.write_text(text, encoding="utf-8")
    return path.resolve().as_uri()


def wizard_quicklook_payload(
    row: dict[str, Any],
    cmd_template: str,
    cmd_draft: str,
    params: list[dict[str, Any]],
    sess: dict[str, Any],
) -> dict[str, Any]:
    plist: list[dict[str, Any]] = []
    for p in params:
        if not isinstance(p, dict):
            continue
        plist.append(
            {
                "id": p.get("id"),
                "type": p.get("type"),
                "label": p.get("label"),
                "flag": p.get("flag_field"),
                "prefix": p.get("prefix"),
                "optional": p.get("optional"),
                "values": p.get("values"),
                "default": p.get("default"),
                "hint": p.get("hint"),
                "examples": p.get("examples"),
            }
        )
    doc = str(row.get("_doc_url") or "").strip()
    out: dict[str, Any] = {
        "_schema": "keymap_quicklook_v1",
        "context": "tab_wizard",
        "tool_file": f'{row.get("tool")}.json',
        "entry_id": row.get("entry_id"),
        "title": row.get("title"),
        "keyword": row.get("keyword"),
        "cmd_template": cmd_template,
        "cmd_draft": cmd_draft,
        "params": plist,
        "session": {
            "brace": dict(sess.get("brace") or {}),
            "flag": dict(sess.get("flag") or {}),
        },
        "shortcut": row.get("_shortcut"),
        "mode": row.get("_mode"),
        "action": row.get("_action"),
        "description": row.get("_description"),
        "tags": row.get("_tags"),
        "deprecated": row.get("_deprecated"),
        "replaced_by": row.get("_replaced_by"),
        "note": "Quick Look：当前 Tab 向导下的配置快照；官方文档见 doc_url。",
    }
    if doc.startswith("http://") or doc.startswith("https://"):
        out["doc_url"] = doc
    return out


def _wizard_param_value_items(
    eid: str, p: dict[str, Any], sess: dict[str, Any]
) -> list[dict[str, Any]]:
    """某一参数下的：枚举候选 +（可选）自由输入。用于 pick / freeform 子级。"""
    items: list[dict[str, Any]] = []
    pid = p["id"]
    label = str(p.get("label") or pid)
    vals = p.get("values") or []
    hint_line = _wizard_hint_subtitle(p)

    def _append_freeform_param() -> None:
        cur = (
            (sess["brace"] if p["type"] == "brace" else sess["flag"]).get(pid, "")
        )
        cur_s = str(cur).strip()
        sub = (cur_s[:80] + "…") if len(cur_s) > 80 else (cur_s or "（空）")
        sub_parts = f"当前：{sub} · 选用此项后在查询末尾继续输入"
        if hint_line:
            sub_parts = f"{sub_parts} · {hint_line}"
        items.append(
            {
                "uid": f"w-{eid[:8]}-{pid}-ff",
                "title": f"{label} · 自由输入",
                "subtitle": sub_parts,
                "valid": False,
                "autocomplete": f"{WIZ_PREFIX}e|{eid}|f|{pid}|",
            }
        )

    if isinstance(vals, list) and vals:
        shown = 0
        for v in vals:
            vs = str(v).strip()
            if not vs:
                continue
            shown += 1
            sub = "回车将填入该值"
            if hint_line and shown == 1:
                sub = f"{sub} · {hint_line}"
            items.append(
                {
                    "uid": f"w-{eid[:8]}-{pid}-{hash(vs) & 0xFFFF :x}",
                    "title": f"{label}: {vs}",
                    "subtitle": sub,
                    "valid": False,
                    "autocomplete": ac_set(eid, pid, vs),
                }
            )
        if p.get("freeform_after_values"):
            _append_freeform_param()
    else:
        _append_freeform_param()
    return items


def wizard_alfred_items(state: Path, row: dict[str, Any], q: str) -> list[dict[str, Any]]:
    eid = str(row.get("entry_id", ""))
    parsed = parse_wizard_query(q)
    if not parsed or parsed.get("eid") != eid:
        return [
            {
                "title": "向导无法解析或未找到条目",
                "subtitle": (q or "")[:100],
                "valid": False,
            }
        ]
    params = row.get("_params") or []
    cmd_tpl = str(row.get("cmd") or "")
    raw = load_session(state, eid)
    if parsed.get("op") == "set":
        pid = str(parsed.get("pid") or "")
        val = str(parsed.get("val") or "")
        pm = find_param(params, pid)
        if pm and val.strip():
            set_session_value(raw, pm, val.strip())
            save_session(state, eid, raw)
    sess = merge_session_with_defaults(params, load_session(state, eid))
    draft = build_draft(cmd_tpl, params, sess["brace"], sess["flag"])
    draf = cmd_incomplete(draft, params, sess["brace"], sess["flag"])
    wiz_ok = not draf
    base_pay = {
        "v": 2,
        "entry_id": eid,
        "tool": row["tool"],
        "title": row["title"],
        "cmd": draft,
        "draft": draf,
        "wizard_complete": wiz_ok,
        "param_values": {"brace": sess["brace"], "flag": sess["flag"]},
    }
    items: list[dict[str, Any]] = []

    def _add_copy_row() -> None:
        title_cp = "复制当前命令" + ("（草稿 / 缺必填）" if draf else "")
        draft_title = (draft[:140] + "…") if len(draft) > 140 else draft
        items.append(
            {
                "uid": f"w-copy-{eid[:12]}",
                "title": draft_title,
                "subtitle": title_cp,
                "arg": encode_km_arg(base_pay, False),
                "valid": True,
                "text": {"copy": draft, "largetype": draft},
                "mods": {
                    "cmd": {
                        "valid": True,
                        "subtitle": "⌘↩／复制并粘贴（若已补全将写入常用）",
                        "arg": encode_km_arg(base_pay, True),
                    },
                    "alt": {
                        "valid": True,
                        "subtitle": "⌥↩ 追加 | pbcopy (将命令执行结果存入剪贴板)",
                        "arg": encode_km_arg({**base_pay, "cmd": f"{pure_copy_cmd(draft)} | tr -d '\\n' | pbcopy" if draft else ""}, True),
                    }
                },
            }
        )

    op = str(parsed.get("op") or "")
    focus_pid = str(parsed.get("pid") or "") if op in ("pick", "freeform") else ""
    p_focus = find_param(params, focus_pid) if focus_pid else None

    if p_focus is not None and op in ("pick", "freeform"):
        items.append(
            {
                "uid": f"w-back-{eid[:8]}",
                "title": "← 返回参数列表",
                "subtitle": "Tab / 回车 · 回到上一级（仅列参数摘要）",
                "valid": False,
                "autocomplete": f"{WIZ_PREFIX}e|{eid}",
            }
        )
        _add_copy_row()
        items.extend(_wizard_param_value_items(eid, p_focus, sess))
    else:
        _add_copy_row()
        for p in params:
            pid = p["id"]
            label = str(p.get("label") or pid)
            cur = (
                (sess["brace"] if p["type"] == "brace" else sess["flag"]).get(pid, "")
            )
            cur_s = str(cur).strip()
            disp = cur_s if cur_s else "（未填）"
            hint_line = _wizard_hint_subtitle(p)
            sub = "Tab 展开 · 候选值与自由输入"
            if hint_line:
                sub = f"{sub} · {hint_line}"
            items.append(
                {
                    "uid": f"w-sum-{eid[:8]}-{pid}",
                    "title": f"{label}：{disp}",
                    "subtitle": sub,
                    "valid": False,
                    "autocomplete": f"{WIZ_PREFIX}e|{eid}|pick|{pid}",
                }
            )
    ql = wizard_quicklook_payload(row, cmd_tpl, draft, params, sess)
    quri = write_quicklook_preview(state, eid, ql)
    for it in items:
        it["quicklookurl"] = quri
    return items


def find_param(params: list[dict[str, Any]], pid: str) -> dict[str, Any] | None:
    for p in params:
        if p["id"] == pid:
            return p
    return None


def set_session_value(sess: dict[str, Any], param: dict[str, Any], val: str) -> None:
    if param["type"] == "brace":
        sess["brace"][param["id"]] = val
    else:
        sess["flag"][param["id"]] = val


def ac_set(entry_id: str, pid: str, val: str) -> str:
    return f"{WIZ_PREFIX}e|{entry_id}|v|{pid}|{quote(val, safe='')}"
