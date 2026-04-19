import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
imports_old = """import { getTools, pureCopyCmd } from "./utils";"""
imports_new = """import { getTools, pureCopyCmd, saveToolToLocal, restoreBackup } from "./utils";
import { generateCommandFromAI } from "./ai";"""
content = content.replace(imports_old, imports_new)

# 2. State
state_old = """  const [searchText, setSearchText] = useState(props.arguments.query || "");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [frecency, setFrecency] = useState<Record<string, number>>({});
  const [showDetail, setShowDetail] = useState(false);"""
state_new = """  const [searchText, setSearchText] = useState(props.arguments.query || "");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [frecency, setFrecency] = useState<Record<string, number>>({});
  const [showDetail, setShowDetail] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedTool, setAIGeneratedTool] = useState<Tool | null>(null);"""
content = content.replace(state_old, state_new)

# 3. Handle AI generation
ai_handler = """
  const handleAIGeneration = async () => {
    if (!searchText.trim()) return;
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在生成命令..." });
    try {
      const tool = await generateCommandFromAI(searchText);
      setAIGeneratedTool(tool);
      toast.style = Toast.Style.Success;
      toast.title = "生成成功！";
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "生成失败";
      toast.message = error.message;
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveToLocal = async (tool: Tool) => {
    try {
      saveToolToLocal(tool, "custom");
      await showToast({ style: Toast.Style.Success, title: "已保存到 custom.json" });
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
"""

# Insert handler before renderTool
content = content.replace('  const renderTool = (tool: Tool, index: number) => {', ai_handler + '\n  const renderTool = (tool: Tool, index: number, isAI: boolean = false) => {')

# Update renderTool to handle isAI
render_tool_old = """    return (
      <List.Item
        key={`${tool.id}-${index}`}"""
render_tool_new = """    return (
      <List.Item
        key={`${tool.id}-${index}`}"""
content = content.replace(render_tool_old, render_tool_new)

# Add AI Save Action
action_panel_old = """            <ActionPanel.Section title="Execute & Copy">"""
action_panel_new = """            <ActionPanel.Section title="Execute & Copy">
              {isAI && (
                <Action 
                  title="Save to Local Config (custom.json)" 
                  icon={Icon.SaveDocument} 
                  shortcut={{ modifiers: ["cmd"], key: "s" }} 
                  onAction={() => handleSaveToLocal(tool)} 
                />
              )}"""
content = content.replace(action_panel_old, action_panel_new)

# Update listContent logic
list_content_old = """  } else {
    // 无论是搜索模式，还是进入了特定分类，都直接展示命令列表
    listContent = filteredTools.map((tool, index) => renderTool(tool, index));
  }"""
list_content_new = """  } else {
    // 无论是搜索模式，还是进入了特定分类，都直接展示命令列表
    listContent = (
      <>
        {aiGeneratedTool && (
          <List.Section title="✨ AI 生成的命令 (按 Cmd+S 保存)">
            {renderTool(aiGeneratedTool, -1, true)}
          </List.Section>
        )}
        {filteredTools.length > 0 && (
          <List.Section title="本地匹配结果">
            {filteredTools.map((tool, index) => renderTool(tool, index))}
          </List.Section>
        )}
        {searchText.trim() && (
          <List.Section title="没有找到想要的命令？">
            <List.Item
              icon={Icon.Stars}
              title={`✨ 询问 AI: "${searchText}"`}
              subtitle="通过自然语言生成命令并保存到本地"
              actions={
                <ActionPanel>
                  <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}
      </>
    );
  }"""
content = content.replace(list_content_old, list_content_new)

# Add isLoading to List
list_old = """    <List 
      searchBarPlaceholder="Search CLI tools (e.g. docker ps)..."
      searchText={searchText}"""
list_new = """    <List 
      isLoading={isGeneratingAI}
      searchBarPlaceholder="Search CLI tools (e.g. docker ps)..."
      searchText={searchText}"""
content = content.replace(list_old, list_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated km.tsx with AI logic")
