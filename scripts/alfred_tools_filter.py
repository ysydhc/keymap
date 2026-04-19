#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Alfred Script Filter：按 tools 目录中的 JSON（文件名=工具名）构建索引；
支持单级全文模糊、多级在匹配工具内搜索、Tab 展开工具、空查询 LRU/最近/文件入口；
匹配度排序。可选元字段：aliases、tags、doc/url、weight/priority、deprecated、replaced_by、
platform/when、params（Tab 向导）；旧版 placeholders 在无 params 时会自动转为 params、paste_mode、description 等。
JSON 根对象（与 tools/items 并列）可有 aliases / file_aliases：文件级短名（如 cc→claude-code），用于 km 多词检索首段匹配；与条目内 aliases 不同。
快捷键检索（场景 1）：keys、sequence、action/effect、mode/context；语义权重高于键位。
场景 2：库中无匹配时追加「引导行」（:help、搜索链接等），见 keymap_state/discovery_hints.json。
输出 KM:/KP: 供 resolve_cmd。

环境变量 KEYMAP_MODE：缺省为 browse（keyword km：首页常用/最近/工具文件 + 搜索）；
search（keyword kms：仅搜索命令/快捷键，空查询不展首页；匹配时加重 cmd 字段；
非空查询时列表顶部追加 Google / DuckDuckGo / Bing，回车复制链接并经系统浏览器打开，见 kms_web_search 与 open_http_links）。
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import keymap_wizard as kw


def _as_str_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if x is not None and str(x).strip()]
    if isinstance(val, str):
        parts = re.split(r"[\s,;，；]+", val.strip())
        return [p for p in parts if p]
    return [str(val).strip()]


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


def _entry_weight(obj: dict[str, Any]) -> float:
    for k in ("weight", "priority"):
        v = obj.get(k)
        if v is None:
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    return 0.0


def _effective_match_score(base: float, row: dict[str, Any]) -> float:
    s = base + float(row.get("_weight", 0.0)) * 3.0
    if row.get("_deprecated"):
        s *= 0.72
    return s


def _shortcut_parts(obj: dict[str, Any]) -> str:
    a = str(obj.get("keys") or "").strip()
    b = str(obj.get("sequence") or "").strip()
    if a and b and a != b:
        return f"{a} {b}"
    return a or b


def _shortcut_keys_hay_extras(shortcut: str) -> str:
    if not shortcut:
        return ""
    loose = re.sub(r"[<>]", " ", shortcut)
    loose = re.sub(r"[-_]+", " ", loose)
    bits = [shortcut, loose.strip()]
    # Vim :help 记法 <C-u>：在 Vim 里是 Ctrl+u；检索侧补「ctrl / control」便于 Alfred 输入
    for ch in re.findall(r"(?i)<C-([a-z])>", shortcut):
        c = ch.lower()
        bits.append(f"ctrl {c} control {c} ctl {c}")
    return " ".join(b for b in bits if b).strip()


def _score_row_tokens(tokens: list[str], row: dict[str, Any]) -> float:
    """语义（功能描述）与键位分列打分，语义权重更高。"""
    if not tokens:
        return 0.0
    sem = (row.get("_semantic_hay") or "").strip()
    keyh = (row.get("_keys_hay") or "").strip()
    full = (row.get("hay") or "").strip()
    s_sem = _score_tokens(tokens, sem) if sem else 0.0
    s_key = _score_tokens(tokens, keyh) if keyh else 0.0
    s_full = _score_tokens(tokens, full) if full else 0.0
    if sem:
        return s_sem * 0.52 + s_key * 0.33 + s_full * 0.15
    return s_key * 0.58 + s_full * 0.42


CONFIG_NAME = "keymap_config.json"
DISCOVERY_HINTS_NAME = "discovery_hints.json"

_DEFAULT_DISCOVERY: dict[str, Any] = {
    "global": [
        {
            "title": "复制当前搜索词",
            "subtitle": "粘贴到浏览器、LLM 或终端",
            "cmd": "{q}",
        },
        {
            "title": "DuckDuckGo 搜索",
            "subtitle": "库外继续查资料",
            "cmd": "https://duckduckgo.com/?q={q_enc}",
        },
    ],
    "by_tool": {
        "vim": [
            {
                "title": "Vim :help {rest}",
                "subtitle": "在 Vim 命令行执行",
                "cmd": ":help {rest}",
            },
            {
                "title": "Vim :help 模糊主题",
                "subtitle": ":help *片段*",
                "cmd": ":help *{rest}*",
            },
            {
                "title": "Vim :map 前缀",
                "subtitle": "查看映射（需进入 Vim）",
                "cmd": ":map {rest}",
            },
            {
                "title": "vimhelp.org",
                "subtitle": "在线文档首页",
                "cmd": "https://vimhelp.org/",
            },
        ],
    },
}


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s).casefold()


def _state_dir() -> Path:
    raw = os.environ.get("KEYMAP_STATE", "").strip()
    if raw:
        p = Path(raw).expanduser()
    else:
        p = Path(os.environ.get("TOOLS_DIR", ".")).expanduser()
        p = p.parent / "keymap_state"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _cfg() -> dict[str, Any]:
    st = _state_dir()
    p = st / "keymap_config.json"
    defaults = {
        "favorites_per_tool": 3,
        "favorites_capacity": 5,
        "recents_capacity": 5,
        "discovery_enabled": True,
        "placeholder_remember_n": 5,
        "kms_web_search": True,
    }
    if not p.is_file():
        return defaults
    data = _read_json(p, {})
    if isinstance(data, dict):
        out = {**defaults}
        for k in defaults:
            if k in data:
                out[k] = data[k]
        return out
    return defaults


def _discovery_ctx(
    q: str,
    match_stems: list[str],
    by_tool: dict[str, list[dict[str, Any]]],
) -> dict[str, str]:
    raw = q.strip()
    parts = raw.split()
    if len(parts) >= 2:
        matched = _matching_tool_stems(parts[0], match_stems)
        if matched:
            rest = " ".join(parts[1:])
            rows0 = by_tool.get(matched[0], [])
            canon = str(rows0[0]["tool"]) if rows0 else matched[0]
            return {
                "q": raw,
                "full": raw,
                "rest": rest,
                "tool": canon,
                "q_enc": quote_plus(raw, safe=""),
                "rest_enc": quote_plus(rest, safe=""),
            }
    return {
        "q": raw,
        "full": raw,
        "rest": raw,
        "tool": "",
        "q_enc": quote_plus(raw, safe=""),
        "rest_enc": quote_plus(raw, safe=""),
    }


def _load_discovery_merged(state: Path) -> dict[str, Any]:
    user = _read_json(state / "discovery_hints.json", {})
    if not isinstance(user, dict):
        user = {}

    def merge_global() -> list[Any]:
        u = user.get("global")
        d = list(_DEFAULT_DISCOVERY.get("global", []))
        if isinstance(u, list):
            return u + d
        return d

    by_tool: dict[str, list[Any]] = copy.deepcopy(
        _DEFAULT_DISCOVERY.get("by_tool", {})  # type: ignore[arg-type]
    )
    ubt = user.get("by_tool")
    if isinstance(ubt, dict):
        for tool, rows in ubt.items():
            if not isinstance(rows, list):
                continue
            base = by_tool.get(tool, [])
            by_tool[tool] = rows + base
    return {"global": merge_global(), "by_tool": by_tool}


def _discovery_apply_template(tpl: str, ctx: dict[str, str]) -> str:
    out = tpl
    for key, val in ctx.items():
        out = out.replace("{" + key + "}", val)
    return out


def _discovery_hint_to_item(defi: dict[str, Any], ctx: dict[str, str]) -> dict[str, Any] | None:
    tpl = str(defi.get("cmd") or "").strip()
    if not tpl:
        return None
    cmd = _discovery_apply_template(tpl, ctx)
    title_tpl = str(defi.get("title") or "引导").strip()
    title = _discovery_apply_template(title_tpl, ctx)
    sub_tpl = str(defi.get("subtitle") or "").strip()
    subtitle = _discovery_apply_template(sub_tpl, ctx) if sub_tpl else "未收录 · 场景2"
    uid_s = hashlib.md5((title + cmd).encode("utf-8")).hexdigest()[:14]
    return {
        "uid": f"d-{uid_s}",
        "title": title,
        "subtitle": subtitle,
        "arg": _encode_kp(cmd, False),
        "valid": True,
        "text": {"copy": cmd, "largetype": cmd},
        "mods": {
            "cmd": {
                "valid": True,
                "subtitle": "⌘↩ 复制并粘贴",
                "arg": _encode_kp(cmd, True),
            }
        },
    }


def _discovery_items(
    q: str,
    match_stems: list[str],
    by_tool: dict[str, list[dict[str, Any]]],
    state: Path,
    cfg: dict[str, Any],
) -> list[dict[str, Any]]:
    if not cfg.get("discovery_enabled", True):
        return []
    ctx = _discovery_ctx(q, match_stems, by_tool)
    merged = _load_discovery_merged(state)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in merged.get("global", []):
        if not isinstance(row, dict):
            continue
        it = _discovery_hint_to_item(row, ctx)
        if it:
            c = it["text"]["copy"]
            if c not in seen:
                seen.add(c)
                out.append(it)

    tools_extra: list[str] = []
    if ctx["tool"]:
        tools_extra.append(ctx["tool"])
    for t in tools_extra:
        for row in merged.get("by_tool", {}).get(t, []):
            if not isinstance(row, dict):
                continue
            it = _discovery_hint_to_item(row, ctx)
            if it:
                c = it["text"]["copy"]
                if c not in seen:
                    seen.add(c)
                    out.append(it)
    return out


_LIST_ROOT_KEYS = ("tools", "commands", "items", "entries")


def _dict_has_tool_list(data: dict[str, Any]) -> bool:
    return any(
        k in data and isinstance(data[k], list) for k in _LIST_ROOT_KEYS
    )


def _file_root_aliases(data: Any) -> list[str]:
    """JSON 根对象上的文件级别名（缩短工具名输入）；需与 tools/items 等并列。"""
    if not isinstance(data, dict) or not _dict_has_tool_list(data):
        return []
    raw = data.get("aliases")
    if raw is None:
        raw = data.get("file_aliases")
    return _as_str_list(raw)


def _tool_json_paths(tools_dir: Path) -> list[Path]:
    if not tools_dir.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(tools_dir.glob("*.json")):
        if not p.is_file():
            continue
        if p.name.startswith("_"):
            continue
        if p.name == CONFIG_NAME:
            continue
        if p.name == DISCOVERY_HINTS_NAME:
            continue
        out.append(p)
    return out


def _cached_tool_stems(tools_dir: Path, state: Path) -> list[str]:
    cache_path = state / "tool_names.cache.json"
    try:
        mtime = tools_dir.stat().st_mtime
    except OSError:
        return [p.stem for p in _tool_json_paths(tools_dir)]
    cached = _read_json(cache_path, None)
    if (
        isinstance(cached, dict)
        and cached.get("mtime") == mtime
        and isinstance(cached.get("names"), list)
    ):
        return [str(x) for x in cached["names"]]
    names = [p.stem for p in _tool_json_paths(tools_dir)]
    try:
        cache_path.write_text(
            json.dumps({"mtime": mtime, "names": names}, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError:
        pass
    return names


def _stable_entry_id(tool: str, idx_key: str, cmd: str) -> str:
    raw = f"{tool}|{idx_key}|{cmd}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


def _encode_km(payload: dict[str, Any], paste: bool) -> str:
    body = {**payload, "paste": paste}
    b = base64.b64encode(json.dumps(body, ensure_ascii=False).encode("utf-8")).decode("ascii")
    return "KM:" + b


def _encode_kp(final_cmd: str, paste: bool) -> str:
    meta = json.dumps({"cmd": final_cmd, "paste": paste}, ensure_ascii=False).encode("utf-8")
    b = base64.b64encode(meta).decode("ascii")
    return "KP:" + b


def _kms_web_engine_rows(
    engines: tuple[tuple[str, str], ...], title_fmt: str, sub: str
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name, url in engines:
        uid = "web-" + hashlib.md5(url.encode("utf-8")).hexdigest()[:12]
        out.append(
            {
                "uid": uid,
                "title": title_fmt.format(name=name),
                "subtitle": sub,
                "arg": _encode_kp(url, False),
                "valid": True,
                "text": {"copy": url, "largetype": url},
                "quicklookurl": url,
                "mods": {
                    "cmd": {
                        "valid": True,
                        "subtitle": "⌘↩ 复制并粘贴",
                        "arg": _encode_kp(url, True),
                    }
                },
            }
        )
    return out


def _kms_web_portal_items() -> list[dict[str, Any]]:
    """无搜索词时：各引擎首页（仍可立刻在浏览器里搜）。"""
    engines = (
        ("Google", "https://www.google.com/"),
        ("DuckDuckGo", "https://duckduckgo.com/"),
        ("Bing", "https://www.bing.com/"),
    )
    sub = "回车：打开首页 · 继续输入词后顶行会变成「该词」的搜索结果"
    return _kms_web_engine_rows(engines, "{name}（搜索首页）", sub)


def _kms_web_query_items(qq: str) -> list[dict[str, Any]]:
    enc = quote_plus(qq, safe="")
    engines = (
        ("Google", f"https://www.google.com/search?q={enc}"),
        ("DuckDuckGo", f"https://duckduckgo.com/?q={enc}"),
        ("Bing", f"https://www.bing.com/search?q={enc}"),
    )
    disp = qq if len(qq) <= 36 else qq[:33] + "…"
    sub = "回车:复制链接+浏览器打开; Shift: Quick Look"
    return _kms_web_engine_rows(engines, "{name} 搜索：" + disp, sub)


def _kms_web_search_items(q: str, enabled: bool) -> list[dict[str, Any]]:
    """kms / ksearch：非空 q 为站内搜索 URL；空 q 为引擎首页。"""
    if not enabled:
        return []
    qq = q.strip()
    if not qq:
        return _kms_web_portal_items()
    return _kms_web_query_items(qq)


def _subseq_score(needle: str, hay: str) -> float:
    if not needle:
        return 1.0
    n, h = _norm(needle), _norm(hay)
    if not n:
        return 1.0
    if n in h:
        return 120.0 + min(40.0, 30.0 * len(n) / max(1, len(h)))
    i = 0
    adv = 0.0
    for ch in h:
        if i < len(n) and ch == n[i]:
            i += 1
            adv += 1.0
    if i < len(n):
        return 0.0
    tight = 55.0 * (len(n) / max(1, len(h)))
    return tight + min(25.0, adv * 2.0)


def _score_tokens(tokens: list[str], hay: str) -> float:
    if not tokens:
        return 1.0
    scores = [_subseq_score(t, hay) for t in tokens if t]
    if not scores:
        return 0.0
    mn = min(scores)
    avg = sum(scores) / len(scores)
    return mn * 0.65 + avg * 0.35


def _matching_tool_stems(first: str, stems: list[str]) -> list[str]:
    if not first:
        return []
    scored: list[tuple[str, float]] = []
    for s in stems:
        sc = max(_subseq_score(first, s), _subseq_score(first, s.replace("-", " ")))
        if sc > 0:
            scored.append((s, sc))
    if not scored:
        return []
    best = max(sc for _, sc in scored)
    cutoff = best * 0.82
    return [s for s, sc in scored if sc >= cutoff]


def _legacy_placeholders_to_params(cmd: str, ph: Any) -> list[dict[str, Any]] | None:
    """将旧版 placeholders 转为 params，供 collect_params 使用（与手写 params 二选一即可）。"""
    if not isinstance(ph, dict) or not ph:
        return None
    out: list[dict[str, Any]] = []
    for raw_key, spec in ph.items():
        if not isinstance(spec, dict):
            continue
        pid = str(raw_key).strip()
        if not pid:
            continue
        label = str(spec.get("label") or pid).strip()
        dflt = spec.get("default")
        if dflt is None or (isinstance(dflt, str) and not dflt.strip()):
            default: str | None = None
        else:
            default = str(dflt).strip()
        typ: str = "brace" if f"{{{pid}}}" in cmd else "flag"
        row: dict[str, Any] = {"id": pid, "type": typ, "label": label}
        if default is not None:
            row["default"] = default
        out.append(row)
    return out or None


def _extract_items(data: Any, tool_stem: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def one(obj: dict[str, Any], idx: int) -> None:
        if not _platform_allowed(obj):
            return
        shortcut = _shortcut_parts(obj)
        cmd = obj.get("cmd")
        if cmd is None:
            cmd = obj.get("copy") or obj.get("text") or ""
        cmd = str(cmd).strip()
        if not cmd and shortcut:
            cmd = shortcut
        keyword = str(obj.get("keyword") or "").strip()
        action = str(obj.get("action") or obj.get("effect") or "").strip()
        mode = str(obj.get("mode") or obj.get("context") or "").strip()
        tit = obj.get("title") or obj.get("name") or obj.get("label")
        if tit is None or str(tit).strip() == "":
            title = (
                action
                or keyword
                or (shortcut[:40] + ("…" if len(shortcut) > 40 else "") if shortcut else "")
                or (cmd[:48] + ("…" if len(cmd) > 48 else ""))
            )
        else:
            title = str(tit).strip()
        if not title:
            title = shortcut or cmd or "—"
        extra_bits: list[str] = []
        for k in ("subtitle", "note", "desc", "description"):
            v = obj.get(k)
            if v is not None and str(v).strip():
                extra_bits.append(str(v).strip())
        aliases = _as_str_list(obj.get("aliases"))
        tags = _as_str_list(obj.get("tags"))
        extra = " ".join(extra_bits)
        if not cmd and not keyword and not shortcut:
            return
        idx_key = str(obj.get("id") or obj.get("slug") or idx)
        id_basis = "|".join([cmd, keyword, shortcut, action])
        eid = _stable_entry_id(tool_stem, idx_key, id_basis)
        alias_s = " ".join(aliases)
        tag_s = " ".join(tags)
        semantic_core = " ".join(
            [tool_stem, title, action, extra, alias_s, tag_s]
        ).strip()
        semantic_hay = semantic_core
        if action:
            semantic_hay = f"{action} {semantic_core} {action}"
        keys_hay = " ".join(
            p
            for p in (
                _shortcut_keys_hay_extras(shortcut),
                keyword,
                cmd,
                mode,
                tool_stem,
            )
            if p
        )
        hay = f"{semantic_hay} {keys_hay}".strip()
        doc_u = obj.get("doc") or obj.get("url") or ""
        doc_u = str(doc_u).strip() if doc_u else ""
        desc_long = ""
        for k in ("description", "note", "desc", "subtitle"):
            v = obj.get(k)
            if v is not None:
                s = str(v).strip()
                if len(s) > len(desc_long):
                    desc_long = s
        params_in = obj.get("params")
        if not isinstance(params_in, list) or len(params_in) == 0:
            legacy = _legacy_placeholders_to_params(cmd, obj.get("placeholders"))
            if legacy is not None:
                params_in = legacy
        params_list = kw.collect_params(cmd, params_in)
        deprecated = bool(obj.get("deprecated"))
        replaced_by = str(obj.get("replaced_by") or "").strip()
        w = _entry_weight(obj)
        paste_mode = str(obj.get("paste_mode") or "copy").strip().lower()
        out.append(
            {
                "tool": tool_stem,
                "title": title,
                "keyword": keyword,
                "cmd": cmd,
                "hay": hay,
                "_semantic_hay": semantic_hay,
                "_keys_hay": keys_hay,
                "_shortcut": shortcut,
                "_mode": mode,
                "_action": action,
                "entry_id": eid,
                "_weight": w,
                "_deprecated": deprecated,
                "_replaced_by": replaced_by,
                "_doc_url": doc_u,
                "_description": desc_long,
                "_params": params_list,
                "_tags": tags,
                "_paste_mode": paste_mode,
            }
        )

    if isinstance(data, list):
        for i, item in enumerate(data):
            if isinstance(item, dict):
                one(item, i)
        return out

    if isinstance(data, dict):
        for key in ("tools", "commands", "items", "entries"):
            if key in data and isinstance(data[key], list):
                for i, item in enumerate(data[key]):
                    if isinstance(item, dict):
                        one(item, i)
                return out
        one(data, 0)

    return out


def _load_index(
    tools_dir: Path,
) -> tuple[
    list[dict[str, Any]],
    dict[str, list[dict[str, Any]]],
    dict[str, list[str]],
]:
    """返回 flat、by_tool（含文件级别名键→同一 rows）、stem→文件级别名列表（展示用）。"""
    by_tool: dict[str, list[dict[str, Any]]] = {}
    flat: list[dict[str, Any]] = []
    stem_file_aliases: dict[str, list[str]] = {}
    for jf in _tool_json_paths(tools_dir):
        stem = jf.stem
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rows = _extract_items(data, stem)
        by_tool[stem] = rows
        flat.extend(rows)
        registered: list[str] = []
        for a in _file_root_aliases(data):
            al = str(a).strip()
            if not al or al == stem:
                continue
            if al in by_tool:
                continue
            by_tool[al] = rows
            registered.append(al)
        if registered:
            stem_file_aliases[stem] = registered
    return flat, by_tool, stem_file_aliases


def _fav_and_recent_items(
    cfg: dict[str, Any],
    state: Path,
    entry_by_id: dict[str, dict[str, Any]],
    stems: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    per_tool = int(
        cfg.get(
            "favorites_per_tool",
            cfg.get("favorites_capacity", 3),
        )
    )
    cap_r = int(cfg.get("recents_capacity", 5))
    fav_store = _read_json(state / "favorites_by_tool.json", {})
    if not isinstance(fav_store, dict):
        fav_store = {}
    fav_items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for stem in stems:
        ids = fav_store.get(stem)
        if not isinstance(ids, list):
            continue
        for eid in ids[:per_tool]:
            es = str(eid)
            if es in seen:
                continue
            row = entry_by_id.get(es)
            if row:
                seen.add(es)
                fav_items.append(row)

    recent_rows: list[dict[str, Any]] = []
    rec = _read_json(state / "recent_completions.json", [])
    if isinstance(rec, list):
        for r in rec:
            if len(recent_rows) >= cap_r:
                break
            if not isinstance(r, dict):
                continue
            cmd = str(r.get("cmd", ""))
            if not cmd:
                continue
            recent_rows.append(
                {
                    "title": str(r.get("title", "最近使用")),
                    "subtitle": "最近补全 · 回车复制",
                    "cmd": cmd,
                    "entry_id": str(r.get("entry_id", "recent")),
                }
            )
    return fav_items, recent_rows


def _final_match_score(
    tokens: list[str], row: dict[str, Any], search_mode: bool
) -> float:
    """search_mode 时对 cmd 字段额外加权，并允许「仅匹配命令字符串」命中。"""
    sc_sem = _score_row_tokens(tokens, row)
    cmd = str(row.get("cmd") or "").strip()
    cmd_sc = _score_tokens(tokens, cmd) if (cmd and tokens) else 0.0
    if not search_mode:
        if sc_sem <= 0:
            return 0.0
        return _effective_match_score(sc_sem, row)
    if sc_sem <= 0 and cmd_sc <= 0:
        return 0.0
    if sc_sem > 0 and cmd_sc > 0:
        combined = sc_sem + cmd_sc * 0.35
    elif sc_sem > 0:
        combined = sc_sem
    else:
        combined = cmd_sc * 0.88
    return _effective_match_score(combined, row)


def _build_rows_for_query(
    q: str,
    tools_dir: Path,
    stems: list[str],
    flat: list[dict[str, Any]],
    by_tool: dict[str, list[dict[str, Any]]],
    search_mode: bool = False,
) -> list[tuple[float, dict[str, Any]]]:
    raw = q
    expand = re.match(r"^(\S+)\s+$", raw)
    if expand:
        stem_guess = expand.group(1)
        matched = _matching_tool_stems(stem_guess, stems)
        targets = matched if matched else stems
        scored: list[tuple[float, dict[str, Any]]] = []
        for st in targets:
            for row in by_tool.get(st, []):
                base = 2000.0 + float(row.get("_weight", 0.0)) * 3.0
                if row.get("_deprecated"):
                    base *= 0.72
                scored.append((base, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    parts = raw.strip().split()
    if not parts:
        return []

    if len(parts) == 1:
        token = parts[0]
        scored = []
        for row in flat:
            fs = _final_match_score([token], row, search_mode)
            if fs > 0:
                scored.append((fs, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    first, rest = parts[0], parts[1:]
    matched = _matching_tool_stems(first, stems)
    if not matched:
        scored = []
        for row in flat:
            fs = _final_match_score(parts, row, search_mode)
            if fs > 0:
                scored.append((fs, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    pool: list[dict[str, Any]] = []
    for st in matched:
        pool.extend(by_tool.get(st, []))
    scored = []
    for row in pool:
        fs = _final_match_score(rest, row, search_mode)
        if fs > 0:
            scored.append((fs, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


def _row_quicklook_payload(row: dict[str, Any], preview_cmd: str) -> dict[str, Any]:
    params = row.get("_params") or []
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
    doc = (row.get("_doc_url") or "").strip()
    out: dict[str, Any] = {
        "_schema": "keymap_quicklook_v1",
        "context": "search_result",
        "tool_file": f'{row.get("tool")}.json',
        "entry_id": row.get("entry_id"),
        "title": row.get("title"),
        "keyword": row.get("keyword"),
        "cmd_template": row.get("cmd"),
        "cmd_preview": preview_cmd,
        "params": plist,
        "shortcut": row.get("_shortcut"),
        "mode": row.get("_mode"),
        "action": row.get("_action"),
        "description": row.get("_description"),
        "tags": row.get("_tags"),
        "deprecated": row.get("_deprecated"),
        "replaced_by": row.get("_replaced_by"),
        "note": "由索引生成的配置视图；含 cmd 模板与当前预览。官方文档见 doc_url。",
    }
    if doc.startswith("http://") or doc.startswith("https://"):
        out["doc_url"] = doc
    return out


# JSON 条目 title 常用「键位 — 说明」；列表主标题改为「说明 -- 键位」便于先扫功能。
_TITLE_EM_DASH = " — "


def _alfred_row_list_title(row: dict[str, Any]) -> str:
    raw = str(row.get("title") or "").strip()
    sk = str(row.get("_shortcut") or "").strip()
    if not raw:
        return sk or str(row.get("keyword") or "—").strip() or "—"
    if _TITLE_EM_DASH in raw:
        left, right = raw.split(_TITLE_EM_DASH, 1)
        left, right = left.strip(), right.strip()
        if right:
            return f"{right} -- {left}" if left else right
        return left or raw
    if sk:
        suf = f" -- {sk}"
        if raw.endswith(suf):
            return raw
        return f"{raw}{suf}"
    return raw


def _alfred_subtitle_param_hint(params: list[Any]) -> str:
    toks: list[str] = []
    for p in params:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or "").strip()
        if not pid:
            continue
        typ = str(p.get("type") or "brace").strip().lower()
        if typ == "brace":
            toks.append(f"{{{pid}}}")
        else:
            ff = str(p.get("flag_field") or pid).strip()
            toks.append(f"--{ff}" if ff else pid)
    if not toks:
        return ""
    if len(toks) > 4:
        return " ".join(toks[:4]) + "…"
    return " ".join(toks)


    if c.startswith("ps aux | grep"):
        # ps aux | grep {name} -> pgrep -f {name}
        parts = c.split("grep", 1)
        if len(parts) == 2:
            return f"pgrep -f {parts[1].strip()}"
            
    # Docker
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
        
    # Git
    if c == "git branch":
        return "git branch --show-current"
    if c == "git log -1" or c == "git log":
        return "git rev-parse HEAD"
    if c == "git remote -v" or c == "git remote":
        return "git config --get remote.origin.url"
    if c == "git status --short" or c == "git status":
        return "git diff --name-only"
        
    return c

def _row_to_item(row: dict[str, Any], badge: str = "") -> dict[str, Any]:
    state = _state_dir()
    list_title = _alfred_row_list_title(row)
    disp_title = f"（废弃）{list_title}" if row.get("_deprecated") else list_title
    tool = row["tool"]
    keyword = row["keyword"]
    cmd = row["cmd"]
    params = row.get("_params") or []
    raw_sess = kw.load_session(state, row["entry_id"])
    eff = kw.merge_session_with_defaults(params, raw_sess)
    preview_cmd = kw.build_draft(cmd, params, eff["brace"], eff["flag"])
    sk = str(row.get("_shortcut") or "").strip()
    mode = str(row.get("_mode") or "").strip()
    act = str(row.get("_action") or "").strip()
    tags = row.get("_tags") or []
    if not isinstance(tags, list):
        tags = []
    tag_s = " ".join(f"#{t}" for t in tags[:6] if t)
    param_hint = _alfred_subtitle_param_hint(params)
    sub_parts: list[str] = []
    if badge:
        sub_parts.append(badge)
    if kw.row_needs_wizard(row):
        sub_parts.append("Tab · 参数拼装")
    if tool:
        sub_parts.append(tool)
    if param_hint:
        sub_parts.append(param_hint)
    if keyword:
        sub_parts.append(keyword)
    if tag_s:
        sub_parts.append(tag_s)
    if row.get("_deprecated"):
        rep = row.get("_replaced_by") or ""
        sub_parts.append("已废弃" + (f" → {rep}" if rep else ""))
    subtitle = " · ".join(sub_parts)
    desc = (row.get("_description") or "").strip()
    lt_lines = [x for x in (act, desc) if x]
    if sk:
        lt_lines.append(f"按键: {sk}")
    if mode:
        lt_lines.append(f"模式: {mode}")
    largetype = "\n".join(lt_lines).strip() or (preview_cmd or cmd or keyword or sk)
    copy_out = preview_cmd or cmd or keyword or sk
    draf = kw.cmd_incomplete(preview_cmd, params, eff["brace"], eff["flag"])
    wiz_ok = not draf
    payload: dict[str, Any] = {
        "v": 2,
        "entry_id": row["entry_id"],
        "tool": tool,
        "title": list_title,
        "cmd": preview_cmd,
        "draft": draf,
        "wizard_complete": wiz_ok,
        "param_values": {"brace": eff["brace"], "flag": eff["flag"]},
    }
    item: dict[str, Any] = {
        "uid": f"e-{row['entry_id']}",
        "title": disp_title,
        "subtitle": subtitle,
        "arg": _encode_km(payload, False),
        "valid": True,
        "text": {"copy": copy_out, "largetype": largetype},
        "mods": {
            "cmd": {
                "valid": True,
                "subtitle": "回车复制 · ⌘↩ 复制并粘贴",
                "arg": _encode_km(payload, True),
            },
            "alt": {
                "valid": True,
                "subtitle": "⌥↩ 追加 | pbcopy (将命令执行结果存入剪贴板)",
                "arg": _encode_km({**payload, "cmd": f"{kw.pure_copy_cmd(preview_cmd)} | tr -d '\\n' | pbcopy" if preview_cmd else ""}, True),
            }
        },
    }
    if kw.row_needs_wizard(row):
        item["autocomplete"] = f"{kw.WIZ_PREFIX}e|{row['entry_id']}"
    item["quicklookurl"] = kw.write_quicklook_preview(
        state, row["entry_id"], _row_quicklook_payload(row, preview_cmd)
    )
    return item


def _recent_to_item(r: dict[str, Any]) -> dict[str, Any]:
    title = r["title"]
    cmd = r["cmd"]
    return {
        "uid": f"r-{hashlib.md5(cmd.encode()).hexdigest()[:12]}",
        "title": title,
        "subtitle": "最近补全 · 直接复制（无占位符）",
        "arg": _encode_kp(cmd, False),
        "valid": True,
        "text": {"copy": cmd, "largetype": cmd},
        "mods": {
            "cmd": {
                "valid": True,
                "subtitle": "⌘↩ 复制并粘贴",
                "arg": _encode_kp(cmd, True),
            },
            "alt": {
                "valid": True,
                "subtitle": "⌥↩ 追加 | pbcopy (将命令执行结果存入剪贴板)",
                "arg": _encode_kp(f"{kw.pure_copy_cmd(cmd)} | tr -d '\\n' | pbcopy" if cmd else "", True),
            }
        },
    }


def _file_row(stem: str, file_aliases: list[str] | None = None) -> dict[str, Any]:
    fa = [x for x in (file_aliases or []) if str(x).strip()]
    sub = "Tab · 展开此工具全部命令"
    if fa:
        sub = f"别名 {' / '.join(fa)} · {sub}"
    return {
        "uid": f"t-{stem}",
        "title": f"{stem}",
        "subtitle": sub,
        "arg": "",
        "valid": False,
        "autocomplete": f"{stem} ",
    }


def _normalize_query(q: str, search_mode: bool) -> str:
    """Alfred 可能把关键字写进 {query}；search 模式下剥掉 kms、ksearch、km 等前缀再搜。"""
    s = (q or "").strip()
    if not search_mode:
        return s
    sl = s.lower()
    if sl in ("kms", "km", "ksearch"):
        return ""
    for prefix in ("ksearch ", "kms ", "km "):
        if sl.startswith(prefix):
            return s[len(prefix) :].lstrip()
    # 粘连仅处理 kms / ksearch，避免误伤 keyboard 等以 km 开头的词
    if len(sl) > len("ksearch") and sl.startswith("ksearch"):
        return s[len("ksearch") :].lstrip()
    if len(sl) > len("kms") and sl.startswith("kms"):
        return s[len("kms") :].lstrip()
    return s


def _wizard_query_core(q: str) -> str:
    """从 {query} 中切出向导段。Alfred 常把关键字与 Tab 补全粘在一起（如 km__KMw|e|…）。"""
    s = q or ""
    ip = s.find(kw.WIZ_PREFIX)
    if ip >= 0:
        return s[ip:].strip()
    return s.strip()


def run_filter(
    tools_dir: Path, query: str, search_mode: bool = False
) -> dict[str, Any]:
    state = _state_dir()
    cfg = _cfg()
    kms_web = bool(cfg.get("kms_web_search", True))
    stems = _cached_tool_stems(tools_dir, state)
    flat, by_tool, stem_file_aliases = _load_index(tools_dir)
    match_stems = sorted(by_tool.keys())
    entry_by_id = {r["entry_id"]: r for r in flat}

    items: list[dict[str, Any]] = []
    q = _normalize_query(query or "", search_mode)
    qw = _wizard_query_core(q)

    if qw.startswith(kw.WIZ_PREFIX):
        parsed = kw.parse_wizard_query(qw)
        if parsed:
            erow = entry_by_id.get(str(parsed.get("eid", "")))
            if erow:
                return {"items": kw.wizard_alfred_items(state, erow, qw)}
        return {
            "items": [
                {
                    "title": "向导条目不存在或查询不完整",
                    "subtitle": (qw or q)[:120],
                    "valid": False,
                }
            ]
        }

    if q.strip() == "":
        if search_mode:
            items = []
            if kms_web:
                items.extend(_kms_web_portal_items())
            items.extend(
                [
                    {
                        "title": "命令搜索：须 kms+空格 或 ksearch+空格 再输入词",
                        "subtitle": "上图三行可先打开搜索引擎首页；有词后顶行会变为 Google/DDG/Bing 的该词搜索 · cmd 加权",
                        "valid": False,
                    },
                    {
                        "title": "需要常用与工具列表请用关键字 km（不加空格）",
                        "subtitle": "km / kms / ksearch 共用 tools 与 resolve",
                        "valid": False,
                    },
                    {
                        "title": "关闭联网顶行请在 keymap_config.json 设 kms_web_search:false",
                        "subtitle": "http 打开由 open_http_links 控制",
                        "valid": False,
                    },
                ]
            )
            if not stems:
                items.append(
                    {
                        "title": "tools 目录暂无工具 JSON",
                        "subtitle": str(tools_dir),
                        "valid": False,
                    }
                )
            return {"items": items}

        fav_rows, recent_defs = _fav_and_recent_items(
            cfg, state, entry_by_id, stems
        )
        for r in fav_rows:
            items.append(_row_to_item(r, badge="常用"))
        for r in recent_defs:
            items.append(_recent_to_item(r))
        for st in stems:
            items.append(_file_row(st, stem_file_aliases.get(st)))
        if not stems:
            items.append(
                {
                    "title": "tools 目录暂无工具 JSON",
                    "subtitle": str(tools_dir),
                    "valid": False,
                }
            )
        return {"items": items}

    scored = _build_rows_for_query(
        q, tools_dir, match_stems, flat, by_tool, search_mode=search_mode
    )
    if not scored:
        hints = _discovery_items(q, match_stems, by_tool, state, cfg)
        items = [
            {
                "title": "库中无匹配条目",
                "subtitle": f"「{q.strip()}」· 未入库不代表不存在；下列为库外查阅引导（可复制）",
                "valid": False,
            }
        ]
        items.extend(hints)
        if not hints:
            items.append(
                {
                    "title": "未找到引导项",
                    "subtitle": "可在 keymap_config.json 设 discovery_enabled，或检查 keymap_state/discovery_hints.json",
                    "valid": False,
                }
            )
        if search_mode:
            web = _kms_web_search_items(q, kms_web)
            if web:
                items = web + items
        return {"items": items}

    items: list[dict[str, Any]] = []
    if search_mode:
        items.extend(_kms_web_search_items(q, kms_web))
    for _sc, row in scored[:80]:
        items.append(_row_to_item(row))

    return {"items": items}


def main() -> None:
    tools_dir = os.environ.get("TOOLS_DIR", "").strip()
    if not tools_dir:
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
    root = Path(tools_dir).expanduser()
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    mode_raw = os.environ.get("KEYMAP_MODE", "").strip().lower()
    search_mode = mode_raw in ("search", "kms", "command", "cmd")
    # 未 export KEYMAP_MODE 的安装偶发与 km 共用 browse，按查询形态兜底为搜索模式
    if not search_mode and not mode_raw:
        ql = (query or "").strip().lower()
        if ql == "kms" or ql.startswith("kms ") or (
            len(ql) > len("kms") and ql.startswith("kms")
        ):
            search_mode = True
        elif ql == "ksearch" or ql.startswith("ksearch ") or (
            len(ql) > len("ksearch") and ql.startswith("ksearch")
        ):
            search_mode = True
    out = run_filter(root, query, search_mode=search_mode)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
