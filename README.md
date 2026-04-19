# KeyMap (km) 插件开发与配置指南

本文档总结了 `key_map` 项目的核心设计规则、JSON 数据结构规范以及 Raycast 插件的交互逻辑。在后续新增命令或快捷键时，请严格遵循本指南。

---

## 1. 核心设计理念

1.  **消除记忆负担**：通过动态读取上下文（Git 仓库、Docker 容器等）自动补全参数，避免手动输入。
2.  **防呆与防错**：通过下拉菜单、多选标签（TagPicker）以及互斥提示，防止用户输入错误的命令参数。
3.  **极致的 UI 纯净度**：在 Raycast 列表中仅展示当前平台（macOS）的快捷键，避免多平台文本导致展示截断。
4.  **肌肉记忆优先**：通过 Frecency（使用频率）算法，让最常用的命令永远排在最前面。

---

## 2. JSON 数据结构规范

每个工具/命令定义在 `examples/*.json` 的 `tools` 数组中。

### 基础字段
```json
{
  "id": "git-branch",           // 唯一标识符，建议用 软件名-动作 命名
  "title": "分支管理",          // 主标题
  "action": "列出、创建、删除", // 动作描述（在详情页展示）
  "mode": "cli",                // 模式：cli (命令行) 或 global/gui (界面快捷键)
  "keys": "终端：git branch -a",// 原始快捷键描述（可包含多平台）
  "mac": "⌘+D",                 // 【重要】纯净的 macOS 快捷键或命令展示，用于列表 Subtitle
  "cmd": "git branch {flags} {branch}", // 实际执行的命令模板，使用 {id} 作为参数占位符
  "tags": ["git", "分支"],      // 标签，用于搜索和图标匹配
  "weight": 11,                 // 基础权重（默认排序依据）
  "doc": "https://..."          // 官方文档链接
}
```

---

## 3. 快捷键与 GUI 软件规范

对于非 CLI 的纯快捷键（如 Chrome、Android Studio、Obsidian）：
*   **必须分离 `mac` 字段**：`keys` 字段可以保留多平台的说明（如 `Windows: Ctrl+D; macOS: ⌘+D`），但必须提取纯净的 macOS 快捷键到 `mac` 字段（如 `⌘+D`）。
*   **UI 展示逻辑**：Raycast 列表的 `subtitle` 会优先读取 `mac` 字段，确保界面整洁且不会被截断。
*   **统一修饰键**：统一使用 `Ctrl`、`Option`、`Shift`、`⌘` 等简写，避免使用 `Control` 或 `control`。

---

## 4. CLI 命令行与高级参数规范 (`params`)

对于需要拼接参数的 CLI 命令，使用 `params` 数组定义参数解析规则。

### 4.1 可选参数 (`optional: true`)
如果某个参数是可选的（如 `git branch {branch} {base_branch}` 中的 `{base_branch}`）：
*   设置 `"optional": true`。
*   **自动清理机制**：如果用户在表单中未填写该参数，底层脚本会自动将其替换为空，并**自动清理掉命令中多余的连续空格**，确保生成的命令依然合法。

### 4.2 动态参数 (`dynamic`)
通过 `dynamic` 字段，脚本会根据当前前台 App（Cursor, Ghostty, Finder 等）自动解析工作目录，并执行相应的 Shell 脚本获取实时选项。

**目前支持的 `dynamic` 类型：**
*   **Git**: `git_branches`, `git_commits`, `git_remotes`, `git_stashes`, `git_changed_files`
*   **Docker**: `docker_containers` (运行中), `docker_containers_all` (所有), `docker_images`, `docker_compose_services`
*   **K8s**: `k8s_namespaces`, `k8s_pods`
*   **Node/NPM**: `npm_scripts`, `npm_dependencies`, `npm_workspaces`, `npm_bins`
*   **System**: `file_path` (当前目录文件), `active_ports` (监听端口), `top_processes` (高耗能进程)
*   **SSH**: `ssh_hosts` (解析 ~/.ssh/config)
*   **Android**: `adb_devices`, `apk_files`

*异常处理*：如果动态获取失败（例如当前目录不是 Git 仓库），UI 会自动降级，弹出“选择项目路径”的界面，允许用户手动输入或从历史记录中选择正确的路径。

### 4.3 附加参数多选 (`type: "flags"`)
针对带有大量 `-args` 的命令（如 `git log --oneline --graph`），为了避免用户记忆：
*   使用 `"type": "flags"`。
*   提供 `options` 数组，包含 `title` (中文描述) 和 `value` (实际参数)。
*   在 Raycast 中会自动渲染为多选标签（TagPicker），用户勾选后会自动用空格拼接。

### 4.4 互斥与组合预设提示规范
在编写 `flags` 参数时，遵循以下文案规范：
1.  **互斥提示**：在 `title` 中明确标注互斥关系。
    *   *示例*：`{"title": "删除分支 (-d) [与-D/-m互斥]", "value": "-d"}`
2.  **组合预设**：对于经常连用的参数，提供一个一键勾选的组合选项，并用 `🌟` 标记。
    *   *示例*：`{"title": "🌟 彻底清理所有 (-a --volumes -f)", "value": "-a --volumes -f"}`

---

## 5. Raycast 交互特性说明

1.  **Frecency (使用频率排序)**：
    *   默认情况下（搜索框为空），列表排序得分为：`使用次数 * 100 + weight`。
    *   越常用的命令会自动置顶。
2.  **详情视图 (Detail View)**：
    *   按 `Cmd + Shift + D` 可展开右侧详情面板。
    *   用于查看被截断的长描述、完整的命令代码块以及官方文档链接。
3.  **智能表单路由**：
    *   **ParamWizard (列表模式)**：适用于只有一个参数的命令，支持模糊搜索和自定义输入。
    *   **Wizard (高级表单模式)**：适用于多参数或包含 `flags` 的命令。所有参数同屏展示，支持历史记录记忆。
    *   **自动跳过 (Auto-focus skip)**：在表单模式下，如果某个下拉框只有一个动态选项，光标会自动跳过它，聚焦到下一个需要填写的字段。
4.  **快捷操作**：
    *   `Enter`：复制拼接好的命令。
    *   `Cmd + Enter`：粘贴到当前活跃窗口（如终端）。
    *   `Opt + Enter`：提取纯命令（去除 pbcopy 等尾巴）并在 Ghostty 中直接执行。
