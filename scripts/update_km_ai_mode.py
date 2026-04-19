import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state variables
state_old = """  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedTool, setAIGeneratedTool] = useState<Tool | null>(null);"""
state_new = """  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedTool, setAIGeneratedTool] = useState<Tool | null>(null);

  const isAIMode = searchText.startsWith("@");
  const aiQuery = isAIMode ? searchText.substring(1).trim() : searchText.trim();"""
content = content.replace(state_old, state_new)

# 2. Update handleAIGeneration
ai_gen_old = """  const handleAIGeneration = async () => {
    if (!searchText.trim()) return;
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在生成命令..." });
    try {
      const tool = await generateCommandFromAI(searchText);"""
ai_gen_new = """  const handleAIGeneration = async () => {
    if (!aiQuery) return;
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在生成命令..." });
    try {
      const tool = await generateCommandFromAI(aiQuery);"""
content = content.replace(ai_gen_old, ai_gen_new)

# 3. Update listContent rendering
list_content_old = """  let listContent;
  
  if (activeCategory === "all" && !searchText.trim()) {"""
list_content_new = """  let listContent;
  
  if (isAIMode) {
    listContent = (
      <>
        {aiGeneratedTool && (
          <List.Section title="✨ AI 生成的命令 (按 Cmd+S 保存)">
            {renderTool(aiGeneratedTool, -1, true)}
          </List.Section>
        )}
        <List.Section title="AI 命令生成模式">
          <List.Item
            icon={Icon.Stars}
            title={aiQuery ? `✨ 让 AI 生成: "${aiQuery}"` : "✨ 请输入你想让 AI 生成的命令描述..."}
            subtitle="通过自然语言生成命令并保存到本地"
            actions={
              <ActionPanel>
                {aiQuery && <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />}
                <Action title="Verify AI Configuration" onAction={handleVerifyAI} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
              </ActionPanel>
            }
          />
        </List.Section>
      </>
    );
  } else if (activeCategory === "all" && !searchText.trim()) {"""
content = content.replace(list_content_old, list_content_new)

# 4. Update the fallback AI option in the normal search list
fallback_ai_old = """        {searchText.trim() && (
          <List.Section title="没有找到想要的命令？">
            <List.Item
              icon={Icon.Stars}
              title={`✨ 询问 AI: "${searchText}"`}
              subtitle="通过自然语言生成命令并保存到本地"
              actions={
                <ActionPanel>
                  <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />
                  <Action title="Verify AI Configuration" onAction={handleVerifyAI} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}"""
fallback_ai_new = """        {aiQuery && (
          <List.Section title="没有找到想要的命令？">
            <List.Item
              icon={Icon.Stars}
              title={`✨ 询问 AI: "${aiQuery}"`}
              subtitle="提示：输入 @ 直接进入专属 AI 模式"
              actions={
                <ActionPanel>
                  <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />
                  <Action title="Verify AI Configuration" onAction={handleVerifyAI} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
                </ActionPanel>
              }
            />
          </List.Section>
        )}"""
content = content.replace(fallback_ai_old, fallback_ai_new)

# 5. Update filteredTools logic to not show results if in AI mode
filtered_tools_old = """  const filteredTools = useMemo(() => {
    let result = tools;
    if (activeCategory !== "all") {
      result = result.filter(t => (t.category || "other") === activeCategory);
    }

    if (!searchText.trim()) {"""
filtered_tools_new = """  const filteredTools = useMemo(() => {
    if (isAIMode) return []; // AI 模式下不展示本地搜索结果
    
    let result = tools;
    if (activeCategory !== "all") {
      result = result.filter(t => (t.category || "other") === activeCategory);
    }

    if (!searchText.trim()) {"""
content = content.replace(filtered_tools_old, filtered_tools_new)

# Update dependency array for filteredTools
content = content.replace('  }, [tools, searchText, frecency, activeCategory]);', '  }, [tools, searchText, frecency, activeCategory, isAIMode]);')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated km.tsx with @ AI mode")
