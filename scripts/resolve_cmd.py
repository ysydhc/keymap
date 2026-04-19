#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Alfred Run Script：解析 KM:BASE64 负载，填充 {name} 占位符，写入剪贴板，可选粘贴。
维护 placeholder 记忆、LRU 常用 entry、最近完整命令。
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z0-9_]+)\}")


def _state_dir() -> Path:
    raw = os.environ.get("KEYMAP_STATE", "").strip()
    if raw:
        p = Path(raw).expanduser()
    else:
        p = Path(os.environ.get("TOOLS_DIR", ".")).expanduser().parent / "keymap_state"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _config(state: Path) -> dict[str, Any]:
    cfg_path = state / "keymap_config.json"
    defaults = {
        "favorites_per_tool": 3,
        "favorites_capacity": 5,
        "recents_capacity": 5,
        "placeholder_remember_n": 5,
        "open_http_links": True,
        "persist_param_defaults": False,
        "tool_json_backup_before_write": True,
        "tool_json_validate_before_write": True,
    }
    if not cfg_path.is_file():
        return defaults
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            merged = {**defaults}
            for k in defaults:
                if k in data:
                    merged[k] = data[k]
            return merged
    except (OSError, json.JSONDecodeError):
        pass
    return defaults


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _dialog_ask(prompt: str, default: str) -> str:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".applescript", delete=False, encoding="utf-8"
    ) as f:
        f.write(
            "try\n"
            f"  return text returned of (display dialog {json.dumps(prompt)} "
            f"default answer {json.dumps(default)} "
            'buttons {"取消", "确定"} default button "确定")\n'
            "on error number -128\n"
            "  error number -128\n"
            "end try\n"
        )
        name = f.name
    try:
        out = subprocess.check_output(["osascript", name], text=True).strip()
        return out
    except subprocess.CalledProcessError as e:
        if e.returncode in (1, -128):
            raise SystemExit(1) from e
        raise
    finally:
        try:
            os.unlink(name)
        except OSError:
            pass


def _pbcopy(text: str) -> None:
    subprocess.run(["pbcopy"], input=text.encode("utf-8"), check=False)


def _paste() -> None:
    subprocess.run(
        ["osascript", "-e", 'tell application "System Events" to keystroke "v" using command down'],
        check=False,
    )


def _open_url(url: str) -> None:
    subprocess.run(["open", url], check=False)


def _touch_tool_favorite(state: Path, tool: str, entry_id: str, cap: int) -> None:
    path = state / "favorites_by_tool.json"
    store = _read_json(path, {})
    if not isinstance(store, dict):
        store = {}
    tkey = tool.strip() if tool.strip() else "_"
    ids = store.get(tkey)
    if not isinstance(ids, list):
        ids = []
    ids = [x for x in ids if str(x) != entry_id]
    ids.insert(0, entry_id)
    ids = ids[: max(1, cap)]
    store[tkey] = ids
    _write_json(path, store)


def _touch_lru(path: Path, key: str, cap: int) -> None:
    data = _read_json(path, [])
    if not isinstance(data, list):
        data = []
    data = [x for x in data if x != key]
    data.insert(0, key)
    data = data[: max(1, cap)]
    _write_json(path, data)


def _push_recent(state: Path, cap: int, entry_id: str, title: str, final: str) -> None:
    path = state / "recent_completions.json"
    rows = _read_json(path, [])
    if not isinstance(rows, list):
        rows = []
    rows = [r for r in rows if not (isinstance(r, dict) and r.get("entry_id") == entry_id)]
    rows.insert(
        0,
        {"entry_id": entry_id, "title": title, "cmd": final, "ts": int(time.time())},
    )
    rows = rows[: max(1, cap)]
    _write_json(path, rows)


def _update_placeholder_cache(
    state: Path, entry_id: str, values: dict[str, str], remember_n: int
) -> None:
    path = state / "placeholder_values.json"
    store = _read_json(path, {})
    if not isinstance(store, dict):
        store = {}
    prev = store.get(entry_id)
    if not isinstance(prev, dict):
        prev = {}
    for k, v in values.items():
        prev[k] = v
    ko_path = state / "placeholder_key_order.json"
    ord_map = _read_json(ko_path, {})
    if not isinstance(ord_map, dict):
        ord_map = {}
    ord_list = ord_map.get(entry_id)
    if not isinstance(ord_list, list):
        ord_list = []
    for k in values:
        if k in ord_list:
            ord_list.remove(k)
        ord_list.insert(0, k)
    ord_list = ord_list[:remember_n]
    ord_map[entry_id] = ord_list
    store[entry_id] = prev
    _write_json(path, store)
    _write_json(ko_path, ord_map)


def _resolve_cmd(
    cmd: str,
    entry_id: str,
    title: str,
    state: Path,
    cfg: dict[str, Any],
    ph_spec: Any = None,
) -> str:
    keys = _PLACEHOLDER_RE.findall(cmd)
    if not keys:
        return cmd
    path_pv = state / "placeholder_values.json"
    store = _read_json(path_pv, {})
    remembered: dict[str, str] = {}
    if isinstance(store, dict) and isinstance(store.get(entry_id), dict):
        remembered = {str(k): str(v) for k, v in store[entry_id].items()}
    seen: set[str] = set()
    values: dict[str, str] = {}
    for k in keys:
        if k in seen:
            continue
        seen.add(k)
        spec_k: dict[str, Any] = {}
        if isinstance(ph_spec, dict) and isinstance(ph_spec.get(k), dict):
            spec_k = ph_spec[k]
        remember_ok = bool(spec_k.get("remember", True))
        spec_default = str(spec_k.get("default") or "")
        remembered_v = remembered.get(k, "") if remember_ok else ""
        default = spec_default or remembered_v
        label = str(spec_k.get("label") or k)
        try:
            values[k] = _dialog_ask(f"{title}\n「{label}」", default)
        except SystemExit:
            raise
    out = cmd
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    _update_placeholder_cache(
        state, entry_id, values, int(cfg.get("placeholder_remember_n", 5))
    )
    return out


def _decode_ke(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if not raw.startswith("KE:"):
        raise ValueError("not_ke")
    b = raw[3:].strip()
    pad = "=" * (-len(b) % 4)
    body = base64.urlsafe_b64decode(b + pad).decode("utf-8")
    o = json.loads(body)
    if not isinstance(o, dict):
        raise ValueError("ke_bad")
    return o


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


def _tools_dir() -> Path:
    raw = os.environ.get("TOOLS_DIR", "").strip()
    return Path(raw).expanduser() if raw else Path(".")


def _invalidate_tool_cache(state: Path) -> None:
    p = state / "tool_names.cache.json"
    try:
        p.unlink()
    except OSError:
        pass


def _save_tool_json(
    path: Path,
    items: list[dict[str, Any]],
    envelope: dict[str, Any],
    tools_dir: Path,
    state: Path,
    cfg: dict[str, Any],
) -> None:
    from keymap_editor_filter import save_tool_structure
    from keymap_tool_json import save_tool_structure_validated

    v = bool(cfg.get("tool_json_validate_before_write", True))
    b = bool(cfg.get("tool_json_backup_before_write", True))
    if v or b:
        save_tool_structure_validated(
            path,
            items,
            envelope,
            tools_dir,
            state,
            do_validate=v,
            do_backup=b,
        )
    else:
        save_tool_structure(path, items, envelope)


def _platform_allowed(obj: dict[str, Any]) -> bool:
    spec = obj.get("platform")
    if spec is None:
        spec = obj.get("when")
    if spec is None:
        return True
    raw = spec if isinstance(spec, list) else [spec]
    toks = {str(x).strip().lower() for x in raw if x is not None and str(x).strip()}
    if not toks or "all" in toks:
        return True
    is_mac = sys.platform == "darwin"
    wants_mac = bool(toks & {"darwin", "macos", "osx", "mac"})
    wants_win = "windows" in toks
    wants_linux = "linux" in toks
    if wants_mac and not is_mac:
        return False
    if wants_win and sys.platform != "win32":
        return False
    if wants_linux and sys.platform != "linux":
        return False
    return True


def _shortcut_parts(obj: dict[str, Any]) -> str:
    a = str(obj.get("keys") or "").strip()
    b = str(obj.get("sequence") or "").strip()
    if a and b and a != b:
        return f"{a} {b}"
    return a or b


def _stable_entry_id(tool: str, idx_key: str, id_basis: str) -> str:
    raw = f"{tool}|{idx_key}|{id_basis}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


def _entry_hash_for_obj(obj: dict[str, Any], tool_stem: str, idx: int) -> str | None:
    if not _platform_allowed(obj):
        return None
    shortcut = _shortcut_parts(obj)
    cmd = obj.get("cmd")
    if cmd is None:
        cmd = obj.get("copy") or obj.get("text") or ""
    cmd = str(cmd).strip()
    if not cmd and shortcut:
        cmd = shortcut
    keyword = str(obj.get("keyword") or "").strip()
    action = str(obj.get("action") or obj.get("effect") or "").strip()
    if not cmd and not keyword and not shortcut:
        return None
    idx_key = str(obj.get("id") or obj.get("slug") or idx)
    id_basis = "|".join([cmd, keyword, shortcut, action])
    return _stable_entry_id(tool_stem, idx_key, id_basis)


def _apply_param_values_to_entry(obj: dict[str, Any], pv: dict[str, Any]) -> bool:
    """将本次 brace/flag 写入条目 params[].default；条目须含非空 params 列表。"""
    pl = obj.get("params")
    if not isinstance(pl, list) or not pl:
        return False
    b = pv.get("brace") if isinstance(pv.get("brace"), dict) else {}
    f = pv.get("flag") if isinstance(pv.get("flag"), dict) else {}
    cmd = str(obj.get("cmd") or "")
    changed = False
    for p in pl:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or "").strip()
        if not pid or p.get("no_persist_default"):
            continue
        typ = str(p.get("type") or "flag").strip().lower()
        if typ not in ("brace", "flag"):
            typ = "brace" if f"{{{pid}}}" in cmd else "flag"
        src = b if typ == "brace" else f
        if pid not in src:
            continue
        val = str(src[pid]).strip()
        if not val:
            continue
        old = p.get("default")
        old_s = None if old is None else str(old)
        if old_s != val:
            p["default"] = val
            changed = True
    return changed


def _persist_param_defaults(
    tools_dir: Path,
    state: Path,
    tool_stem: str,
    entry_id: str,
    pv: dict[str, Any],
    cfg: dict[str, Any],
) -> None:
    from keymap_editor_filter import load_tool_structure

    if not tool_stem or entry_id == "plain":
        return
    path = tools_dir / f"{tool_stem}.json"
    if not path.is_file():
        return
    items, env = load_tool_structure(path)
    for idx, obj in enumerate(items):
        eh = _entry_hash_for_obj(obj, tool_stem, idx)
        if eh != entry_id:
            continue
        if not _apply_param_values_to_entry(obj, pv):
            return
        _save_tool_json(path, items, env, tools_dir, state, cfg)
        _invalidate_tool_cache(state)
        return
    raise ValueError(f"entry_not_found:{entry_id}")


def _editor_apply(tools_dir: Path, state: Path, ke: dict[str, Any], cfg: dict[str, Any]) -> None:
    from keymap_editor_filter import load_tool_structure

    fname = str(ke.get("file") or "").strip()
    if not fname or fname != Path(fname).name or ".." in fname:
        raise ValueError("bad_file")
    entry = ke.get("entry")
    if not isinstance(entry, dict):
        raise ValueError("bad_entry")
    eid = str(entry.get("id", "")).strip()
    if not eid:
        raise ValueError("bad_id")
    path = tools_dir / fname
    items, env = load_tool_structure(path)
    rid = ke.get("replace_id")
    if rid is not None and str(rid).strip():
        rs = str(rid).strip()
        items = [x for x in items if str(x.get("id", "")) != rs]
    else:
        if any(str(x.get("id", "")) == eid for x in items):
            raise ValueError(f"duplicate_id:{eid}")
    items.append(entry)
    _save_tool_json(path, items, env, tools_dir, state, cfg)
    _invalidate_tool_cache(state)


def _editor_delete(tools_dir: Path, state: Path, ke: dict[str, Any], cfg: dict[str, Any]) -> None:
    from keymap_editor_filter import load_tool_structure

    fname = str(ke.get("file") or "").strip()
    rid = str(ke.get("id", "")).strip()
    if not fname or fname != Path(fname).name or not rid:
        raise ValueError("bad_del")
    path = tools_dir / fname
    items, env = load_tool_structure(path)
    n = len(items)
    items = [x for x in items if str(x.get("id", "")) != rid]
    if len(items) == n:
        raise ValueError("id_not_found")
    _save_tool_json(path, items, env, tools_dir, state, cfg)
    _invalidate_tool_cache(state)


def _decode_arg(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("KM:"):
        payload = base64.b64decode(raw[3:].encode("ascii")).decode("utf-8")
        return json.loads(payload)
    if raw.startswith("KP:"):
        blob = base64.b64decode(raw[3:].encode("ascii")).decode("utf-8")
        try:
            o = json.loads(blob)
            if isinstance(o, dict) and "cmd" in o:
                return {
                    "v": 1,
                    "mode": "plain",
                    "cmd": str(o["cmd"]),
                    "entry_id": "plain",
                    "title": "",
                    "paste": bool(o.get("paste")),
                }
        except json.JSONDecodeError:
            pass
        return {"v": 1, "mode": "plain", "cmd": blob, "entry_id": "plain", "title": "", "paste": False}
    raise ValueError("bad_arg")


def main() -> None:
    raw = sys.argv[1] if len(sys.argv) > 1 else ""
    state = _state_dir()
    if raw.strip().startswith("KE:"):
        cfg_ke = _config(state)
        try:
            ke = _decode_ke(raw)
        except (ValueError, json.JSONDecodeError, OSError):
            sys.exit(1)
        if bool(ke.get("noop")):
            sys.exit(0)
        tools_dir = _tools_dir()
        op = str(ke.get("op", "")).strip().lower()
        try:
            if op == "apply":
                _editor_apply(tools_dir, state, ke, cfg_ke)
                _notify("KeyMap", f"已写入 tools/{ke.get('file')}")
            elif op == "delete":
                _editor_delete(tools_dir, state, ke, cfg_ke)
                _notify("KeyMap", f"已删除 {ke.get('id')}")
            else:
                sys.exit(1)
        except ValueError as e:
            _notify("KeyMap 错误", str(e))
            sys.exit(1)
        sys.exit(0)

    cfg = _config(state)
    try:
        data = _decode_arg(raw)
    except (ValueError, json.JSONDecodeError, OSError):
        sys.exit(1)

    cmd = str(data.get("cmd", ""))
    entry_id = str(data.get("entry_id", ""))
    title = str(data.get("title", "")) or entry_id[:12]
    do_paste = bool(data.get("paste"))
    ver = int(data.get("v", 1))
    draft = bool(data.get("draft", False))
    if data.get("mode") == "plain":
        final = cmd
    elif ver >= 2:
        final = cmd
    else:
        try:
            final = _resolve_cmd(
                cmd, entry_id, title, state, cfg, data.get("placeholders")
            )
        except SystemExit:
            sys.exit(1)

    if (
        bool(cfg.get("persist_param_defaults"))
        and ver >= 2
        and not draft
        and bool(data.get("wizard_complete"))
        and entry_id
        and entry_id != "plain"
    ):
        pv = data.get("param_values")
        if isinstance(pv, dict) and (pv.get("brace") or pv.get("flag")):
            try:
                _persist_param_defaults(
                    _tools_dir(),
                    state,
                    str(data.get("tool", "")).strip(),
                    entry_id,
                    pv,
                    cfg,
                )
            except ValueError as e:
                msg = str(e)
                if not msg.startswith("entry_not_found:"):
                    _notify("KeyMap 参数回写", msg)
            except OSError as e:
                _notify("KeyMap 参数回写", str(e))

    _pbcopy(final)
    if (
        bool(cfg.get("open_http_links", True))
        and not do_paste
        and data.get("mode") == "plain"
    ):
        fs = final.strip()
        if fs.startswith("http://") or fs.startswith("https://"):
            _open_url(fs)
    per_tool = int(
        cfg.get("favorites_per_tool", cfg.get("favorites_capacity", 3))
    )
    if entry_id and entry_id != "plain" and ver >= 2 and not draft:
        _touch_tool_favorite(state, str(data.get("tool", "")), entry_id, per_tool)
    elif entry_id and entry_id != "plain" and ver < 2:
        _touch_lru(
            state / "lru_favorites.json", entry_id, int(cfg["favorites_capacity"])
        )
    if entry_id and entry_id != "plain" and (ver < 2 or not draft):
        _push_recent(state, int(cfg["recents_capacity"]), entry_id, title, final)
    if do_paste:
        _paste()


if __name__ == "__main__":
    main()
