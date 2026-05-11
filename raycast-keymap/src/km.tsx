import { ActionPanel, Action, List, Icon, LaunchProps, showToast, Toast, LocalStorage, open, Form, getPreferenceValues, confirmAlert, Alert, closeMainWindow } from "@raycast/api";
import { useState, useEffect, useMemo } from "react";
import * as fs from "fs";
import * as path from "path";
import { getTools, pureCopyCmd, saveToolToLocal, updateToolInLocal, deleteToolFromLocal, restoreBackup, getExistingDocPath, getCustomScripts, CustomScript, getAllCategories, fetchRemoteTools, getContextTags, getActiveAppPath, replaceGlobalEnvVars } from "./utils";
import { getCommandHistory, saveCommandHistory, removeCommandFromHistory } from "./history";
import Fuse from "fuse.js";
import { generateCommandFromAI, generateDocFromAI, AIPreferences, SYSTEM_PROMPT, WEB_SYSTEM_PROMPT, organizeCommandsWithAI } from "./ai";
import EditToolForm from "./components/EditToolForm";
import { ScriptPreview } from "./components/ScriptPreview";
import { ImportRawCommandForm } from "./components/ImportRawCommandForm";
import { ImportLocalScriptForm } from "./components/ImportLocalScriptForm";
import { CreateCategoryForm } from "./components/CreateCategoryForm";
import { MoveCommandsForm } from "./components/MoveCommandsForm";
import { AiOrganizePreview, OrganizeSuggestion } from "./components/AiOrganizePreview";
import { ScriptEditor } from "./components/ScriptEditor";
import { CreateAliasForm } from "./components/CreateAliasForm";
import { PipelineBuilder } from "./components/PipelineBuilder";
import { WorkflowRunner } from "./components/WorkflowRunner";
import { ImportScriptForm } from "./components/ImportScriptForm";
import { DocEditor } from "./components/DocEditor";
import { SilentExecutionView } from "./components/SilentExecutionView";
import { WebSearchResultView } from "./components/WebSearchResultView";
import { useNavigation } from "@raycast/api";
import { Tool } from "./types";
import { spawnAiWorker, readAiData, writeAiData } from "./ai_bg";

export interface AIHistoryItem {
  query: string;
  timestamp: number;
  type: 'command' | 'script' | 'web';
  resultTool?: Tool;
  resultScript?: { name: string; code: string; path: string; language: string };
  resultText?: string;
}
import { executeInGhostty } from "./ghostty";
import ParamWizard from "./components/ParamWizard";
import Wizard from "./components/Wizard";

interface CommandArguments {
  query?: string;
}

function RetryForm({ onSubmit }: { onSubmit: (reason: string) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm 
            title="Retry Generation" 
            icon={Icon.ArrowClockwise}
            onSubmit={(values) => { 
              onSubmit(values.reason as string); 
              pop(); 
            }} 
          />
        </ActionPanel>
      }
    >
      <Form.TextArea 
        id="reason" 
        title="错误原因 (可选)" 
        placeholder="例如：缺少了 -f 参数，或者报错了 xxx..." 
        enableMarkdown={true}
      />
    </Form>
  );
}

function BuiltInScriptsList() {
  const builtInScripts = [
    "git_branches", "git_changed_files", "git_remotes", "git_stashes", "git_tags", "git_commits",
    "file_path", "docker_containers", "docker_containers_all", "docker_images", "docker_volumes",
    "docker_networks", "docker_contexts", "npm_scripts", "npm_dependencies", "npm_workspaces",
    "npm_bins", "docker_compose_services", "k8s_namespaces", "k8s_pods", "active_ports",
    "top_processes", "ssh_hosts", "adb_devices", "apk_files"
  ];

  return (
    <List searchBarPlaceholder="Search built-in scripts...">
      <List.Section title="内置脚本 (Built-in Scripts - 不可修改)">
        {builtInScripts.map(name => (
          <List.Item
            key={`builtin-${name}`}
            icon={Icon.Lock}
            title={name}
            subtitle="Built-in dynamic parameter"
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Script Name" content={name} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export default function Command(props: LaunchProps<{ arguments: CommandArguments }>) {
  const { push } = useNavigation();
  const [tools, setTools] = useState<Tool[]>([]);
  const [searchText, setSearchText] = useState(props.arguments.query || "");
  const [history, setHistory] = useState<string[]>([]);
  const [activeWorkflows, setActiveWorkflows] = useState<Tool[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [listMode, setListMode] = useState<string>("all_smart");
  const [frecency, setFrecency] = useState<Record<string, number>>({});
  const [showDetail, setShowDetail] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedTool, setAIGeneratedTool] = useState<Tool | null>(null);
  const [aiHistory, setAiHistory] = useState<{ role: string; content: string }[]>([]);
  const [aiFailCount, setAiFailCount] = useState(0);
  const [aiQueryHistory, setAiQueryHistory] = useState<AIHistoryItem[]>([]);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [masteredCmds, setMasteredCmds] = useState<Record<string, boolean>>({});
  const [customScripts, setCustomScripts] = useState<CustomScript[]>([]);
  const [contextTags, setContextTags] = useState<string[]>([]);

  const handleDeleteScript = async (script: CustomScript) => {
    // Check references
    const referencingTools = tools.filter(t => 
      t.params?.some(p => p.dynamic === script.name || p.dynamic === script.name.replace(/\.[^/.]+$/, ""))
    );
    
    if (referencingTools.length > 0) {
      const toolNames = referencingTools.map(t => t.title || t.cmd).join(", ");
      await showToast({
        style: Toast.Style.Failure,
        title: "无法删除",
        message: `该脚本正被以下命令使用: ${toolNames}`
      });
      return;
    }

    try {
      fs.unlinkSync(script.path);
      setCustomScripts(getCustomScripts());
      await showToast({ style: Toast.Style.Success, title: "脚本已删除" });
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "删除失败", message: e.message });
    }
  };

  const toggleMastered = async (toolId: string) => {
    const newMastered = { ...masteredCmds, [toolId]: !masteredCmds[toolId] };
    setMasteredCmds(newMastered);
    await LocalStorage.setItem("mastered_cmds", JSON.stringify(newMastered));
    showToast({
      style: Toast.Style.Success,
      title: newMastered[toolId] ? "已标记为完全掌握" : "已取消完全掌握标记",
      message: newMastered[toolId] ? "该命令将在搜索结果中靠后显示" : "该命令搜索权重已恢复"
    });
  };

  const syncAiData = () => {
    const bgData = readAiData();
    let needsWrite = false;
    const now = Date.now();
    
    // Sync active tasks and handle timeouts
    if (bgData.tasks) {
      const prefs = getPreferenceValues<AIPreferences>();
      const timeoutMs = parseInt(prefs.aiTaskTimeoutSeconds || "300", 10) * 1000;
      for (const [taskId, task] of Object.entries(bgData.tasks) as [string, any][]) {
        if (task.status === 'pending' || task.status === 'running') {
          if (now - task.timestamp > timeoutMs) {
            // Task timed out, delete it directly
            delete bgData.tasks[taskId];
            needsWrite = true;
          }
        }
      }
      
      if (needsWrite) {
        writeAiData(bgData);
      }

      const tasks = Object.entries(bgData.tasks)
        .map(([id, t]) => ({ id, ...(t as any) }))
        .filter((t: any) => t.status === 'pending' || t.status === 'running' || (t.status === 'success' && t.mode === 'doc'));
      setActiveTasks(tasks.sort((a: any, b: any) => b.timestamp - a.timestamp));
    }

    // Sync history
    if (bgData.history && bgData.history.length > 0) {
      const prefs = getPreferenceValues<AIPreferences>();
      const days = parseInt(prefs.aiHistoryRetentionDays || "7", 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const validHistory = bgData.history.filter((item: any) => item.timestamp > cutoff);
      setAiQueryHistory(validHistory);
    } else {
      // Fallback to local storage if bg data is empty (migration)
      LocalStorage.getItem<string>("ai_query_history").then(res => {
        if (res) {
          try {
            const parsed = JSON.parse(res) as AIHistoryItem[];
            const prefs = getPreferenceValues<AIPreferences>();
            const days = parseInt(prefs.aiHistoryRetentionDays || "7", 10);
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            const validHistory = parsed.filter(item => item.timestamp > cutoff);
            setAiQueryHistory(validHistory);
          } catch (e) {}
        }
      });
    }
  };

  const loadHistory = syncAiData;

  // Load last generated tool on mount
  useEffect(() => {
    LocalStorage.getItem<string>("last_ai_generated_tool").then(data => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as Tool;
          setAIGeneratedTool(parsed);
        } catch (e) {}
      }
    });
    
    syncAiData();
    const interval = setInterval(syncAiData, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    if (aiGeneratedTool) {
      setAIGeneratedTool(null);
      LocalStorage.removeItem("last_ai_generated_tool");
      setAiHistory([]);
      setAiFailCount(0);
    }
  };

  const [aiTargetMode, setAiTargetMode] = useState<string>("all");
  const prefs = getPreferenceValues<AIPreferences>();
  const aiPrefix = prefs.aiTriggerPrefix || "@";
  const isAIMode = searchText.startsWith(aiPrefix);
  const aiQuery = isAIMode ? searchText.substring(aiPrefix.length).trim() : searchText.trim();

  // We no longer have distinct modes based on prefix, everything is inside isAIMode

  useEffect(() => {
    setTools(getTools());
    setCustomScripts(getCustomScripts());
    setContextTags(getContextTags());
    getCommandHistory().then(setHistory);
    
    // Check for active workflows
    LocalStorage.allItems().then(items => {
      const activeIds = Object.keys(items)
        .filter(k => k.startsWith('km_workflow_state_'))
        .filter(k => items[k] !== undefined)
        .map(k => k.replace('km_workflow_state_', ''));
      
      const allTools = getTools();
      const active = allTools.filter(t => activeIds.includes(t.id) && t.mode === 'workflow');
      setActiveWorkflows(active);
    });
    
    // Also try to get async tags based on active path
    getActiveAppPath().then(activePath => {
      if (activePath && fs.existsSync(activePath)) {
        const newTags: string[] = [];
        if (fs.existsSync(path.join(activePath, 'package.json'))) newTags.push('node', 'npm', 'yarn', 'pnpm');
        if (fs.existsSync(path.join(activePath, '.git'))) newTags.push('git');
        if (fs.existsSync(path.join(activePath, 'Dockerfile')) || fs.existsSync(path.join(activePath, 'docker-compose.yml'))) newTags.push('docker');
        if (fs.existsSync(path.join(activePath, 'go.mod'))) newTags.push('go');
        if (fs.existsSync(path.join(activePath, 'requirements.txt')) || fs.existsSync(path.join(activePath, 'pyproject.toml'))) newTags.push('python', 'pip');
        
        try {
          const files = fs.readdirSync(activePath);
          if (files.some(f => f.endsWith('.xcworkspace') || f.endsWith('.xcodeproj'))) newTags.push('xcode', 'ios');
        } catch (e) {}
        
        if (newTags.length > 0) {
          setContextTags(prev => Array.from(new Set([...prev, ...newTags])));
        }
      }
    });
    
    // Fetch remote tools in background
    fetchRemoteTools().then(() => setTools(getTools()));
    
    // Load frecency data
    LocalStorage.getItem<string>("cmd_frecency").then(data => {
      if (data) {
        try {
          setFrecency(JSON.parse(data));
        } catch (e) {}
      }
    });

    // Load mastered commands
    LocalStorage.getItem<string>("mastered_cmds").then(data => {
      if (data) {
        try {
          setMasteredCmds(JSON.parse(data));
        } catch (e) {}
      }
    });

    // We load AI query history in loadHistory() now
  }, []);

  const recordUsage = async (toolId: string) => {
    const newFrecency = { ...frecency, [toolId]: (frecency[toolId] || 0) + 1 };
    setFrecency(newFrecency);
    await LocalStorage.setItem("cmd_frecency", JSON.stringify(newFrecency));
  };

  const hasParams = (tool: Tool) => {
    return tool.params && tool.params.length > 0;
  };

  const getIconForTool = (tool: Tool) => {
    const cmd = tool.cmd.toLowerCase();
    const tags = (tool.tags || []).map(t => t.toLowerCase());
    
    if (cmd.startsWith("git ") || tags.includes("git")) return Icon.CodeBlock;
    if (cmd.startsWith("docker ") || tags.includes("docker")) return Icon.Box;
    if (cmd.startsWith("npm ") || cmd.startsWith("yarn ") || cmd.startsWith("pnpm ") || cmd.startsWith("node ") || tags.includes("node")) return Icon.Terminal;
    if (cmd.startsWith("brew ") || tags.includes("brew")) return Icon.Download;
    
    return Icon.Terminal;
  };

  const formatCategory = (cat: string) => {
    if (cat === "macos") return "macOS";
    if (cat === "npm") return "npm";
    if (cat === "git") return "Git";
    if (cat === "docker") return "Docker";
    if (cat === "android-studio") return "Android Studio";
    if (cat === "cursor") return "Cursor";
    if (cat === "ghostty") return "Ghostty";
    if (cat === "node") return "Node.js";
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const categories = useMemo(() => {
    const cats = new Set(tools.map(t => t.category || "other"));
    return Array.from(cats).sort();
  }, [tools]);

  const filteredHistory = useMemo(() => {
    if (isAIMode) return [];
    if (!searchText) return history.slice(0, 15);
    const fuse = new Fuse(history.map(cmd => ({ cmd })), { keys: ['cmd'], threshold: 0.4 });
    return fuse.search(searchText).map(r => r.item.cmd).slice(0, 5);
  }, [searchText, history, isAIMode]);

  // 自定义逐级过滤与评分逻辑 (复刻 Alfred Python 脚本)
  const filteredTools = useMemo(() => {
    if (isAIMode) return []; // AI 模式下不展示本地搜索结果
    
    let result = tools;
    if (activeCategory !== "all") {
      result = result.filter(t => (t.category || "other") === activeCategory);
    }

    if (listMode === "mastered") {
      result = result.filter(t => masteredCmds[t.id]);
    } else if (listMode === "frequent") {
      result = result.filter(t => frecency[t.id] > 0);
    } else if (listMode === "ai_history") {
      return []; // AI history is handled separately in render
    }

    if (!searchText.trim()) {
      if (listMode === "all_newest") {
        return [...result].reverse(); // 假设 tools 是按顺序加载的，最后加载的是最新的
      } else if (listMode === "frequent") {
        return [...result].sort((a, b) => (frecency[b.id] || 0) - (frecency[a.id] || 0)).slice(0, 20);
      }
      
      // all_smart or mastered
      return [...result].sort((a, b) => {
        let contextBoostA = 0;
        let contextBoostB = 0;
        if (contextTags.length > 0) {
          if (a.tags && a.tags.some(t => contextTags.includes(t.toLowerCase()))) contextBoostA = 5000;
          if (b.tags && b.tags.some(t => contextTags.includes(t.toLowerCase()))) contextBoostB = 5000;
          if (contextTags.includes(a.category?.toLowerCase() || "")) contextBoostA = 5000;
          if (contextTags.includes(b.category?.toLowerCase() || "")) contextBoostB = 5000;
        }
        
        // If both items have fixedOrder set to true, strictly sort by weight
        if (a.fixedOrder && b.fixedOrder) {
          return (b.weight || 0) - (a.weight || 0);
        }

        const scoreA = (frecency[a.id] || 0) * 100 + (a.weight || 0) + contextBoostA - (masteredCmds[a.id] ? 10000 : 0);
        const scoreB = (frecency[b.id] || 0) * 100 + (b.weight || 0) + contextBoostB - (masteredCmds[b.id] ? 10000 : 0);
        return scoreB - scoreA;
      });
    }

    const query = searchText.toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);

    const SYNONYMS: Record<string, string[]> = {
      "查询": ["查看", "搜索", "获取", "找", "find", "search", "get", "list"],
      "查看": ["查询", "搜索", "获取", "找", "find", "search", "get", "list"],
      "删除": ["清理", "移除", "清空", "卸载", "delete", "remove", "clear", "clean", "rm"],
      "修改": ["更新", "编辑", "设置", "update", "edit", "modify", "set"],
      "创建": ["新建", "新增", "添加", "create", "add", "new", "make", "touch"],
      "启动": ["运行", "开启", "start", "run", "boot", "up"],
      "停止": ["关闭", "结束", "退出", "stop", "close", "kill", "down"],
      "重启": ["重载", "restart", "reload"],
    };

    const expandedData = result.map(tool => {
      const title = (tool.title || "").toLowerCase();
      const cmd = (tool.cmd || "").toLowerCase();
      const desc = (tool.description || "").toLowerCase();
      const aliases = (tool.aliases || []).join(" ").toLowerCase();
      const tags = (tool.tags || []).join(" ").toLowerCase();
      const keyword = (tool.keyword || "").toLowerCase();

      let expandedText = `${title} ${cmd} ${desc} ${aliases} ${tags} ${keyword}`;
      
      Object.entries(SYNONYMS).forEach(([key, syns]) => {
        if (expandedText.includes(key)) {
          expandedText += " " + syns.join(" ");
        }
      });

      return { tool, _searchableText: expandedText };
    });

    const fuse = new Fuse(expandedData, {
      keys: ["_searchableText"],
      threshold: 0.4, // 允许一定程度的模糊匹配
      ignoreLocation: true,
      includeScore: true,
    });

    const fuseResults = fuse.search(searchText);

    // 补充：确保包含所有搜索词的命令一定会被列出（防止被 fuse 的 threshold 过滤掉）
    const fuseMatchedIds = new Set(fuseResults.map(r => r.item.tool.id));
    expandedData.forEach(item => {
      if (!fuseMatchedIds.has(item.tool.id)) {
        const allTermsMatch = terms.every(term => item._searchableText.includes(term));
        if (allTermsMatch) {
          fuseResults.push({ item, refIndex: 0, score: 0.1 });
        }
      }
    });

    const scored = fuseResults.map(res => {
      const tool = res.item.tool;
      const title = (tool.title || "").toLowerCase();
      const cmd = (tool.cmd || "").toLowerCase();
      const aliases = (tool.aliases || []).join(" ").toLowerCase();
      const tags = (tool.tags || []).map(t => t.toLowerCase());
      const category = (tool.category || "other").toLowerCase();

      // Fuse score 越小越匹配 (0 是完美匹配)
      // 转换成我们的正向分数体系: 基础分 100 - (fuse_score * 100)
      let score = Math.max(0, 100 - (res.score || 0) * 100);
      
      // 评分逻辑 (加分项)
      if (cmd.includes(query) || title.includes(query)) score += 50;
      if (cmd.startsWith(query) || title.startsWith(query)) score += 30;
      if (aliases.includes(query)) score += 40;
      if (tags.includes(query)) score += 20;

      // 包含所有搜索词的给予极高加分
      const searchableText = res.item._searchableText;
      const allTermsMatch = terms.every(term => searchableText.includes(term));
      if (allTermsMatch) {
        score += 200;
      }

      // 专场过滤逻辑：如果搜索词中明确包含了某个大类名（如 "xcode"），则非该大类（且不包含该tag）的命令将被大幅降权或过滤
      let hasCategoryFilter = false;
      let matchesCategoryFilter = false;
      terms.forEach(term => {
        if (categories.includes(term)) {
          hasCategoryFilter = true;
          if (category === term || tags.includes(term)) {
            matchesCategoryFilter = true;
          }
        }
      });

      if (hasCategoryFilter && !matchesCategoryFilter) {
        if (!allTermsMatch && category !== "custom") {
          score -= 5000; // 严重降权，使其基本不出现
        } else {
          score -= 50; // 轻微降权，保留精确匹配或自定义命令
        }
      } else if (matchesCategoryFilter) {
        score += 1000; // 专场加分
      }

      // 权重加成
      score += (tool.weight || 0);

      // Frecency 加成 (每次使用加 100 分，如果设定了 fixedOrder 则跳过)
      if (!tool.fixedOrder) {
        score += (frecency[tool.id] || 0) * 100;
      }

      // 已掌握的命令降低权重，但保持大于0，使其排在最后
      if (masteredCmds[tool.id]) {
        score = score / 10000;
      }

      return { tool, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.tool);
  }, [tools, searchText, frecency, activeCategory, listMode, isAIMode, masteredCmds, categories]);

// 解析 macOS 专属快捷键
  const parseMacShortcut = (keys: string) => {
    if (!keys) return "";
    const match = keys.match(/macOS[:：]\s*([^;；]+)/i);
    if (match) return match[1].trim();
    
    // 如果没有明确写 macOS，但包含分号，取第一部分并尝试去掉系统前缀
    const parts = keys.split(/[;；]/);
    return parts[0].replace(/macOS[:：]?\s*/i, '').trim();
  };




  const handleVerifyAI = async (testFallback: boolean = false) => {
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: testFallback ? "正在连接备用 AI 服务..." : "正在连接主 AI 服务..." });
    try {
      // Just a simple ping to the AI
      // failCount = 2 will force the AI generator to use fallback config
      await generateCommandFromAI("测试连接，请只回复'ok'", false, [], testFallback ? 2 : 0);
      toast.style = Toast.Style.Success;
      toast.title = testFallback ? "备用 AI 配置正确，连接成功！" : "主 AI 配置正确，连接成功！";
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = testFallback ? "备用 AI 连接失败" : "主 AI 连接失败";
      toast.message = error.message;
    } finally {
      setIsGeneratingAI(false);
    }
  };


  const handleGenerateDoc = async (tool: Tool) => {
    const existingPath = getExistingDocPath(tool.id);
    if (existingPath) {
      const encodedPath = encodeURIComponent(existingPath);
      await open(`hammerspoon://show_md?path=${encodedPath}`);
      await showToast({ style: Toast.Style.Success, title: "已打开本地文档" });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在后台撰写文档..." });
    const taskId = Date.now().toString();
    spawnAiWorker(taskId, JSON.stringify(tool), 'doc');
    
    // Poll for doc result
    const pollInterval = setInterval(() => {
      const data = readAiData();
      const task = data.tasks[taskId];
      
      if (task) {
        if (task.status === "success") {
          clearInterval(pollInterval);
          toast.style = Toast.Style.Success;
          toast.title = "文档生成成功！";
          push(<DocEditor tool={tool} initialContent={task.result} onSaved={() => setTools(getTools())} onDeleted={() => setTools(getTools())} />);
          loadHistory();
        } else if (task.status === "error") {
          clearInterval(pollInterval);
          toast.style = Toast.Style.Failure;
          toast.title = "文档生成失败";
          toast.message = task.error;
        }
      }
    }, 1000);
  };

  const handleAIGeneration = async (mode: 'command' | 'web' | 'script', retryReason?: string) => {
    if (!aiQuery) return;
    setIsGeneratingAI(true);
    
    let currentHistory = [...aiHistory];
    let currentFailCount = aiFailCount;
    
    if (retryReason !== undefined) {
      currentFailCount += 1;
      setAiFailCount(currentFailCount);
      const reasonText = retryReason.trim() ? `Reason: ${retryReason}` : "It was incorrect.";
      currentHistory.push({
        role: "user",
        content: `The previous command was incorrect. ${reasonText} Please provide a corrected JSON.`
      });
    } else {
      // If it's a fresh generation (not a retry), clear history
      currentHistory = [];
      currentFailCount = 0;
      setAiFailCount(0);
    }

    const toast = await showToast({ 
      style: Toast.Style.Animated, 
      title: retryReason !== undefined ? "AI 正在重新生成..." : 
             (mode === 'web' ? "AI 正在联网查询最新命令..." : 
             (mode === 'script' ? "AI 正在生成动态参数脚本..." : "AI 正在生成命令...")) 
    });

    const taskId = Date.now().toString();
    spawnAiWorker(taskId, aiQuery, mode, currentHistory, currentFailCount);
    
    // Poll for results
    const pollInterval = setInterval(() => {
      const data = readAiData();
      const task = data.tasks[taskId];
      
      if (task) {
        if (task.status === "success") {
          clearInterval(pollInterval);
          
          if (mode === 'script') {
            toast.style = Toast.Style.Success;
            toast.title = "脚本生成成功！";
            toast.message = `已保存至: ${task.result.path}`;
            push(<ScriptPreview script={task.result} path={task.result.path} prompt={aiQuery} />);
          } else if (mode === 'web') {
            toast.style = Toast.Style.Success;
            toast.title = "查询成功！";
            push(<WebSearchResultView query={aiQuery} content={task.result} />);
          } else {
            setAIGeneratedTool(task.result);
            LocalStorage.setItem("last_ai_generated_tool", JSON.stringify(task.result));
            toast.style = Toast.Style.Success;
            toast.title = "生成成功！";
          }
          
          // The worker updates history, just reload it
          loadHistory();
          setIsGeneratingAI(false);
        } else if (task.status === "error") {
          clearInterval(pollInterval);
          toast.style = Toast.Style.Failure;
          toast.title = mode === 'web' ? "查询失败" : (mode === 'script' ? "脚本生成失败" : "生成失败");
          toast.message = task.error;
          setIsGeneratingAI(false);
        }
      }
    }, 1000);
  };

  const handleSaveToLocal = async (tool: Tool) => {
    const allTools = getTools();
    
    // 1. Exact match check
    const exactMatch = allTools.find(t => t.cmd.trim() === tool.cmd.trim());
    if (exactMatch) {
      await showToast({ style: Toast.Style.Failure, title: "保存失败", message: `本地已存在完全相同的命令: ${exactMatch.title}` });
      return;
    }

    // 2. Similarity check
    const toolBase = tool.cmd.trim().split(' ').slice(0, 2).join(' ');
    const similarTools = allTools.filter(t => {
      const tBase = t.cmd.trim().split(' ').slice(0, 2).join(' ');
      return tBase === toolBase && (t.cmd.includes(tool.cmd) || tool.cmd.includes(t.cmd) || t.title === tool.title);
    });

    if (similarTools.length > 0) {
      const similar = similarTools[0];
      const confirmed = await confirmAlert({
        title: "发现相似命令",
        message: `本地已存在相似命令:\n名称: ${similar.title}\n命令: ${similar.cmd}\n\n您确定要继续保存这个新命令吗？\n新命令: ${tool.cmd}`,
        primaryAction: {
          title: "继续保存",
          style: Alert.ActionStyle.Default,
        }
      });
      if (!confirmed) return;
    }

    try {
      if (!tool.tags) tool.tags = [];
      if (!tool.tags.includes("AI生成")) {
        tool.tags.push("AI生成");
      }
      const result = saveToolToLocal(tool);
      await showToast({ style: Toast.Style.Success, title: `已保存到 ${result.category}.json` });
      // 刷新本地列表
      setTools(getTools());
    } catch (error: any) {
      await showToast({ style: Toast.Style.Failure, title: "保存失败", message: error.message });
    }
  };

  const handleRestoreBackup = async () => {
    try {
      if (restoreBackup("custom")) {
        await showToast({ style: Toast.Style.Success, title: "已恢复到上一个版本" });
        setTools(getTools());
      } else {
        await showToast({ style: Toast.Style.Failure, title: "未找到备份文件" });
      }
    } catch (error: any) {
      await showToast({ style: Toast.Style.Failure, title: "恢复失败", message: error.message });
    }
  };

  const handleAiOrganize = async () => {
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在整理命令..." });
    try {
      const allTools = getTools();
      const cats = getAllCategories();
      const suggestions = await organizeCommandsWithAI(allTools, cats);
      
      if (suggestions && suggestions.length > 0) {
        toast.style = Toast.Style.Success;
        toast.title = `发现 ${suggestions.length} 个整理建议`;
        push(<AiOrganizePreview suggestions={suggestions} onApplied={() => setTools(getTools())} />);
      } else {
        toast.style = Toast.Style.Success;
        toast.title = "无需整理";
        toast.message = "当前分类已经很完美了！";
      }
    } catch (e: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "整理失败";
      toast.message = e.message;
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const renderTool = (tool: Tool, index: number, aiMode: 'none' | 'generate' | 'web' = 'none') => {
    const needsWizard = hasParams(tool);
    
    const hasFlagsOrMulti = tool.params && tool.params.some(p => p.type === "flags" || (p.type === "multiselect" && p.dynamic !== "file_path"));
    const hasFile = tool.params && tool.params.some(p => p.type === "file" || p.type === "directory" || (p.type === "multiselect" && p.dynamic === "file_path"));
    
    // 强制使用表单模式 (Form Mode) 的条件：
    // 1. 包含 flags 或非文件的 multiselect (因为 List Mode 不支持这些多选交互)
    // 2. 包含多个参数，且【没有】文件选择参数 (因为如果有文件选择参数，List Mode 的原生文件浏览器体验更好)
    const forceFormMode = hasFlagsOrMulti || (tool.params && tool.params.length > 1 && !hasFile);
    
    const keywords = [
      tool.cmd,
      tool.keyword || "",
      ...(tool.aliases || []),
      ...(tool.tags || [])
    ].filter(Boolean);

    const displayCmd = tool.mode !== "cli" ? (tool.mac || (tool.keys ? parseMacShortcut(tool.keys) : tool.cmd)) : tool.cmd;
    const subtitle = displayCmd;

    // 智能清理参数：将 {branch} 替换为空，方便直接粘贴到终端后继续输入
    const cleanCmd = tool.cmd.replace(/\{[^}]+\}/g, '');

    const accessories = [];
    
    const hasActiveDocTask = activeTasks.some(t => t.mode === 'doc' && t.query.includes(tool.id));

    if (hasActiveDocTask) {
      accessories.push({ text: "✨ AI 正在撰写文档...", icon: Icon.Stars });
    } else if (tool.description) {
      accessories.push({ text: tool.description, tooltip: "Description" });
    } else if (tool.tags && tool.tags.length > 0) {
      accessories.push({ text: `[${tool.tags.join(", ")}]` });
    }

    if (needsWizard) {
      accessories.push({ text: "⇧↵", icon: Icon.List, tooltip: "需要填写参数" });
    }

    if (masteredCmds[tool.id]) {
      accessories.push({ text: "🎓 已掌握", tooltip: "已完全掌握，搜索排名靠后" });
    }

    if (aiMode !== 'none') {
      const isSaved = tools.some(t => t.id === tool.id || t.cmd === tool.cmd);
      if (!isSaved) {
        accessories.unshift({ icon: Icon.Stars, text: "AI (未保存)", tooltip: "尚未保存到本地，按 Cmd+Enter 保存" });
      } else {
        accessories.unshift({ icon: Icon.Stars, text: "AI", tooltip: "AI Generated" });
      }
    }

    return (
      <List.Item
        key={`${tool.id}-${index}`}
        icon={getIconForTool(tool)}
        title={tool.title}
        subtitle={subtitle}
        accessories={showDetail ? [] : accessories}
        keywords={keywords}
        detail={
          <List.Item.Detail
            markdown={`# ${tool.title}\n\n${tool.action}\n\n**Command / Keys:**\n\`\`\`bash\n${tool.cmd}\n\`\`\`\n\n${tool.description ? `**Description:**\n${tool.description}` : ''}`}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="Keys" text={tool.mac || tool.keys || "N/A"} />
                <List.Item.Detail.Metadata.TagList title="Tags">
                  {(tool.tags || []).map(t => <List.Item.Detail.Metadata.TagList.Item key={t} text={t} />)}
                </List.Item.Detail.Metadata.TagList>
                {tool.doc && <List.Item.Detail.Metadata.Link title="Doc" target={tool.doc} text="Open Documentation" />}
                {getExistingDocPath(tool.id) && <List.Item.Detail.Metadata.Link title="KB Guide" target={`file://${getExistingDocPath(tool.id)}`} text="View Local Guide" />}
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
              <ActionPanel.Section title="Execute & Copy">
              {tool.mode === "workflow" && (
                <>
                  <Action.Push
                    title="Start / Resume Workflow"
                    icon={Icon.Play}
                    target={<WorkflowRunner workflow={tool} />}
                  />
                  <Action.Push
                    title="Edit Workflow"
                    icon={Icon.Pencil}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                    target={<PipelineBuilder initialWorkflow={tool} onSaved={() => setTools(getTools())} />}
                  />
                </>
              )}
              {tool.mode === "silent" && !needsWizard && (
                <Action.Push
                  title="Execute Silently"
                  icon={Icon.Terminal}
                  target={<SilentExecutionView cmd={replaceGlobalEnvVars(tool.cmd)} title={tool.title || "Silent Execution"} />}
                />
              )}
              <Action.CopyToClipboard title="Copy Command" content={replaceGlobalEnvVars(needsWizard ? cleanCmd : tool.cmd)} onCopy={() => recordUsage(tool.id)} />
              {(aiMode === 'generate' || aiMode === 'web') && (
                <Action 
                  title="Save to Local Config" 
                  icon={Icon.SaveDocument} 
                  shortcut={{ modifiers: ["cmd"], key: "enter" }} 
                  onAction={() => handleSaveToLocal(tool)} 
                />
              )}
              {tool.mode !== "silent" && (
                <Action.Paste 
                  title="Paste to Active App" 
                  content={replaceGlobalEnvVars(needsWizard ? cleanCmd : tool.cmd)} 
                  shortcut={(aiMode === 'generate' || aiMode === 'web') ? { modifiers: ["cmd"], key: "s" } : { modifiers: ["cmd"], key: "enter" }} 
                  onPaste={async () => {
                    recordUsage(tool.id);
                    if (!needsWizard) {
                      await saveCommandHistory(replaceGlobalEnvVars(tool.cmd));
                    }
                  }} 
                />
              )}
              
              {aiMode !== 'none' && (
                <Action.Push 
                  title="Mark as Incorrect & Retry" 
                  icon={Icon.XMarkCircle} 
                  shortcut={{ modifiers: ["cmd"], key: "r" }} 
                  target={<RetryForm onSubmit={(reason) => handleAIGeneration(aiMode === 'web' ? 'web' : 'command', reason)} />} 
                />
              )}
              
              {!needsWizard && tool.mode !== "silent" && (
                <Action 
                  title="Pure Output Copy (Opt+Enter)" 
                  onAction={() => {
                    recordUsage(tool.id);
                    const pureCmd = pureCopyCmd(replaceGlobalEnvVars(tool.cmd));
                    const copyCmd = `${pureCmd} | tr -d '\n' | pbcopy`;
                    executeInGhostty(copyCmd);
                  }} 
                  shortcut={{ modifiers: ["opt"], key: "enter" }} 
                  icon={Icon.Clipboard}
                />
              )}
            </ActionPanel.Section>

            <ActionPanel.Section title="Learning & Docs">
              <Action 
                title={masteredCmds[tool.id] ? "Unmark as Mastered (取消掌握)" : "Mark as Mastered (标记掌握)"} 
                icon={masteredCmds[tool.id] ? Icon.XMarkCircle : Icon.Checkmark} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "m" }} 
                onAction={() => toggleMastered(tool.id)} 
              />
              <Action 
                title={getExistingDocPath(tool.id) ? "Open Guide (打开文档)" : "Generate Guide (生成文档)"} 
                icon={Icon.Book} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "g" }} 
                onAction={() => handleGenerateDoc(tool)} 
              />
              {getExistingDocPath(tool.id) && (
                <Action.Push
                  title="Edit Guide (编辑文档)"
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["opt", "shift"], key: "g" }}
                  target={<DocEditor tool={tool} initialContent={fs.readFileSync(getExistingDocPath(tool.id)!, 'utf-8')} onSaved={() => setTools(getTools())} onDeleted={() => setTools(getTools())} />}
                />
              )}
            </ActionPanel.Section>

            <ActionPanel.Section title="Parameters">
              {needsWizard ? (
                <>
                  {!forceFormMode ? (
                    <>
                      <Action.Push title="Fill Parameters (List Mode)" target={<ParamWizard tool={tool} onExecute={() => recordUsage(tool.id)} />} icon={Icon.List} shortcut={{ modifiers: ["shift"], key: "enter" }} />
                      <Action.Push title="Advanced Builder (Form Mode)" target={<Wizard tool={tool} onExecute={() => recordUsage(tool.id)} />} icon={Icon.Window} shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }} />
                    </>
                  ) : (
                    <>
                      <Action.Push title="Advanced Builder (Form Mode)" target={<Wizard tool={tool} onExecute={() => recordUsage(tool.id)} />} icon={Icon.Window} shortcut={{ modifiers: ["shift"], key: "enter" }} />
                      <Action.Push title="Fill Parameters (List Mode)" target={<ParamWizard tool={tool} onExecute={() => recordUsage(tool.id)} />} icon={Icon.List} shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }} />
                    </>
                  )}
                </>
              ) : (
                <Action 
                  title="Fill Parameters (Wizard)" 
                  onAction={() => showToast({ style: Toast.Style.Failure, title: "该命令没有参数需要填写" })} 
                  icon={Icon.List} 
                  shortcut={{ modifiers: ["shift"], key: "enter" }} 
                />
              )}
            </ActionPanel.Section>

            <ActionPanel.Section title="Edit">
              <Action.Push
                title="Edit Command (JSON)"
                icon={Icon.Pencil}
                shortcut={{ modifiers: ["cmd"], key: "e" }}
                target={
                  <EditToolForm
                    tool={tool}
                    onSave={async (updatedTool, explicitCategory) => {
                      if (aiMode !== 'none') {
                        try {
                          const result = saveToolToLocal(updatedTool, explicitCategory);
                          setTools(getTools());
                          showToast({ style: Toast.Style.Success, title: `已保存到 ${result.category}.json` });
                          // 保持在 AI 预览中，但由于已经保存，它会显示为已保存状态
                          setAIGeneratedTool(updatedTool);
                          LocalStorage.setItem("last_ai_generated_tool", JSON.stringify(updatedTool));
                        } catch (e: any) {
                          showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
                        }
                      } else {
                        try {
                          updateToolInLocal(updatedTool, explicitCategory);
                          setTools(getTools());
                          showToast({ style: Toast.Style.Success, title: "本地命令已更新" });
                        } catch (e: any) {
                          showToast({ style: Toast.Style.Failure, title: "更新失败", message: e.message });
                        }
                      }
                    }}
                    onDelete={() => {
                      if (aiMode !== 'none') {
                        setAIGeneratedTool(null);
                        LocalStorage.removeItem("last_ai_generated_tool");
                        showToast({ style: Toast.Style.Success, title: "AI 命令已清除" });
                      } else {
                        try {
                          deleteToolFromLocal(tool.id);
                          setTools(getTools());
                          showToast({ style: Toast.Style.Success, title: "本地命令已删除" });
                        } catch (e: any) {
                          showToast({ style: Toast.Style.Failure, title: "删除失败", message: e.message });
                        }
                      }
                    }}
                  />
                }
              />
              <Action.Push
                title="Create New Category & Move"
                icon={Icon.Folder}
                shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                target={<CreateCategoryForm onCreated={() => setTools(getTools())} />}
              />
              <Action.Push
                title="Move Custom Commands"
                icon={Icon.ArrowRight}
                shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
                target={<MoveCommandsForm onMoved={() => setTools(getTools())} />}
              />
              <Action
                title="AI Auto-Organize Categories"
                icon={Icon.Stars}
                shortcut={{ modifiers: ["opt", "shift"], key: "o" }}
                onAction={handleAiOrganize}
              />
            </ActionPanel.Section>

            <ActionPanel.Section title="View">
              <Action 
                title={showDetail ? "Hide Details" : "Show Details"} 
                icon={Icon.Sidebar} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "d" }} 
                onAction={() => setShowDetail(!showDetail)} 
              />
            </ActionPanel.Section>

            {tool.doc && (
              <ActionPanel.Section title="Help">
                <Action.OpenInBrowser title="Open Documentation" url={tool.doc} shortcut={{ modifiers: ["cmd", "shift"], key: "o" }} />
              </ActionPanel.Section>
            )}
          </ActionPanel>
        }
      />
    );
  };

  const renderActiveTasksList = () => {
    if (activeTasks.length === 0 || aiGeneratedTool) return null;
    return (
      <List.Section title="⏳ 正在后台执行的 AI 任务 (超过 5 分钟自动删除)">
        {activeTasks.map((task, index) => (
          <List.Item
            key={`active-${task.timestamp}-${index}`}
            icon={Icon.Gear}
            title={task.query}
            subtitle="AI 正在努力思考中..."
            accessories={[{ text: task.mode === 'script' ? "Script" : (task.mode === 'web' ? "Web" : "Command") }]}
            actions={
              <ActionPanel>
                <Action 
                  title="Fill in Search Bar" 
                  icon={Icon.Pencil} 
                  onAction={() => {
                    const prefix = task.mode === 'web' ? "!" : (task.mode === 'script' ? "$" : "@");
                    setSearchText(`${prefix} ${task.query}`);
                  }} 
                />
                <Action 
                  title="Cancel & Remove Task" 
                  icon={Icon.Trash} 
                  onAction={() => {
                    const bgData = readAiData();
                    if (bgData.tasks && bgData.tasks[task.id]) {
                      delete bgData.tasks[task.id];
                      writeAiData(bgData);
                      syncAiData();
                      showToast({ title: "任务已取消并删除", style: Toast.Style.Success });
                    }
                  }} 
                  shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                  style={Action.Style.Destructive}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    );
  };

  const renderAiHistoryList = (historyItems: AIHistoryItem[], title: string = "🕒 最近的 AI 查询 (回车查看结果)") => {
    if (historyItems.length === 0 || aiGeneratedTool) return null;
    return (
      <List.Section title={title}>
        {historyItems.map((item, index) => {
          if (item.type === 'command' && item.resultTool) {
            return renderTool(item.resultTool, index, 'generate');
          } else if (item.type === 'web' && item.resultText) {
            return (
              <List.Item
                key={`history-${item.timestamp}-${index}`}
                icon={Icon.Globe}
                title={item.query}
                subtitle={new Date(item.timestamp).toLocaleString()}
                accessories={[{ icon: Icon.Stars, text: "Web Search" }]}
                actions={
                  <ActionPanel>
                    <Action.Push 
                      title="View Search Result" 
                      icon={Icon.Eye}
                      target={<WebSearchResultView query={item.query} content={item.resultText} />} 
                    />
                    <Action 
                      title="Remove from History" 
                      icon={Icon.Trash} 
                      onAction={() => {
                        const bgData = readAiData();
                        if (bgData.history) {
                          bgData.history = bgData.history.filter((h: any) => h.timestamp !== item.timestamp);
                          writeAiData(bgData);
                        }
                        const newHist = aiQueryHistory.filter(h => h.timestamp !== item.timestamp);
                        setAiQueryHistory(newHist);
                        LocalStorage.setItem("ai_query_history", JSON.stringify(newHist));
                      }} 
                      shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                      style={Action.Style.Destructive}
                    />
                  </ActionPanel>
                }
              />
            );
          } else {
            return (
              <List.Item
                key={`history-${item.timestamp}-${index}`}
                icon={Icon.Terminal}
                title={item.query}
                subtitle={new Date(item.timestamp).toLocaleString()}
                accessories={[{ icon: Icon.Stars, text: "AI Script" }]}
                actions={
                  <ActionPanel>
                    {item.resultScript && (
                      <Action.Push 
                        title="View Generated Script" 
                        icon={Icon.Eye}
                        target={<ScriptPreview script={item.resultScript} path={item.resultScript.path} prompt={item.query} />} 
                      />
                    )}
                    <Action 
                      title="Fill in Search Bar" 
                      icon={Icon.Pencil} 
                      onAction={() => {
                        setSearchText(`${aiPrefix} ${item.query}`);
                      }} 
                    />
                    <Action 
                      title="Remove from History" 
                      icon={Icon.Trash} 
                      onAction={() => {
                        const bgData = readAiData();
                        if (bgData.history) {
                          bgData.history = bgData.history.filter((h: any) => h.timestamp !== item.timestamp);
                          writeAiData(bgData);
                        }
                        const newHist = aiQueryHistory.filter(h => h.timestamp !== item.timestamp);
                        setAiQueryHistory(newHist);
                        LocalStorage.setItem("ai_query_history", JSON.stringify(newHist));
                      }} 
                      shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                      style={Action.Style.Destructive}
                    />
                  </ActionPanel>
                }
              />
            );
          }
        })}
      </List.Section>
    );
  };

  let listContent;
  
  if (isAIMode) {
    const filteredHistory = aiQueryHistory.filter(item => 
      item.query.toLowerCase().includes(aiQuery.toLowerCase())
    );

    listContent = (
      <>
        {aiGeneratedTool && (
          <List.Section title="✨ AI 生成的命令 (可复制或保存)">
            {renderTool(aiGeneratedTool, -1, 'generate')}
          </List.Section>
        )}
        <List.Section title="AI 模式选择 (AI Mode Selection)">
          {(aiTargetMode === 'all' || aiTargetMode === 'command') && (
            <>
              <List.Item
                icon={Icon.Stars}
                title={aiQuery ? `✨ 生成命令: "${aiQuery}"` : "✨ 生成命令 (Generate Command)..."}
                subtitle="通过自然语言生成命令并保存到本地"
                actions={
                  <ActionPanel>
                    {aiQuery && <Action title="Generate Command" onAction={() => handleAIGeneration('command')} icon={Icon.Wand} />}
                    <Action.Push
                      title="Import Raw Command (AI)"
                      icon={Icon.Terminal}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                      target={<ImportRawCommandForm onImported={() => setTools(getTools())} />}
                    />
                    <Action.Push
                      title="Import Local Script (AI)"
                      icon={Icon.Document}
                      shortcut={{ modifiers: ["cmd", "opt"], key: "i" }}
                      target={<ImportLocalScriptForm onImported={() => setTools(getTools())} />}
                    />
                    <Action.CopyToClipboard 
                      title="Copy Prompt Template" 
                      content={`${SYSTEM_PROMPT}\n\nUser Request: ${aiQuery}`} 
                      icon={Icon.Clipboard} 
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} 
                    />
                    <Action title="Verify Primary AI" onAction={() => handleVerifyAI(false)} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                    <Action title="Verify Fallback AI" onAction={() => handleVerifyAI(true)} icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd", "shift"], key: "t" }} />
                    <Action 
                      title="Refresh Remote Tools" 
                      onAction={async () => {
                        const toast = await showToast({ style: Toast.Style.Animated, title: "Refreshing Remote Tools..." });
                        await fetchRemoteTools(true);
                        setTools(getTools());
                        toast.style = Toast.Style.Success;
                        toast.title = "Remote Tools Refreshed";
                      }} 
                      icon={Icon.Download} 
                      shortcut={{ modifiers: ["cmd", "shift"], key: "u" }} 
                    />
                    <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
                  </ActionPanel>
                }
              />
              <List.Item
                icon={Icon.Globe}
                title={aiQuery ? `🌐 联网查询: "${aiQuery}"` : "🌐 联网查询最新命令 (Web Search)..."}
                subtitle="查询最新、最准确的命令（不提供保存）"
                actions={
                  <ActionPanel>
                    {aiQuery && <Action title="Search Command" onAction={() => handleAIGeneration('web')} icon={Icon.MagnifyingGlass} />}
                    <Action.CopyToClipboard 
                      title="Copy Prompt Template" 
                      content={`${WEB_SYSTEM_PROMPT}\n\nUser Request: ${aiQuery}`} 
                      icon={Icon.Clipboard} 
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} 
                    />
                    <Action title="Verify Primary AI" onAction={() => handleVerifyAI(false)} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                    <Action title="Verify Fallback AI" onAction={() => handleVerifyAI(true)} icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd", "shift"], key: "t" }} />
                  </ActionPanel>
                }
              />
            </>
          )}
          {(aiTargetMode === 'all' || aiTargetMode === 'script') && (
            <List.Item
              icon={Icon.Terminal}
              title={aiQuery ? `💻 生成脚本: "${aiQuery}"` : "💻 生成动态参数脚本 (Generate Script)..."}
              subtitle="生成 Bash/Python 脚本用于动态参数"
              actions={
                <ActionPanel>
                  {aiQuery && <Action title="Generate Script" onAction={() => handleAIGeneration('script')} icon={Icon.Terminal} />}
                  <Action.CopyToClipboard 
                    title="Copy Prompt Template" 
                    content={`You are an expert script writer (Bash/Python).\nThe user wants a script to dynamically generate options for a CLI tool parameter.\nThe script will receive the current project context path as the first argument ($1 in bash, sys.argv[1] in python).\nThe script must print to standard output (stdout).\nEach line represents one option.\nFormat: value|title (e.g., v1.0|Version 1.0) OR just value.\n\nUser Request: ${aiQuery}`} 
                    icon={Icon.Clipboard} 
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} 
                  />
                  <Action.Push 
                    title="Import External Script" 
                    target={<ImportScriptForm onImported={() => setCustomScripts(getCustomScripts())} />} 
                    icon={Icon.Download} 
                    shortcut={{ modifiers: ["cmd"], key: "i" }} 
                  />
                  <Action title="Verify Primary AI" onAction={() => handleVerifyAI(false)} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                  <Action title="Verify Fallback AI" onAction={() => handleVerifyAI(true)} icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd", "shift"], key: "t" }} />
                </ActionPanel>
              }
            />
          )}
        </List.Section>

        {activeTasks.length > 0 && !aiGeneratedTool && (
          <List.Section title={`⏳ 正在后台执行的 AI 任务 (超过 ${parseInt(getPreferenceValues<AIPreferences>().aiTaskTimeoutSeconds || "300", 10) / 60} 分钟自动删除)`}>
            {activeTasks.map((task, index) => {
              let title = task.query;
              if (task.mode === 'doc') {
                try {
                  const tool = JSON.parse(task.query);
                  title = `生成文档: ${tool.title || tool.cmd}`;
                } catch (e) {}
              }
              
              const isSuccessDoc = task.mode === 'doc' && task.status === 'success';

              return (
              <List.Item
                key={`active-${task.timestamp}-${index}`}
                icon={isSuccessDoc ? Icon.CheckCircle : Icon.Gear}
                title={title}
                subtitle={isSuccessDoc ? "文档生成成功，点击查看" : "AI 正在努力思考中..."}
                accessories={[{ icon: Icon.Stars, text: "AI Task" }, { text: task.mode === 'script' ? "Script" : (task.mode === 'web' ? "Web" : (task.mode === 'doc' ? "Doc" : "Command")) }]}
                actions={
                  <ActionPanel>
                    {isSuccessDoc ? (
                      <Action.Push
                        title="Review & Save Doc"
                        icon={Icon.Pencil}
                        target={<DocEditor tool={JSON.parse(task.query)} initialContent={task.result} onSaved={() => {
                          const bgData = readAiData();
                          delete bgData.tasks[task.id];
                          writeAiData(bgData);
                          syncAiData();
                          setTools(getTools());
                        }} onDeleted={() => setTools(getTools())} />}
                      />
                    ) : (
                      <Action 
                        title="Fill in Search Bar" 
                        icon={Icon.Pencil} 
                        onAction={() => {
                          setSearchText(`${aiPrefix} ${task.query}`);
                        }} 
                      />
                    )}
                    <Action 
                      title={isSuccessDoc ? "Remove Task" : "Cancel & Remove Task"} 
                      icon={Icon.Trash} 
                      onAction={() => {
                        const bgData = readAiData();
                        if (bgData.tasks && bgData.tasks[task.id]) {
                          delete bgData.tasks[task.id];
                          writeAiData(bgData);
                          syncAiData();
                          showToast({ title: "任务已删除", style: Toast.Style.Success });
                        }
                      }} 
                      shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                      style={Action.Style.Destructive}
                    />
                  </ActionPanel>
                }
              />
            )})}
          </List.Section>
        )}

        {isAIMode && (aiTargetMode === 'all' || aiTargetMode === 'script') && customScripts.length > 0 && (
          <List.Section title="📝 自定义脚本 (Custom Scripts)">
            {customScripts.map(script => (
              <List.Item
                key={script.path}
                icon={Icon.Code}
                title={script.title || script.name}
                subtitle={script.title ? script.name : ""}
                accessories={[{ text: script.language }]}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard title="Copy Script Name" content={script.name} />
                    <Action.Push
                      title="Edit Script"
                      icon={Icon.Pencil}
                      target={<ScriptEditor scriptPath={script.path} initialCode={script.code} onSaved={() => setCustomScripts(getCustomScripts())} />}
                    />
                    <Action.ShowInFinder title="Reveal in Finder" path={script.path} shortcut={{ modifiers: ["cmd"], key: "o" }} />
                    <Action
                      title="Delete Script"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleDeleteScript(script)}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        )}

        {isAIMode && (aiTargetMode === 'all' || aiTargetMode === 'script') && (
          <List.Section title="🔒 内置脚本 (Built-in Scripts - 不可修改)">
            <List.Item
              icon={Icon.Lock}
              title="查看内置脚本 (View Built-in Scripts)"
              subtitle="不可修改，按 Enter 复制名称"
              actions={
                <ActionPanel>
                  <Action.Push title="View Built-in Scripts" target={<BuiltInScriptsList />} icon={Icon.List} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}
        
        {isAIMode && (aiTargetMode === 'all' || aiTargetMode === 'command') && (
          <List.Section title="🔗 调用链组装器 (Pipeline Builder)">
            <List.Item
              icon={Icon.Link}
              title="创建命令调用链 (Create Pipeline)"
              subtitle="将多个现有命令组合成一个强大的调用链"
              actions={
                <ActionPanel>
                  <Action.Push title="Open Pipeline Builder" target={<PipelineBuilder onSaved={() => setTools(getTools())} />} icon={Icon.Link} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}
        
        {renderAiHistoryList(filteredHistory)}
      </>
    );
  } else if (listMode === "ai_history") {
    const filteredHistory = searchText.trim() ? aiQueryHistory.filter(item => item.query.toLowerCase().includes(searchText.toLowerCase())) : aiQueryHistory;
    listContent = (
      <>
        {renderActiveTasksList()}
        {renderAiHistoryList(filteredHistory)}
      </>
    );
  } else if (listMode === "all_smart" && activeCategory === "all" && !searchText.trim()) {
    const prefs = getPreferenceValues<AIPreferences>();
    const displayCount = parseInt(prefs.aiHistoryDisplayCount || "5", 10);
    
    const combined: any[] = [];
    const addedToolIds = new Set<string>();

    const contextTools = contextTags.length > 0 ? filteredTools.filter(t => {
      if (t.tags && t.tags.some(tag => contextTags.includes(tag.toLowerCase()))) return true;
      if (contextTags.includes(t.category?.toLowerCase() || "")) return true;
      return false;
    }).slice(0, 5) : [];

    contextTools.forEach(t => addedToolIds.add(t.id));

    for (const h of aiQueryHistory) {
      if (combined.length >= displayCount) break;
      combined.push({ isAi: true, data: h });
      if ((h.type === 'command' || h.type === 'web') && h.resultTool) {
        addedToolIds.add(h.resultTool.id);
      }
    }

    for (const t of filteredTools) {
      if (combined.length >= displayCount) break;
      if (!addedToolIds.has(t.id)) {
        combined.push({ isAi: false, data: t });
        addedToolIds.add(t.id);
      }
    }
    
    listContent = (
      <>
        {aiGeneratedTool && (
          <List.Section title="🌟 上次生成的 AI 命令 (可直接保存)">
            {renderTool(aiGeneratedTool, -1, 'generate')}
          </List.Section>
        )}
        
        {renderActiveTasksList()}

        {contextTools.length > 0 && (
          <List.Section title={`🎯 当前环境推荐 (${contextTags.join(', ')})`}>
            {contextTools.map((t, index) => renderTool(t, index, 'none'))}
          </List.Section>
        )}

        {combined.length > 0 && (
          <List.Section title={`🌟 最近使用与 AI 查询 (Top ${displayCount})`}>
            {combined.map((obj, index) => {
              if (!obj.isAi) {
                return renderTool(obj.data, index, 'none');
              } else {
                const item = obj.data as AIHistoryItem;
                if (item.type === 'command' && item.resultTool) {
                  // Render the result tool directly
                  return renderTool(item.resultTool, index, 'generate');
                } else if (item.type === 'web' && item.resultText) {
                  return (
                    <List.Item
                      key={`history-${item.timestamp}-${index}`}
                      icon={Icon.Globe}
                      title={item.query}
                      subtitle={new Date(item.timestamp).toLocaleString()}
                      accessories={[{ icon: Icon.Stars, text: "Web Search" }]}
                      actions={
                        <ActionPanel>
                          <Action.Push 
                            title="View Search Result" 
                            icon={Icon.Eye}
                            target={<WebSearchResultView query={item.query} content={item.resultText} />} 
                          />
                          <Action 
                            title="Fill in Search Bar" 
                            icon={Icon.Pencil} 
                            onAction={() => {
                              const prefix = item.type === 'web' ? "!" : "@";
                              setSearchText(`${prefix} ${item.query}`);
                            }} 
                          />
                          <Action 
                            title="Remove from History" 
                            icon={Icon.Trash} 
                            onAction={() => {
                              const bgData = readAiData();
                              if (bgData.history) {
                                bgData.history = bgData.history.filter((h: any) => h.timestamp !== item.timestamp);
                                writeAiData(bgData);
                              }
                              const newHist = aiQueryHistory.filter(h => h.timestamp !== item.timestamp);
                              setAiQueryHistory(newHist);
                              LocalStorage.setItem("ai_query_history", JSON.stringify(newHist));
                            }} 
                            shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                            style={Action.Style.Destructive}
                          />
                        </ActionPanel>
                      }
                    />
                  );
                } else {
                  // Render script item
                  return (
                    <List.Item
                      key={`history-${item.timestamp}-${index}`}
                      icon={Icon.Terminal}
                      title={item.query}
                      subtitle={new Date(item.timestamp).toLocaleString()}
                      accessories={[{ icon: Icon.Stars, text: "AI Script" }]}
                      actions={
                        <ActionPanel>
                          {item.resultScript && (
                            <Action.Push 
                              title="View Generated Script" 
                              icon={Icon.Eye}
                              target={<ScriptPreview script={item.resultScript} path={item.resultScript.path} prompt={item.query} />} 
                            />
                          )}
                          <Action 
                            title="Fill in Search Bar" 
                            icon={Icon.Pencil} 
                            onAction={() => {
                              const prefix = item.type === 'web' ? "!" : "@";
                              setSearchText(`${prefix} ${item.query}`);
                            }} 
                          />
                          <Action 
                            title="Remove from History" 
                            icon={Icon.Trash} 
                            onAction={() => {
                              const bgData = readAiData();
                              if (bgData.history) {
                                bgData.history = bgData.history.filter((h: any) => h.timestamp !== item.timestamp);
                                writeAiData(bgData);
                              }
                              const newHist = aiQueryHistory.filter(h => h.timestamp !== item.timestamp);
                              setAiQueryHistory(newHist);
                              LocalStorage.setItem("ai_query_history", JSON.stringify(newHist));
                            }} 
                            shortcut={{ modifiers: ["ctrl"], key: "x" }} 
                            style={Action.Style.Destructive}
                          />
                        </ActionPanel>
                      }
                    />
                  );
                }
              }
            })}
          </List.Section>
        )}

        <List.Section title="📁 所有大类 (回车进入搜索)">
          {categories.map((cat, index) => {
            const catToolsCount = tools.filter(t => (t.category || "other") === cat).length;
            return (
              <List.Item
                key={`cat-${cat}`}
                icon={Icon.Folder}
                title={formatCategory(cat)}
                subtitle={`${catToolsCount} 个命令`}
                actions={
                  <ActionPanel>
                    <Action 
                      title={`进入 ${formatCategory(cat)} 分类`} 
                      onAction={() => setActiveCategory(cat)} 
                      icon={Icon.ArrowRight} 
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      </>
    );
  } else {
    // 无论是搜索模式，还是进入了特定分类，都直接展示命令列表
    let sectionTitle = "本地匹配结果";
    if (!searchText.trim()) {
      if (listMode === "all_newest") sectionTitle = "最新添加 (Newest First)";
      else if (listMode === "frequent") sectionTitle = "最常使用 (Top 20)";
      else if (listMode === "mastered") sectionTitle = "已掌握的命令";
      else if (activeCategory !== "all") sectionTitle = formatCategory(activeCategory);
    }

    listContent = (
      <>
        {aiGeneratedTool && !isAIMode && (
          <List.Section title="🌟 上次生成的 AI 命令 (可直接保存)">
            {renderTool(aiGeneratedTool, -1, 'generate')}
          </List.Section>
        )}
        {activeWorkflows.length > 0 && !isAIMode && !searchText && (
          <List.Section title="▶️ 正在进行的调用链 (Active Workflows)">
            {activeWorkflows.map((t, index) => renderTool(t, index, 'none'))}
          </List.Section>
        )}
        {activeCategory !== "all" && !searchText.trim() && (
          <List.Item
            icon={Icon.ArrowLeft}
            title="返回所有大类"
            actions={
              <ActionPanel>
                <Action title="Back to All Categories" onAction={() => setActiveCategory("all")} icon={Icon.ArrowLeft} />
              </ActionPanel>
            }
          />
        )}
        {!isAIMode && filteredHistory.length > 0 && activeCategory === "all" && (
          <List.Section title={searchText ? "🕒 历史记录匹配 (History Matches)" : "🕒 最近执行 (Recent Commands)"}>
            {filteredHistory.map((cmd, idx) => (
              <List.Item
                key={`hist_${idx}`}
                icon={Icon.Clock}
                title={cmd}
                actions={
                  <ActionPanel>
                    <Action
                      title="Fill Search Bar (补全到搜索框)"
                      icon={Icon.Pencil}
                      onAction={() => setSearchText(cmd)}
                    />
                    <Action
                      title="Execute in Terminal"
                      icon={Icon.Terminal}
                      onAction={async () => {
                        await saveCommandHistory(cmd);
                        executeInGhostty(cmd);
                        closeMainWindow();
                      }}
                    />
                    <Action.Push
                      title="Execute Silently"
                      icon={Icon.Terminal}
                      target={<SilentExecutionView cmd={cmd} title="Silent Execution" />}
                      onPush={() => saveCommandHistory(cmd)}
                    />
                    <Action.CopyToClipboard 
                      title="Copy Command" 
                      content={cmd} 
                      onCopy={() => saveCommandHistory(cmd)}
                    />
                    <Action.Push
                      title="Save as Custom Alias"
                      icon={Icon.SaveDocument}
                      shortcut={{ modifiers: ["cmd"], key: "s" }}
                      target={<CreateAliasForm initialCmd={cmd} onSaved={() => setTools(getTools())} />}
                    />
                    <Action
                      title="Remove from History"
                      icon={Icon.Trash}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      style={Action.Style.Destructive}
                      onAction={async () => {
                        await removeCommandFromHistory(cmd);
                        getCommandHistory().then(setHistory);
                        showToast({ title: "Removed from history" });
                      }}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        )}
        {filteredTools.length > 0 && (
          <List.Section title={sectionTitle}>
            {filteredTools.map((tool, index) => renderTool(tool, index))}
          </List.Section>
        )}
        {aiQuery && (
          <List.Section title="没有找到想要的命令？">
            <List.Item
              icon={Icon.SaveDocument}
              title={`💾 将 "${aiQuery}" 保存为自定义别名`}
              subtitle="直接将输入的命令保存到本地配置"
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Save as Custom Alias"
                    icon={Icon.SaveDocument}
                    target={<CreateAliasForm initialCmd={aiQuery} onSaved={() => setTools(getTools())} />}
                  />
                </ActionPanel>
              }
            />
            <List.Item
              icon={Icon.Stars}
              title={`✨ 询问 AI: "${aiQuery}"`}
              subtitle="提示：输入 @ 直接进入专属 AI 模式"
              actions={
                <ActionPanel>
                  <Action title="Generate Command" onAction={() => handleAIGeneration('command')} icon={Icon.Wand} />
                  <Action title="Verify Primary AI" onAction={() => handleVerifyAI(false)} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                  <Action title="Verify Fallback AI" onAction={() => handleVerifyAI(true)} icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd", "shift"], key: "t" }} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}
      </>
    );
  }

  return (
    <List 
      isLoading={isGeneratingAI}
      searchBarPlaceholder="Search CLI tools (e.g. docker ps)..."
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      isShowingDetail={showDetail}
      searchBarAccessory={
        isAIMode ? (
          <List.Dropdown
            tooltip="AI 生成目标"
            value={aiTargetMode}
            onChange={setAiTargetMode}
          >
            <List.Dropdown.Item title="全部 (All)" value="all" icon={Icon.Stars} />
            <List.Dropdown.Item title="生成命令 (Command)" value="command" icon={Icon.Terminal} />
            <List.Dropdown.Item title="生成脚本 (Script)" value="script" icon={Icon.Code} />
          </List.Dropdown>
        ) : (
        <List.Dropdown
          tooltip="视图与过滤"
          value={listMode === "all_smart" && activeCategory !== "all" ? `cat_${activeCategory}` : listMode}
          onChange={(val) => {
            if (val.startsWith("cat_")) {
              setActiveCategory(val.replace("cat_", ""));
              setListMode("all_smart");
            } else {
              setListMode(val);
              setActiveCategory("all");
            }
          }}
        >
          <List.Dropdown.Section title="排序方式">
            <List.Dropdown.Item title="全部命令 (智能排序)" value="all_smart" icon={Icon.Stars} />
            <List.Dropdown.Item title="全部命令 (最新添加)" value="all_newest" icon={Icon.Clock} />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="视图筛选">
            <List.Dropdown.Item title="最常使用 (Top 20)" value="frequent" icon={Icon.StarCircle} />
            <List.Dropdown.Item title="已掌握的命令" value="mastered" icon={Icon.CheckCircle} />
            <List.Dropdown.Item title="AI 历史记录" value="ai_history" icon={Icon.List} />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="按大类过滤">
            {categories.map(cat => (
              <List.Dropdown.Item key={`cat_${cat}`} title={`📁 ${formatCategory(cat)}`} value={`cat_${cat}`} icon={Icon.Folder} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
        )
      }
    >
      {listContent}
    </List>
  );
}
