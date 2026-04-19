# git log {flags} {path}
> 查看提交历史（git log）

## 1. 命令简介 (Introduction)  
`git log` 用于在当前仓库中列出提交记录。它可以显示每次提交的 SHA‑1、作者、日期、提交信息等。配合各种 **flags**（选项）和 **path**（路径）可以实现过滤、格式化、可视化等高级需求。常用于审查代码变更、定位 bug、生成变更日志等场景。

## 2. 语法与参数 (Syntax & Parameters)  

```
git log [<options>...] [<revision-range>] [[--] <path>...]
```

| 参数 / 选项 | 说明 |
|------------|------|
| `--oneline` | 每个提交只占一行，显示简短的 SHA‑1（前 7 位）和提交标题。 |
| `--graph` | 以 ASCII 图形方式展示分支合并关系，常配合 `--oneline` 使用。 |
| `--decorate` | 在提交信息旁显示分支、标签、HEAD 等引用名称。 |
| `-n <num>` / `--max-count=<num>` | 只显示最近的 `<num>` 条提交。 |
| `--since=<date>` / `--after=<date>` | 只显示指定日期之后的提交（如 `--since="2 weeks ago"`）。 |
| `--until=<date>` / `--before=<date>` | 只显示指定日期之前的提交。 |
| `-p` / `--patch` | 显示每个提交的 diff 内容。 |
| `-S<string>` | 只列出 **新增或删除** 包含 `<string>` 的提交（搜索代码变更）。 |
| `-G<regex>` | 只列出 **diff** 中匹配正则表达式的提交。 |
| `--author=<pattern>` | 过滤作者匹配 `<pattern>` 的提交。 |
| `--grep=<pattern>` | 过滤提交信息匹配 `<pattern>` 的提交。 |
| `--stat` | 统计每次提交修改的文件数和行数。 |
| `--name-only` | 只列出每次提交涉及的文件路径。 |
| `--name-status` | 列出每次提交的文件路径及状态（A、M、D）。 |
| `-- <path>...` | 限定只显示 **在指定路径（文件或目录）** 下的提交。路径必须放在 `--` 之后，以防止与分支名冲突。 |
| `<revision-range>` | 如 `HEAD~5..HEAD`、`v1.0..v2.0`，限定显示的提交区间。 |

> **组合使用示例**  
> `git log --oneline --graph --decorate --since="2024-01-01" --author="Alice" -- src/`  
> 该命令显示自 2024‑01‑01 起、作者为 Alice、且只涉及 `src/` 目录的提交，以单行、图形、装饰的形式呈现。

## 3. 常见用法与示例 (Common Use Cases & Examples)

1. **快速浏览最近 10 条提交（带分支图）**  
   ```bash
   git log --oneline --graph --decorate -n 10
   ```  
   *效果*：以单行、ASCII 分支图和引用名称展示最近 10 次提交，帮助快速了解分支合并情况。

2. **查看某文件的历史记录**  
   ```bash
   git log --oneline --decorate -- path/to/file.txt
   ```  
   *效果*：仅列出 `path/to/file.txt` 的提交记录，便于追踪该文件的演变。

3. **搜索包含特定关键字的提交**  
   ```bash
   git log --oneline --grep="fix memory leak" --author="Bob"
   ```  
   *效果*：列出提交信息中含有 “fix memory leak” 且作者为 Bob 的所有提交，适合定位特定 bug 的修复记录。

4. **以图形方式查看最近 5 次合并的提交**  
   ```bash
   git log --oneline --graph --decorate --merges -n 5
   ```  
   *效果*：只显示合并提交（`--merges`），配合图形展示，帮助审查分支合并历史。

5. **统计过去两周内每个文件的改动行数**  
   ```bash
   git log --since="2 weeks ago" --stat --name-only
   ```  
   *效果*：列出过去两周的提交，并显示每个提交涉及的文件及增删行数，适合生成简易的变更报告。

## 4. 注意事项 (Notes/Gotchas)

- **路径必须放在 `--` 之后**：如果路径与分支、标签同名，Git 会把它当作引用而不是文件路径。使用 `--` 可强制解释为路径。  
  示例：`git log --oneline -- src`（正确） vs `git log --oneline src`（可能误解释为分支 `src`）。

- **`--graph` 与分页器冲突**：默认情况下 `git log` 会通过 `less` 分页，`--graph` 的 ASCII 图在分页时可能出现错位。可使用 `git -c core.pager=cat log …` 临时关闭分页，或在配置中将 `less -FRSX` 加入 `core.pager`。

- **大仓库的性能**：在包含大量提交的仓库中，使用 `--oneline`、`-n` 或时间范围过滤可以显著提升响应速度。避免一次性输出全部历史。

- **颜色显示**：如果在终端中看不到颜色，可加 `--color=always` 或在全局配置 `git config --global color.ui auto`。

- **兼容性**：部分老版本 Git（< 2.0）不支持 `--decorate` 的完整功能，建议保持 Git 更新到较新版本以获得最佳体验。

- **路径通配符**：`git log` 本身不支持 shell 通配符（如 `*.c`），需要借助 `git ls-files` 或 `--` 后手动列出匹配的文件列表。  

> **小技巧**：想一次性查看多个目录的历史，可使用 `git log --oneline -- path1/ path2/`，路径之间用空格分隔即可。  

---  

以上即为 `git log`（配合 flags 与 path） 的完整使用指南，祝你在版本控制中游刃有余！