import json
import os
import stat

# 核心上下文解析模板（包含刚刚我们测试通过的所有逻辑）
BASH_TEMPLATE = """#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title {title}
# @raycast.mode fullOutput
# @raycast.packageName Git Context
#
# Optional parameters:
# @raycast.icon 🌿
# @raycast.description {description}

# 1. 使用 AppleScript 获取当前前台 App 及其路径或标题
CONTEXT=$(osascript <<'EOF'
tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
end tell

if frontApp is "Finder" then
    tell application "Finder"
        try
            if exists Finder window 1 then
                return "PATH:" & POSIX path of (target of Finder window 1 as alias)
            else
                return "PATH:" & POSIX path of (desktop as alias)
            end if
        on error errMsg
            return "UNKNOWN:Finder error - " & errMsg
        end try
    end tell
else if frontApp is "iTerm2" then
    tell application "iTerm"
        try
            tell current session of current window
                return "PATH:" & variable named "PWD"
            end tell
        on error errMsg
            return "UNKNOWN:iTerm error - " & errMsg
        end try
    end tell
else if frontApp is "Cursor" or frontApp is "Code" then
    tell application "System Events"
        try
            set windowTitle to name of front window of process frontApp
            return "TITLE:" & frontApp & ":" & windowTitle
        on error errMsg
            return "UNKNOWN:Cursor/Code error - " & errMsg
        end try
    end tell
else if frontApp is "Ghostty" then
    tell application "System Events"
        try
            set windowTitle to name of front window of process "Ghostty"
            return "TITLE:Ghostty:" & windowTitle
        on error errMsg
            return "UNKNOWN:Ghostty error - " & errMsg
        end try
    end tell
else if frontApp is "Android Studio" or frontApp is "studio" then
    tell application "System Events"
        try
            set windowTitle to name of front window of process frontApp
            return "TITLE:studio:" & windowTitle
        on error errMsg
            return "UNKNOWN:studio error - " & errMsg
        end try
    end tell
end if
return "UNKNOWN:" & frontApp
EOF
)

# 2. 解析路径
APP_PATH=""
APP_NAME=""

if [[ "$CONTEXT" == PATH:* ]]; then
    APP_PATH="${CONTEXT#PATH:}"
    APP_NAME="Finder/Terminal"
elif [[ "$CONTEXT" == TITLE:* ]]; then
    # 解析 TITLE:AppName:WindowTitle
    REMAINDER="${CONTEXT#TITLE:}"
    APP_NAME="${REMAINDER%%:*}"
    TITLE="${REMAINDER#*:}"
    
    PROJECT_NAME=""
    
    if [[ "$APP_NAME" == "Ghostty" ]]; then
        # Ghostty 标题包含路径，如 ~/W/a/team_doc
        LAST_WORD=$(echo "$TITLE" | awk '{print $NF}')
        PROJECT_NAME=$(basename "$LAST_WORD")
    elif [[ "$APP_NAME" == "studio" ]]; then
        # Android Studio 标题通常在方括号内包含完整路径
        EXTRACTED_PATH=$(echo "$TITLE" | awk -F'[][]' '{print $2}')
        if [ -n "$EXTRACTED_PATH" ]; then
            APP_PATH="${EXTRACTED_PATH/\\~/$HOME}"
            PROJECT_NAME="" 
        else
            PROJECT_NAME=$(echo "$TITLE" | awk '{print $1}')
        fi
    else
        # Cursor / VSCode 等
        CLEAN_TITLE=$(echo "$TITLE" | sed -e 's/ — /|/g' -e 's/ – /|/g' -e 's/ - /|/g')
        PART_COUNT=$(echo "$CLEAN_TITLE" | awk -F'|' '{print NF}')
        if [ "$PART_COUNT" -ge 2 ]; then
            PROJECT_NAME=$(echo "$CLEAN_TITLE" | awk -F'|' '{print $2}')
        else
            PROJECT_NAME="$CLEAN_TITLE"
        fi
    fi
    
    # 去除前后空格
    PROJECT_NAME=$(echo "$PROJECT_NAME" | xargs)
    
    if [ -n "$PROJECT_NAME" ]; then
        # 使用 macOS Spotlight 搜索 (mdfind) 全局查找同名文件夹
        while IFS= read -r dir; do
            if [ -n "$dir" ] && [ -d "$dir/.git" ]; then
                APP_PATH="$dir"
                break
            fi
        done < <(mdfind -name "$PROJECT_NAME" 2>/dev/null | grep -iE "/$PROJECT_NAME$" | head -n 10)
        
        if [ -z "$APP_PATH" ]; then
            APP_PATH=$(mdfind -name "$PROJECT_NAME" 2>/dev/null | grep -iE "/$PROJECT_NAME$" | head -n 1)
        fi
    fi
else
    APP_NAME="${CONTEXT#UNKNOWN:}"
    echo "无法获取当前 App ($APP_NAME) 的上下文。"
    exit 0
fi

if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
    echo "无法解析 $APP_NAME 的有效本地路径。"
    echo "提取的上下文信息: $CONTEXT"
    exit 0
fi

# 3. 检查 Git 并执行命令
cd "$APP_PATH" || exit 0

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "当前解析的目录不是一个 Git 仓库:"
    echo "$APP_PATH"
    exit 0
fi

echo "✅ 成功识别上下文"
echo "应用: $APP_NAME"
echo "目录: $APP_PATH"
echo "----------------------------------------"
echo "执行: {cmd}"
echo ""
{cmd}
"""

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "examples", "git.json")
    output_dir = os.path.join(base_dir, "raycast_scripts")
    
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 读取 JSON 数据
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    count = 0
    items = data.get("tools", []) if isinstance(data, dict) else data
    
    for item in items:
        if not isinstance(item, dict):
            continue
            
        # 仅处理 mode 为 cli 且 cmd 为有效字符串的项
        cmd = item.get("cmd", "")
        if item.get("mode") == "cli" and cmd and "{" not in cmd:
            # 过滤掉带有占位符的命令，因为 Raycast Script Command 无法直接交互输入
            # 比如 "git checkout {branch}" 这种就不适合直接生成静态脚本
            
            script_id = item.get("id", "unknown").replace("-", "_")
            title = item.get("title", "Git Command")
            desc = item.get("action", "")
            
            script_content = BASH_TEMPLATE.replace("{title}", title).replace("{description}", desc).replace("{cmd}", cmd)
            
            script_path = os.path.join(output_dir, f"{script_id}.sh")
            
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(script_content)
                
            # 赋予执行权限
            st = os.stat(script_path)
            os.chmod(script_path, st.st_mode | stat.S_IEXEC)
            count += 1
            
    print(f"成功生成了 {count} 个 Raycast 上下文感知脚本到 {output_dir}")

if __name__ == "__main__":
    main()
