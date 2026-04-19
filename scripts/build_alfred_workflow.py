#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包 KeyMap.alfredworkflow：脚本、tools、keymap_state 写入 zip 根目录并生成 info.plist。"""
from __future__ import annotations

import plistlib
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "KeyMap.alfredworkflow"
FILTER_PY = REPO / "scripts" / "alfred_tools_filter.py"
RESOLVE_PY = REPO / "scripts" / "resolve_cmd.py"
WIZARD_PY = REPO / "scripts" / "keymap_wizard.py"
EDITOR_FILTER_PY = REPO / "scripts" / "keymap_editor_filter.py"
EXPORT_FILTER_PY = REPO / "scripts" / "keymap_export_filter.py"
EXPORT_RUN_PY = REPO / "scripts" / "keymap_export_run.py"
TOOL_JSON_PY = REPO / "scripts" / "keymap_tool_json.py"
BOOKS_FILTER_PY = REPO / "scripts" / "alfred_books_filter.py"
EXAMPLES = REPO / "examples"


def _uid() -> str:
    return str(uuid.uuid4()).upper()


def _conn(dest: str, mod: int = 0) -> dict:
    return {
        "destinationuid": dest,
        "modifiers": mod,
        "modifiersubtext": "",
        "vitoclose": False,
    }


# 仅当 Workflow 环境变量未配置时使用 bundle 内 tools/keymap_state；留空即走默认。
_SH_ENV = (
    'export TOOLS_DIR="${TOOLS_DIR:-$(pwd)/tools}"\n'
    'export KEYMAP_STATE="${KEYMAP_STATE:-$(pwd)/keymap_state}"\n'
)


def main() -> None:
    sf = _uid()
    sf_kms = _uid()
    sf_ksearch = _uid()
    sf_kset = _uid()
    sf_kdel = _uid()
    sf_kexport = _uid()
    sf_kb = _uid()
    run_resolve = _uid()
    run_export = _uid()
    run_open_file = _uid()
    run_open_url = _uid()

    script_filter = (
        _SH_ENV + "export KEYMAP_MODE=browse\n"
        '/usr/bin/python3 "./alfred_tools_filter.py" "$1"\n'
    )

    script_filter_kms = (
        _SH_ENV + "export KEYMAP_MODE=search\n"
        '/usr/bin/python3 "./alfred_tools_filter.py" "$1"\n'
    )

    script_filter_kb = (
        _SH_ENV + '/usr/bin/python3 "./alfred_books_filter.py" "$1"\n'
    )

    script_resolve = _SH_ENV + '/usr/bin/python3 "./resolve_cmd.py" "$1"\n'

    script_filter_kset = (
        _SH_ENV + "export KEYMAP_EDIT_MODE=set\n"
        '/usr/bin/python3 "./keymap_editor_filter.py" "$1"\n'
    )

    script_filter_kdel = (
        _SH_ENV + "export KEYMAP_EDIT_MODE=del\n"
        '/usr/bin/python3 "./keymap_editor_filter.py" "$1"\n'
    )

    script_filter_kexport = _SH_ENV + '/usr/bin/python3 "./keymap_export_filter.py" "$1"\n'

    script_run_export = _SH_ENV + '/usr/bin/python3 "./keymap_export_run.py" "$1"\n'

    objects: list[dict] = [
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "km",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "正在查询…",
                "script": script_filter,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "输入 km 列出工具；过滤 · Tab 参数向导 · 回车复制",
                "title": "Key Map（工具命令）",
                "type": 0,
                "withspace": False,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_kms,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "kms",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "正在搜索命令…",
                "script": script_filter_kms,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "kms+空格 · 纯搜索 + 顶行联网；避免与 km 粘连",
                "title": "Key Map Search（kms）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_ksearch,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "ksearch",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "正在搜索…",
                "script": script_filter_kms,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "ksearch+空格 · 与 kms 相同逻辑，不含 km 前缀",
                "title": "Key Map Search（ksearch）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_kset,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "kset",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "引导编辑 keymap…",
                "script": script_filter_kset,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "kset+空格 · 选择/新建 JSON · 增改条目 · 回车写入",
                "title": "Key Map 编辑（kset）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_kdel,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "kdel",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "引导删除…",
                "script": script_filter_kdel,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "kdel+空格 · 选文件 · ## 过滤 · 回车删除",
                "title": "Key Map 删除（kdel）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_kexport,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 0,
                "escaping": 102,
                "keyword": "kexport",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "加载导出选项…",
                "script": script_filter_kexport,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "kexport+空格 · 选范围 · 回车生成桌面 ZIP",
                "title": "Key Map 导出（kexport）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.input.scriptfilter",
            "uid": sf_kb,
            "version": 3,
            "config": {
                "alfredfiltersresults": False,
                "alfredfiltersresultsmatchmode": 0,
                "argumenttreatemptyqueryasnil": False,
                "argumenttrimmode": 0,
                "argumenttype": 1,
                "escaping": 102,
                "keyword": "kb",
                "queuedelaycustom": 0.5,
                "queuedelayimmediatelyinitially": True,
                "queuedelaymode": 0,
                "queuemode": 1,
                "runningsubtext": "正在搜索手册…",
                "script": script_filter_kb,
                "scriptargtype": 1,
                "scriptfile": "",
                "subtext": "输入 kb 搜索手册；Shift 预览 · 回车打开 · ⌘↩ Finder 显示 · ⌥↩ 复制 glow 渲染命令",
                "title": "Key Book（手册与文档）",
                "type": 0,
                "withspace": True,
            },
        },
        {
            "type": "alfred.workflow.action.script",
            "uid": run_resolve,
            "version": 2,
            "config": {
                "concurrently": False,
                "escaping": 102,
                "script": script_resolve,
                "scriptargtype": 1,
                "scriptfile": "",
                "type": 0,
            },
        },
        {
            "type": "alfred.workflow.action.script",
            "uid": run_export,
            "version": 2,
            "config": {
                "concurrently": False,
                "escaping": 102,
                "script": script_run_export,
                "scriptargtype": 1,
                "scriptfile": "",
                "type": 0,
            },
        },
        {
            "type": "alfred.workflow.action.openfile",
            "uid": run_open_file,
            "version": 3,
            "config": {
                "openwith": "",
                "sourcefile": ""
            }
        },
        {
            "type": "alfred.workflow.action.openurl",
            "uid": run_open_url,
            "version": 1,
            "config": {
                "url": "{query}"
            }
        }
    ]

    connections: dict[str, list[dict]] = {
        sf: [
            _conn(run_resolve, 0),
            _conn(run_resolve, 1048576),
        ],
        sf_kms: [
            _conn(run_resolve, 0),
            _conn(run_resolve, 1048576),
        ],
        sf_ksearch: [
            _conn(run_resolve, 0),
            _conn(run_resolve, 1048576),
        ],
        sf_kset: [
            _conn(run_resolve, 0),
            _conn(run_resolve, 1048576),
        ],
        sf_kdel: [
            _conn(run_resolve, 0),
            _conn(run_resolve, 1048576),
        ],
        sf_kexport: [
            _conn(run_export, 0),
            _conn(run_export, 1048576),
        ],
        sf_kb: [
            _conn(run_open_url, 0),
            _conn(run_open_file, 1048576),
        ]
    }

    uidata = {
        sf: {"xpos": 220, "ypos": 180},
        sf_kms: {"xpos": 220, "ypos": 320},
        sf_ksearch: {"xpos": 220, "ypos": 460},
        sf_kset: {"xpos": 220, "ypos": 600},
        sf_kdel: {"xpos": 220, "ypos": 740},
        sf_kexport: {"xpos": 220, "ypos": 880},
        sf_kb: {"xpos": 220, "ypos": 1020},
        run_resolve: {"xpos": 520, "ypos": 250},
        run_export: {"xpos": 520, "ypos": 400},
        run_open_file: {"xpos": 520, "ypos": 550},
        run_open_url: {"xpos": 520, "ypos": 700},
    }

    info: dict = {
        "bundleid": "com.keymap.alfred.tools",
        "connections": connections,
        "createdby": "key_map",
        "description": "多级模糊搜索、快捷键语义检索、无匹配时库外引导、Tab 参数向导（params）、按工具常用与最近记录。",
        "disabled": False,
        "name": "Key Map (工具命令)",
        "objects": objects,
        "readme": (
            "使用说明\n"
            "========\n\n"
            "0. 本地开发目录（可选）：须先进入 **Workflow 编辑界面**（Preferences → Workflows → 选中本工作流）。在 **画布窗口右上角点 [x]**（Workflow Configuration），切到 **「Environment Variables」** 标签（**不是**画布标题下方的「Configure Workflow…」——那是 Configuration Builder 的预览，不会出现环境变量表）。在此填写 TOOLS_DIR（*.json 目录绝对路径，如 ~/Work/key_map/examples）、KEYMAP_STATE（状态目录，如 ~/Work/key_map/keymap_state）；留空则用包内 tools/ 与 keymap_state/。改 JSON 后无需再拷进 bundle。\n"
            "1. tools/*.json：title 建议只写功能说明；键位或 / 命令写在 keys（与无占位符的 cmd 尽量一致，含 --flag 时用完整 cmd）。Alfred 列表会显示为「说明 -- 键」。快捷键检索仍用 keys/sequence、action/effect、mode/context。示例见 tools/vim.json。\n"
            "2. keymap_state/keymap_config.json：favorites_per_tool、open_http_links（KP 的 http 链接回车后是否 open）、discovery_enabled 等。\n"
            "3. keymap_state/discovery_hints.json：追加 global / by_tool 引导行；占位符 {q} {rest} {tool} {q_enc} {rest_enc}。\n"
            "键：kms / ksearch 须加空格，query 仅为搜索词；km 浏览不加空格。顶行联网见 kms_web_search。\n"
            "4. 关键字「km」首页；「kms」「ksearch」纯搜索（加重 cmd）+ 联网；三者共用 resolve / 向导。Tab → __KMw|。\n"
            "5. tools/*.json 使用 params（brace/flag）描述占位符与 CLI 标志；无匹配时场景2 引导。延迟 0.5s。\n"
            "6. 回车复制；⌘↩ 另尝试粘贴。仅补全完整命令时写入常用。\n"
            "7. kset / kdel+空格：引导式增改删 tools 内条目；直接写 JSON。自定义文件为列表首项，autocomplete 后加 ##文件名.json。\n"
            "8. kexport+空格：导出 ZIP 到桌面（仅配置 / 配置+tools / 含常用与占位符记忆）。解压到 Workflow 目录可覆盖恢复。\n"
            "9. 列表项 Quick Look（通常按住 Shift）：预览本条目 JSON 配置（cmd 模板、params、doc_url 等），不再直接打开网页。\n"
            "10. 工具 JSON 根级 aliases（或 file_aliases）：与 tools/items 并列，缩短首词匹配（如 cc 等同 claude-code）；若与已有 stem/别名冲突则跳过。\n"
            "11. 写回 tools/*.json（参数默认持久化、kset）前可选备份与校验：keymap_config 中 tool_json_backup_before_write / tool_json_validate_before_write；备份在 keymap_state/backups/tools/。仓库 scripts/validate_tools_json.py 可批量检查或 --install 候选文件覆盖目标。\n"
            "12. tools 目录下 discovery_hints.json 不参与命令索引（仅作 state 内发现配置时请放在 keymap_state）。\n"
        ),
        "uidata": uidata,
        "version": "1.7.2",
        "variables": {
            "TOOLS_DIR": "",
            "KEYMAP_STATE": "",
        },
        "variablesdontexport": [],
        "webaddress": "",
    }

    cfg_src = EXAMPLES / "keymap_config.json"
    disc_src = EXAMPLES / "discovery_hints.json"

    with tempfile.TemporaryDirectory(prefix="keymap_alfred_") as td:
        root = Path(td)
        shutil.copy2(FILTER_PY, root / "alfred_tools_filter.py")
        shutil.copy2(RESOLVE_PY, root / "resolve_cmd.py")
        shutil.copy2(WIZARD_PY, root / "keymap_wizard.py")
        shutil.copy2(EDITOR_FILTER_PY, root / "keymap_editor_filter.py")
        shutil.copy2(EXPORT_FILTER_PY, root / "keymap_export_filter.py")
        shutil.copy2(EXPORT_RUN_PY, root / "keymap_export_run.py")
        shutil.copy2(TOOL_JSON_PY, root / "keymap_tool_json.py")
        shutil.copy2(BOOKS_FILTER_PY, root / "alfred_books_filter.py")
        (root / "tools").mkdir()
        if EXAMPLES.is_dir():
            for p in sorted(EXAMPLES.glob("*.json")):
                if p.name in ("keymap_config.json", "discovery_hints.json"):
                    continue
                shutil.copy2(p, root / "tools" / p.name)
        ks = root / "keymap_state"
        ks.mkdir()
        cfg_dst = ks / "keymap_config.json"
        if cfg_src.is_file():
            shutil.copy2(cfg_src, cfg_dst)
        else:
            cfg_dst.write_text(
                "{\n"
                '  "favorites_per_tool": 3,\n'
                '  "recents_capacity": 5,\n'
                '  "placeholder_remember_n": 5,\n'
                '  "discovery_enabled": true,\n'
                '  "open_http_links": true,\n'
                '  "kms_web_search": true,\n'
                '  "persist_param_defaults": false,\n'
                '  "tool_json_backup_before_write": true,\n'
                '  "tool_json_validate_before_write": true\n'
                "}\n",
                encoding="utf-8",
            )

        disc_dst = ks / "discovery_hints.json"
        if disc_src.is_file():
            shutil.copy2(disc_src, disc_dst)
        else:
            disc_dst.write_text(
                '{\n  "global": [],\n  "by_tool": {}\n}\n', encoding="utf-8"
            )

        plist_path = root / "info.plist"
        with plist_path.open("wb") as fp:
            plistlib.dump(info, fp, fmt=plistlib.FMT_XML)

        OUT.parent.mkdir(parents=True, exist_ok=True)
        if OUT.exists():
            OUT.unlink()
        with zipfile.ZipFile(
            OUT, "w", compression=zipfile.ZIP_DEFLATED, strict_timestamps=False
        ) as zf:
            for f in root.rglob("*"):
                if f.is_file():
                    zf.write(f, arcname=f.relative_to(root).as_posix())

    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
