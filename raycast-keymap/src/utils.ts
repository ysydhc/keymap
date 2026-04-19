import { getPreferenceValues, getFrontmostApplication } from "@raycast/api";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import { Tool, ToolFile, Book, BookFile } from "./types";

const execAsync = promisify(exec);

interface Preferences {
  toolsDir: string;
  booksDir: string;
  favoriteDirs?: string;
  defaultShell?: string;
  globalEnvVars?: string;
  scriptsDir: string;
  remoteToolsUrls?: string;
  contextAppMappings?: string;
}

export function replaceGlobalEnvVars(cmd: string): string {
  if (!cmd) return cmd;
  try {
    const prefs = getPreferenceValues<Preferences>();
    if (prefs.globalEnvVars) {
      const envVars = JSON.parse(prefs.globalEnvVars);
      if (typeof envVars === 'object') {
        let result = cmd;
        for (const [key, value] of Object.entries(envVars)) {
          result = result.replace(new RegExp(`\\{\\{env\\.${key}\\}\\}`, 'g'), String(value));
        }
        return result;
      }
    }
  } catch (e) {
    console.error("Failed to parse globalEnvVars", e);
  }
  return cmd;
}

export function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

export function getDirPaths(dirStr: string): string[] {
  if (!dirStr) return [];
  return dirStr.split(',').map(p => expandPath(p.trim())).filter(p => p.length > 0);
}

export function getTools(): Tool[] {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.toolsDir);
  const tools: Tool[] = [];

  for (const toolsDir of dirs) {
    if (!fs.existsSync(toolsDir)) continue;

    const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
        const data: any = JSON.parse(content);
        const category = file.replace('.json', '');
        if (Array.isArray(data)) {
          tools.push(...data.map((t: any) => ({ ...t, category })));
        } else if (data.tools && Array.isArray(data.tools)) {
          tools.push(...data.tools.map((t: any) => ({ ...t, category })));
        }
      } catch (e) {
        console.error(`Error parsing ${file}:`, e);
      }
    }
  }

  // Load remote tools cache if exists
  const cacheDir = path.join(os.homedir(), '.keymap_remote_cache');
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
        const data: any = JSON.parse(content);
        const category = `remote-${file.replace('.json', '')}`;
        if (Array.isArray(data)) {
          tools.push(...data.map((t: any) => ({ ...t, category })));
        } else if (data.tools && Array.isArray(data.tools)) {
          tools.push(...data.tools.map((t: any) => ({ ...t, category })));
        }
      } catch (e) {
        console.error(`Error parsing remote cache ${file}:`, e);
      }
    }
  }

  return tools;
}

export async function fetchRemoteTools(force = false) {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.remoteToolsUrls) return;
  
  const urls = prefs.remoteToolsUrls.split(',').map((u: string) => u.trim()).filter(Boolean);
  if (urls.length === 0) return;

  const cacheDir = path.join(os.homedir(), '.keymap_remote_cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const metaFile = path.join(cacheDir, 'meta.json');
  if (!force && fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      // Only fetch once every 12 hours unless forced
      if (Date.now() - meta.lastUpdated < 12 * 60 * 60 * 1000) {
        return;
      }
    } catch (e) {
      // ignore
    }
  }

  let updated = false;
  for (let i = 0; i < urls.length; i++) {
    try {
      const url = urls[i];
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        fs.writeFileSync(path.join(cacheDir, `remote_${i}.json`), JSON.stringify(data, null, 2));
        updated = true;
      }
    } catch (e) {
      console.error(`Failed to fetch remote tools from ${urls[i]}:`, e);
    }
  }

  if (updated) {
    fs.writeFileSync(metaFile, JSON.stringify({ lastUpdated: Date.now() }));
  }
}

export function getAllCategories(): string[] {
  const prefs = require("@raycast/api").getPreferenceValues();
  const dirs = getDirPaths(prefs.toolsDir);
  const categories = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => categories.add(f.replace('.json', '')));
  }
  return Array.from(categories).sort();
}

export function predictCategory(tool: Tool): string {
  const cmdFirstWord = tool.cmd.split(' ')[0].toLowerCase();
  const tags = (tool.tags || []).map(t => t.toLowerCase());
  
  const categoryMap: Record<string, string> = {
    "npm": "node",
    "yarn": "node",
    "pnpm": "node",
    "npx": "node",
    "xcodebuild": "xcode",
    "pod": "xcode",
    "fastlane": "xcode",
    "pip": "python",
    "pip3": "python",
    "python3": "python"
  };

  const mappedWord = categoryMap[cmdFirstWord] || cmdFirstWord;
  
  const majorTools = [
    "git", "adb", "docker", "node", "brew", "kubectl", 
    "python", "cargo", "flutter", "gh", 
    "aws", "gcloud", "go", "fish", "xcode"
  ];

  const existingCategories = getAllCategories();

  if (existingCategories.includes(mappedWord)) return mappedWord;
  for (const tag of tags) {
    if (existingCategories.includes(tag)) return tag;
  }
  if (majorTools.includes(mappedWord)) {
    return mappedWord;
  }
  return "custom";
}


export function getBooks(): Book[] {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.booksDir);
  const books: Book[] = [];

  for (const booksDir of dirs) {
    if (!fs.existsSync(booksDir)) continue;

    const files = fs.readdirSync(booksDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(booksDir, file), 'utf-8');
        const data: BookFile = JSON.parse(content);
        if (data.books && Array.isArray(data.books)) {
          books.push(...data.books.map(b => ({ ...b, baseDir: booksDir })));
        }
      } catch (e) {
        console.error(`Error parsing ${file}:`, e);
      }
    }
  }
  return books;
}

export function pureCopyCmd(cmd: string): string {
  const c = cmd.trim();
  
  if (c.startsWith("lsof ")) {
    if (!c.includes(" -t ")) {
      return c.replace("lsof ", "lsof -t ");
    }
    return c;
  }
  
  if (c.startsWith("docker ps")) {
    if (!c.includes(" -q")) {
      return c.replace("docker ps", "docker ps -q");
    }
    return c;
  }
  
  if (c.startsWith("docker images")) {
    if (!c.includes(" -q")) {
      return c.replace("docker images", "docker images -q");
    }
    return c;
  }
  
  if (c.startsWith("docker container ls")) {
    if (!c.includes(" -q")) {
      return c.replace("docker container ls", "docker container ls -q");
    }
    return c;
  }
  
  return c;
}

export interface DynamicOption {
  value: string;
  title: string;
}

export async function getGitDynamicOptionsAsync(type: string, overridePath?: string): Promise<DynamicOption[]> {
  try {
    const frontApp = await getFrontmostApplication();
    const appName = frontApp.name;

    const script = `
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/Library/Android/sdk/platform-tools:$PATH"

APP_NAME="${appName}"
TYPE="${type}"
OVERRIDE_PATH="${overridePath || ''}"
APP_PATH=""

if [ -n "$OVERRIDE_PATH" ]; then
    APP_PATH="\${OVERRIDE_PATH/#\\~/$HOME}"
else
    CONTEXT=$(osascript <<EOF
if "$APP_NAME" is "Finder" then
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
else if "$APP_NAME" is "iTerm2" or "$APP_NAME" is "iTerm" then
    tell application "iTerm"
        try
            tell current session of current window
                return "PATH:" & variable named "PWD"
            end tell
        on error errMsg
            return "UNKNOWN:iTerm error - " & errMsg
        end try
    end tell
else if "$APP_NAME" is "Cursor" or "$APP_NAME" is "Code" then
    tell application "System Events"
        try
            set windowTitle to name of front window of process "$APP_NAME"
            return "TITLE:" & "$APP_NAME" & ":" & windowTitle
        on error errMsg
            return "UNKNOWN:Cursor/Code error - " & errMsg
        end try
    end tell
else if "$APP_NAME" is "Ghostty" then
    tell application "System Events"
        try
            set windowTitle to name of front window of process "Ghostty"
            return "TITLE:Ghostty:" & windowTitle
        on error errMsg
            return "UNKNOWN:Ghostty error - " & errMsg
        end try
    end tell
else if "$APP_NAME" is "Android Studio" or "$APP_NAME" is "studio" then
    tell application "System Events"
        try
            if exists process "studio" then
                set windowTitle to name of front window of process "studio"
                return "TITLE:studio:" & windowTitle
            else if exists process "Android Studio" then
                set windowTitle to name of front window of process "Android Studio"
                return "TITLE:studio:" & windowTitle
            end if
        on error errMsg
            return "UNKNOWN:studio error - " & errMsg
        end try
    end tell
end if
return "UNKNOWN:" & "$APP_NAME"
EOF
)

    if [[ "$CONTEXT" == PATH:* ]]; then
        APP_PATH="\${CONTEXT#PATH:}"
    elif [[ "$CONTEXT" == TITLE:* ]]; then
        REMAINDER="\${CONTEXT#TITLE:}"
        APP_NAME_PARSED="\${REMAINDER%%:*}"
        TITLE="\${REMAINDER#*:}"
        PROJECT_NAME=""
        if [[ "$APP_NAME_PARSED" == "Ghostty" ]]; then
            LAST_WORD=$(echo "$TITLE" | awk '{print $NF}')
            PROJECT_NAME=$(basename "$LAST_WORD")
        elif [[ "$APP_NAME_PARSED" == "studio" ]]; then
            EXTRACTED_PATH=$(echo "$TITLE" | awk -F'[][]' '{print $2}')
            if [ -n "$EXTRACTED_PATH" ]; then
                APP_PATH="\${EXTRACTED_PATH/\\~/$HOME}"
                PROJECT_NAME="" 
            else
                PROJECT_NAME=$(echo "$TITLE" | awk '{print $1}')
            fi
        else
            CLEAN_TITLE=$(echo "$TITLE" | sed -e 's/ — /|/g' -e 's/ – /|/g' -e 's/ - /|/g')
            PART_COUNT=$(echo "$CLEAN_TITLE" | awk -F'|' '{print NF}')
            if [ "$PART_COUNT" -ge 2 ]; then
                PROJECT_NAME=$(echo "$CLEAN_TITLE" | awk -F'|' '{print $2}')
            else
                PROJECT_NAME="$CLEAN_TITLE"
            fi
        fi
        PROJECT_NAME=$(echo "$PROJECT_NAME" | xargs)
        if [ -n "$PROJECT_NAME" ]; then
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
    fi
fi

# Fallback to HOME if no path found
if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
    APP_PATH="$HOME"
    echo "ERROR:FALLBACK_HOME"
fi

cd "$APP_PATH" || { echo "ERROR:INVALID_PATH"; exit 0; }

if [[ "$TYPE" == git_* ]]; then
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo "ERROR:NOT_GIT_REPO"
        exit 0
    fi
    
    if [ "$TYPE" == "git_branches" ]; then
        git branch -a --format='%(refname:short)|%(refname)'
    elif [ "$TYPE" == "git_changed_files" ]; then
        git status --porcelain
    elif [ "$TYPE" == "git_remotes" ]; then
        git remote
    elif [ "$TYPE" == "git_stashes" ]; then
        git stash list
    elif [ "$TYPE" == "git_tags" ]; then
        git tag
    elif [ "$TYPE" == "git_commits" ]; then
        git log --all -n 50 --pretty=format:"%h|%s%d"
    fi
elif [ "$TYPE" == "file_path" ]; then
    ls -1p | grep -v "^\\./$" | grep -v "^\\.\\./$"
elif [ "$TYPE" == "docker_containers" ]; then
    docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}" 2>/dev/null
elif [ "$TYPE" == "docker_containers_all" ]; then
    docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}" 2>/dev/null
elif [ "$TYPE" == "docker_images" ]; then
    docker images --format "{{.ID}}|{{.Repository}}:{{.Tag}}|{{.Size}}" 2>/dev/null
elif [ "$TYPE" == "docker_volumes" ]; then
    docker volume ls --format "{{.Name}}|{{.Driver}}" 2>/dev/null
elif [ "$TYPE" == "docker_networks" ]; then
    docker network ls --format "{{.ID}}|{{.Name}}|{{.Driver}}" 2>/dev/null
elif [ "$TYPE" == "docker_contexts" ]; then
    docker context ls --format "{{.Name}}|{{.Description}}" 2>/dev/null
elif [ "$TYPE" == "npm_scripts" ]; then
    if [ -f "package.json" ]; then
        node -e "const pkg=require('./package.json'); if(pkg.scripts) Object.keys(pkg.scripts).forEach(k => console.log(k + '|' + pkg.scripts[k]))" 2>/dev/null
    else
        echo "ERROR:NO_PACKAGE_JSON"
    fi
elif [ "$TYPE" == "npm_dependencies" ]; then
    if [ -f "package.json" ]; then
        node -e "const pkg=require('./package.json'); const deps = {...pkg.dependencies, ...pkg.devDependencies}; Object.keys(deps).forEach(k => console.log(k + '|' + deps[k]))" 2>/dev/null
    else
        echo "ERROR:NO_PACKAGE_JSON"
    fi
elif [ "$TYPE" == "docker_compose_services" ]; then
    if [ -f "docker-compose.yml" ]; then
        grep -E "^  [a-zA-Z0-9_-]+:" docker-compose.yml | sed 's/://g' | awk '{print $1}'
    elif [ -f "compose.yaml" ]; then
        grep -E "^  [a-zA-Z0-9_-]+:" compose.yaml | sed 's/://g' | awk '{print $1}'
    else
        echo "ERROR:NO_DOCKER_COMPOSE"
    fi
elif [ "$TYPE" == "k8s_namespaces" ]; then
    kubectl get namespaces -o custom-columns=NAME:.metadata.name --no-headers 2>/dev/null
elif [ "$TYPE" == "k8s_pods" ]; then
    kubectl get pods --all-namespaces -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,STATUS:.status.phase --no-headers 2>/dev/null | awk '{print $2 "|" $1 "|" $3}'
elif [ "$TYPE" == "npm_workspaces" ]; then
    if [ -f "package.json" ]; then
        node -e "const p=require('./package.json'); if(p.workspaces) { const w = Array.isArray(p.workspaces) ? p.workspaces : p.workspaces.packages; if(w) w.forEach(x => console.log(x)) }" 2>/dev/null
    else
        echo "ERROR:NO_PACKAGE_JSON"
    fi
elif [ "$TYPE" == "npm_bins" ]; then
    if [ -d "node_modules/.bin" ]; then
        ls -1 node_modules/.bin
    fi
elif [ "$TYPE" == "active_ports" ]; then
    lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR>1 {print $9 "|" $1 "|" $2}' | sed 's/.*://'
elif [ "$TYPE" == "top_processes" ]; then
    ps -eo pid,pcpu,pmem,comm 2>/dev/null | sort -k 2 -nr | head -n 20 | awk '{print $1 "|" $2 "|" $3 "|" $4}'
elif [ "$TYPE" == "ssh_hosts" ]; then
    if [ -f "$HOME/.ssh/config" ]; then
        grep -i "^Host " "$HOME/.ssh/config" | awk '{print $2}' | grep -v "\\*"
    fi
elif [ "$TYPE" == "adb_devices" ]; then
    if ! command -v adb >/dev/null 2>&1; then
        echo "ERROR:NO_ADB"
    else
        adb devices -l 2>/dev/null | awk 'NR>1 && $2=="device" {
            device_id=$1;
            model="";
            for(i=3;i<=NF;i++) {
                if($i ~ /^model:/) {
                    model=substr($i, 7);
                    break;
                }
            }
            if(model=="") model="Unknown Device";
            print device_id "|" model
        }'
    fi
elif [ "$TYPE" == "apk_files" ]; then
    find . -name "*.apk" -type f -maxdepth 5 2>/dev/null
else
    # 尝试在配置的 scripts/dynamic 文件夹中查找自定义脚本
    PREFS_SCRIPTS_DIR="${getPreferenceValues<Preferences>().scriptsDir}"
    IFS=',' read -ra DIR_ARRAY <<< "$PREFS_SCRIPTS_DIR"
    SCRIPT_FOUND=0
    for dir in "\${DIR_ARRAY[@]}"; do
        dir=$(eval echo "$dir") # 展开 ~
        SCRIPT_PATH="$dir/dynamic/$TYPE"
        if [ -x "$SCRIPT_PATH" ]; then
            # 执行自定义脚本，传入当前上下文路径作为第一个参数
            "$SCRIPT_PATH" "$APP_PATH"
            SCRIPT_FOUND=1
            break
        elif [ -x "$SCRIPT_PATH.sh" ]; then
            "$SCRIPT_PATH.sh" "$APP_PATH"
            SCRIPT_FOUND=1
            break
        elif [ -x "$SCRIPT_PATH.py" ]; then
            "$SCRIPT_PATH.py" "$APP_PATH"
            SCRIPT_FOUND=1
            break
        fi
    done
    
    if [ "$SCRIPT_FOUND" -eq 0 ]; then
        echo "ERROR:UNKNOWN_DYNAMIC_TYPE"
    fi
fi
`;

    const { stdout } = await execAsync(script, { shell: '/bin/bash', encoding: 'utf-8' });
    const lines = stdout.split('\n').map(b => b.trim()).filter(b => b.length > 0);
    
    // Check for errors
    if (lines[0] === "ERROR:INVALID_PATH") {
      throw new Error(`无效的路径。`);
    }
    const requiresPath = type.startsWith("git_") || type.startsWith("npm_") || type === "file_path" || type === "docker_compose_services" || type === "apk_files";
    if (lines[0] === "ERROR:FALLBACK_HOME" && requiresPath) {
      throw new Error(`无法解析当前 App (${appName}) 的路径，已降级至用户主目录 (~)。`);
    }
    if (lines[0] === "ERROR:NOT_GIT_REPO" || (lines.length > 1 && lines[1] === "ERROR:NOT_GIT_REPO")) {
      throw new Error(`当前路径不是一个 Git 仓库，无法获取 ${type}。`);
    }
    if (lines[0] === "ERROR:NO_PACKAGE_JSON" || (lines.length > 1 && lines[1] === "ERROR:NO_PACKAGE_JSON")) {
      throw new Error(`当前路径下未找到 package.json 文件，无法获取 ${type}。`);
    }
    if (lines[0] === "ERROR:NO_DOCKER_COMPOSE" || (lines.length > 1 && lines[1] === "ERROR:NO_DOCKER_COMPOSE")) {
      throw new Error(`当前路径下未找到 docker-compose.yml 或 compose.yaml 文件。`);
    }
    if (lines[0] === "ERROR:NO_ADB" || (lines.length > 1 && lines[1] === "ERROR:NO_ADB")) {
      throw new Error(`未找到 adb 命令，请确保已安装 Android SDK 并在终端中可用。`);
    }
    if (lines[0] === "ERROR:UNKNOWN_DYNAMIC_TYPE" || (lines.length > 1 && lines[1] === "ERROR:UNKNOWN_DYNAMIC_TYPE")) {
      throw new Error(`未知的动态参数类型: ${type}。如果这是自定义类型，请确保在配置目录的 scripts/ 文件夹下存在对应的可执行脚本。`);
    }

    const options: DynamicOption[] = [];

    if (type === "git_changed_files") {
      options.push({ value: ".", title: ". (全部更改)" });
    }

    for (const line of lines) {
      if (line.startsWith("ERROR:")) continue;
      
      if (type === "git_branches") {
        const parts = line.split('|');
        if (parts.length < 2) continue;
        const short = parts[0];
        const full = parts[1];
        if (short.includes('->')) continue; // Skip HEAD pointer
        const isRemote = full.startsWith('refs/remotes/');
        options.push({
          value: short,
          title: `${short} [${isRemote ? 'R' : 'L'}]`
        });
      } else if (type === "git_commits") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          options.push({
            value: parts[0],
            title: `${parts[0]} - ${parts.slice(1).join('|')}`
          });
        }
      } else if (type === "git_changed_files") {
        const status = line.substring(0, 2);
        const file = line.substring(3).trim();
        options.push({
          value: file,
          title: `${file} [${status.trim()}]`
        });
      } else if (type === "git_stashes") {
        const match = line.match(/^(stash@\{\d+\}):(.*)/);
        if (match) {
          options.push({
            value: match[1],
            title: line
          });
        }
      } else if (type === "docker_containers" || type === "docker_containers_all") {
        const parts = line.split('|');
        if (parts.length >= 4) {
          const id = parts[0];
          const name = parts[1];
          const image = parts[2];
          const status = parts[3];
          options.push({
            value: name, // Using name is usually more friendly than ID
            title: `${name} (${image}) - ${status}`
          });
        }
      } else if (type === "docker_images") {
        const parts = line.split('|');
        if (parts.length >= 3) {
          const id = parts[0];
          const repoTag = parts[1];
          const size = parts[2];
          options.push({
            value: repoTag === "<none>:<none>" ? id : repoTag,
            title: `${repoTag} [${size}]`
          });
        }
      } else if (type === "docker_volumes") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          options.push({ value: parts[0], title: `${parts[0]} [${parts[1]}]` });
        }
      } else if (type === "docker_networks") {
        const parts = line.split('|');
        if (parts.length >= 3) {
          options.push({ value: parts[1], title: `${parts[1]} [${parts[2]}]` });
        }
      } else if (type === "docker_contexts") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          options.push({ value: parts[0], title: `${parts[0]} - ${parts[1]}` });
        }
      } else if (type === "npm_scripts") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const scriptName = parts[0];
          const scriptCmd = parts.slice(1).join('|');
          options.push({
            value: scriptName,
            title: `${scriptName} (${scriptCmd})`
          });
        }
      } else if (type === "npm_dependencies") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const pkgName = parts[0];
          const pkgVersion = parts[1];
          options.push({
            value: pkgName,
            title: `${pkgName} [${pkgVersion}]`
          });
        }
      } else if (type === "k8s_pods") {
        const parts = line.split('|');
        if (parts.length >= 3) {
          options.push({
            value: parts[0],
            title: `${parts[0]} (${parts[1]}) - ${parts[2]}`
          });
        }
      } else if (type === "active_ports") {
        const parts = line.split('|');
        if (parts.length >= 3) {
          options.push({
            value: parts[0],
            title: `Port ${parts[0]} - ${parts[1]} (PID: ${parts[2]})`
          });
        }
      } else if (type === "top_processes") {
        const parts = line.split('|');
        if (parts.length >= 4) {
          options.push({
            value: parts[0],
            title: `PID: ${parts[0]} | CPU: ${parts[1]}% | MEM: ${parts[2]}% | ${parts[3]}`
          });
        }
      } else if (type === "adb_devices") {
        const parts = line.split('|');
        if (parts.length >= 2) {
          options.push({
            value: parts[0],
            title: `${parts[1]} (${parts[0]})`
          });
        }
      } else if (type === "apk_files") {
        const name = line.split('/').pop() || line;
        options.push({
          value: line,
          title: name
        });
      } else {
        // 自定义脚本的输出解析逻辑
        const parts = line.split('|');
        if (parts.length >= 2) {
          options.push({
            value: parts[0],
            title: parts.slice(1).join('|')
          });
        } else {
          options.push({
            value: line,
            title: line
          });
        }
      }
    }
    return options;
  } catch (e: any) {
    console.error("Failed to fetch git dynamic options async:", e);
    throw e;
  }
}

export function saveToolToLocal(tool: Tool, explicitCategory?: string): { category: string, path: string } {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.toolsDir);
  if (dirs.length === 0) throw new Error("Tools Directory is not configured");
  
  let category = explicitCategory || "custom";
  let targetDir = dirs[0];
  
  if (!explicitCategory) {
    category = predictCategory(tool);
  }
  
  // Find which dir has this category, or default to first dir
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    if (fs.readdirSync(dir).includes(category + '.json')) {
      targetDir = dir;
      break;
    }
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, `${category}.json`);
  const backupPath = path.join(targetDir, `${category}.json.bak`);

  let data: ToolFile = { tools: [] };

  if (fs.existsSync(filePath)) {
    // 1. Create backup
    fs.copyFileSync(filePath, backupPath);
    
    // 2. Read existing
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(content);
      if (!data.tools) data.tools = [];
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e);
    }
  }

  // 3. Append new tool
  const newTool = { ...tool };
  delete newTool.category; // Remove internal category field before saving
  data.tools.push(newTool);

  // 4. Save
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  
  return { category, path: filePath };
}

export function updateToolInLocal(updatedTool: Tool, explicitCategory?: string): void {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.toolsDir);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data: ToolFile = JSON.parse(content);
        const index = data.tools.findIndex(t => t.id === updatedTool.id);
        if (index !== -1) {
          // Found it!
          fs.copyFileSync(filePath, `${filePath}.bak`); // Backup
          const toolToSave = { ...updatedTool };
          delete toolToSave.category;
          
          const oldCategory = path.basename(filePath, '.json');
          const newCategory = explicitCategory || oldCategory;
          
          if (oldCategory === newCategory) {
            data.tools[index] = toolToSave;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          } else {
            // Remove from old
            data.tools.splice(index, 1);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            // Save to new
            saveToolToLocal(toolToSave, newCategory);
          }
          return;
        }
      } catch (e) {
        console.error(`Error updating ${filePath}:`, e);
      }
    }
  }
  throw new Error("Tool not found in local files.");
}

export function deleteToolFromLocal(toolId: string): void {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.toolsDir);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data: ToolFile = JSON.parse(content);
        const index = data.tools.findIndex(t => t.id === toolId);
        if (index !== -1) {
          // Found it!
          fs.copyFileSync(filePath, `${filePath}.bak`); // Backup
          data.tools.splice(index, 1);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          return;
        }
      } catch (e) {
        console.error(`Error deleting from ${filePath}:`, e);
      }
    }
  }
  throw new Error("Tool not found in local files.");
}

export function restoreBackup(category: string = "custom"): boolean {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.toolsDir);
  if (dirs.length === 0) return false;
  const toolsDir = dirs[0];
  
  const filePath = path.join(toolsDir, `${category}.json`);
  const backupPath = path.join(toolsDir, `${category}.json.bak`);

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    return true;
  }
  return false;
}

export function saveDocToLocal(tool: Tool, markdownContent: string): string {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.booksDir);
  if (dirs.length === 0) {
    throw new Error("请先在插件设置 (Cmd+Shift+,) 中配置 Books Directory");
  }
  
  const booksDir = dirs[0];
  
  if (!fs.existsSync(booksDir)) {
    fs.mkdirSync(booksDir, { recursive: true });
  }

  // 1. Save Markdown file
  const mdFileName = `${tool.id}.md`;
  const mdFilePath = path.join(booksDir, mdFileName);
  fs.writeFileSync(mdFilePath, markdownContent, 'utf-8');

  // 2. Update ai_generated.json in booksDir
  const jsonFilePath = path.join(booksDir, "ai_generated.json");
  let data: BookFile = { books: [] };

  if (fs.existsSync(jsonFilePath)) {
    try {
      const content = fs.readFileSync(jsonFilePath, 'utf-8');
      data = JSON.parse(content);
      if (!data.books) data.books = [];
    } catch (e) {
      console.error(`Error reading ${jsonFilePath}:`, e);
    }
  }

  // Check if book already exists (we now just store the filename elegantly)
  const targetPath = mdFileName;
  const existingIndex = data.books.findIndex(b => b.target === targetPath);
  
  const newBook: Book = {
    title: `AI 指南: ${tool.title}`,
    subtitle: tool.cmd,
    target: targetPath,
    tags: ["ai-doc", tool.category || "custom"]
  };

  if (existingIndex >= 0) {
    data.books[existingIndex] = newBook;
  } else {
    data.books.push(newBook);
  }

  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8');
  
  return mdFilePath;
}

export function saveScriptToLocal(name: string, code: string, lang: string): string {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.scriptsDir);
  if (dirs.length === 0) throw new Error("Scripts Directory is not configured");
  
  // 默认保存到第一个配置的目录的 dynamic 文件夹
  const targetDir = path.join(dirs[0], "dynamic");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const ext = lang === 'python' ? '.py' : '.sh';
  const fileName = name.endsWith(ext) ? name : `${name}${ext}`;
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, code, 'utf-8');
  fs.chmodSync(filePath, 0o755); // make executable
  return filePath;
}

export function getExistingDocPath(toolId: string): string | null {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.booksDir);
  
  for (const booksDir of dirs) {
    const mdFilePath = path.join(booksDir, `${toolId}.md`);
    if (fs.existsSync(mdFilePath)) {
      return mdFilePath;
    }
  }
  return null;
}

export interface CustomScript {
  name: string;
  path: string;
  code: string;
  title?: string;
  language: string;
}

export function getCustomScripts(): CustomScript[] {
  const prefs = getPreferenceValues<Preferences>();
  const dirs = getDirPaths(prefs.scriptsDir);
  const scripts: CustomScript[] = [];

  for (const baseDir of dirs) {
    const dir = path.join(baseDir, "dynamic");
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sh') || f.endsWith('.py') || !f.includes('.'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isFile()) {
        try {
          const code = fs.readFileSync(fullPath, 'utf-8');
          
          // Parse title from first comment line
          const lines = code.split('\n');
          let title = "";
          for (const line of lines) {
            if (line.trim().startsWith('#') && !line.trim().startsWith('#!')) {
              title = line.replace(/^#\s*(Title:)?\s*/i, '').trim();
              if (title) break;
            }
          }
          
          const language = file.endsWith('.py') ? 'Python' : 'Bash';
          scripts.push({ name: file, path: fullPath, code, title, language });
        } catch (e) {
          console.error(`Error reading script ${file}:`, e);
        }
      }
    }
  }
  return scripts;
}

export function deleteDocFromLocal(tool: Tool): boolean {
  const existingPath = getExistingDocPath(tool.id);
  if (existingPath) {
    fs.unlinkSync(existingPath);
    return true;
  }
  return false;
}

export function getContextTags(): string[] {
  const tags: string[] = [];
  try {
    const prefs = getPreferenceValues<Preferences>();
    let appMappings: Record<string, string[]> = {
      "code": ["node", "git", "npm"],
      "cursor": ["node", "git", "npm"],
      "android studio": ["android", "adb", "gradle"],
      "xcode": ["xcode", "ios", "swift"],
      "iterm": ["git", "node", "docker"],
      "terminal": ["git", "node", "docker"],
      "ghostty": ["git", "node", "docker"],
      "alacritty": ["git", "node", "docker"],
      "kitty": ["git", "node", "docker"]
    };

    if (prefs.contextAppMappings) {
      try {
        const parsed = JSON.parse(prefs.contextAppMappings);
        if (typeof parsed === 'object') {
          appMappings = { ...appMappings, ...parsed };
        }
      } catch (e) {
        console.error("Failed to parse contextAppMappings", e);
      }
    }

    const execSync = require('child_process').execSync;
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell
      return frontApp
    `;
    const appName = execSync(`osascript -e '${script}'`).toString().trim();

    // App-based tags
    if (appName) {
      const app = appName.toLowerCase();
      for (const [key, mappedTags] of Object.entries(appMappings)) {
        if (app.includes(key.toLowerCase())) {
          tags.push(...mappedTags);
        }
      }
    }

    // Since getActiveAppPath is async and getContextTags is sync, 
    // we do a quick check for Finder specifically here just for tags,
    // but the actual active path is handled better by getActiveAppPath in other places.
    let activePath = "";
    if (appName === "Finder") {
      try {
        activePath = execSync(`osascript -e 'tell application "Finder" to get POSIX path of (insertion location as alias)'`).toString().trim();
      } catch (e) {}
    }

    // Path-based tags (if available)
    if (activePath && fs.existsSync(activePath)) {
      if (fs.existsSync(path.join(activePath, 'package.json'))) {
        tags.push('node', 'npm', 'yarn', 'pnpm');
      }
      if (fs.existsSync(path.join(activePath, '.git'))) {
        tags.push('git');
      }
      if (fs.existsSync(path.join(activePath, 'Dockerfile')) || fs.existsSync(path.join(activePath, 'docker-compose.yml'))) {
        tags.push('docker');
      }
      if (fs.existsSync(path.join(activePath, 'go.mod'))) {
        tags.push('go');
      }
      if (fs.existsSync(path.join(activePath, 'requirements.txt')) || fs.existsSync(path.join(activePath, 'pyproject.toml'))) {
        tags.push('python', 'pip');
      }
      const files = fs.readdirSync(activePath);
      if (files.some(f => f.endsWith('.xcworkspace') || f.endsWith('.xcodeproj'))) {
        tags.push('xcode', 'ios');
      }
    }
  } catch (e) {
    // Ignore if Finder is not active or other errors
  }
  return tags;
}

export async function getActiveAppPath(): Promise<string | null> {
  try {
    const execSync = require('child_process').execSync;
    const { getFrontmostApplication } = require("@raycast/api");
    const frontApp = await getFrontmostApplication();
    const appName = frontApp.name;
    const pid = frontApp.pid;

    if (appName === "Finder") {
      return execSync(`osascript -e 'tell application "Finder" to get POSIX path of (insertion location as alias)'`).toString().trim();
    } else if (appName === "iTerm2" || appName === "iTerm") {
      return execSync(`osascript -e 'tell application "iTerm" to get variable "PWD" of current session of current window'`).toString().trim();
    } else if (appName === "Terminal") {
      // Terminal doesn't easily expose PWD, but we can try lsof on its child processes
      const childPids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n');
      for (const childPid of childPids) {
        if (childPid) {
          try {
            const cwdLine = execSync(`lsof -p ${childPid} -a -d cwd -F n 2>/dev/null | grep '^n'`).toString().trim();
            if (cwdLine) return cwdLine.substring(1);
          } catch (e) {}
        }
      }
    } else if (appName === "Ghostty" || appName === "Alacritty" || appName === "Kitty") {
      // For modern terminals, try to get the CWD of the shell process they spawned
      const childPids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n');
      for (const childPid of childPids) {
        if (childPid) {
          try {
            const cwdLine = execSync(`lsof -p ${childPid} -a -d cwd -F n 2>/dev/null | grep '^n'`).toString().trim();
            if (cwdLine) return cwdLine.substring(1);
          } catch (e) {}
        }
      }
    } else if (appName === "Code" || appName === "Cursor" || appName === "Android Studio" || appName === "Xcode" || appName === "WebStorm") {
      // Try to get the document path via AppleScript UI Scripting
      try {
        const docScript = `
          tell application "System Events"
            tell process "${appName}"
              try
                set docUrl to value of attribute "AXDocument" of window 1
                return docUrl
              end try
            end tell
          end tell
        `;
        const docUrl = execSync(`osascript -e '${docScript}'`).toString().trim();
        if (docUrl && docUrl.startsWith("file://")) {
          const decodeUrl = decodeURIComponent(docUrl.substring(7));
          return require('path').dirname(decodeUrl);
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error("Error in getActiveAppPath:", e);
  }
  return null;
}
