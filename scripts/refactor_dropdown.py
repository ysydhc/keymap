import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add activeCategory state
state_replace = """  const [searchText, setSearchText] = useState(props.arguments.query || "");
  const [activeCategory, setActiveCategory] = useState<string>("all");"""
content = content.replace('  const [searchText, setSearchText] = useState(props.arguments.query || "");', state_replace)

# Add formatCategory and categories useMemo
cat_logic = """  const formatCategory = (cat: string) => {
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

  // 自定义逐级过滤与评分逻辑 (复刻 Alfred Python 脚本)"""
content = content.replace('  // 自定义逐级过滤与评分逻辑 (复刻 Alfred Python 脚本)', cat_logic)

# Update filteredTools to use activeCategory
filtered_logic_old = """  const filteredTools = useMemo(() => {
    if (!searchText.trim()) {"""
filtered_logic_new = """  const filteredTools = useMemo(() => {
    let result = tools;
    if (activeCategory !== "all") {
      result = result.filter(t => (t.category || "other") === activeCategory);
    }

    if (!searchText.trim()) {
      return [...result].sort((a, b) => {
        const scoreA = (frecency[a.id] || 0) * 100 + (a.weight || 0);
        const scoreB = (frecency[b.id] || 0) * 100 + (b.weight || 0);
        return scoreB - scoreA;
      });
    }

    const query = searchText.toLowerCase();
    const terms = query.split(/\\s+/).filter(Boolean);

    const scored = result.map(tool => {"""
# We need to be careful with replace here
content = content.replace("""  const filteredTools = useMemo(() => {
    if (!searchText.trim()) {
      return [...tools].sort((a, b) => {
        const scoreA = (frecency[a.id] || 0) * 100 + (a.weight || 0);
        const scoreB = (frecency[b.id] || 0) * 100 + (b.weight || 0);
        return scoreB - scoreA;
      });
    }

    const query = searchText.toLowerCase();
    const terms = query.split(/\\s+/).filter(Boolean);

    const scored = tools.map(tool => {""", filtered_logic_new)

# Update the dependency array
content = content.replace('  }, [tools, searchText, frecency]);', '  }, [tools, searchText, frecency, activeCategory]);')

# Update listContent and List component
list_content_old = """  let listContent;
  if (!searchText.trim()) {
    const top5 = filteredTools.slice(0, 5);
    const rest = filteredTools.slice(5);
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

    const grouped = rest.reduce((acc, tool) => {
      const cat = formatCategory(tool.category || "other");
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tool);
      return acc;
    }, {} as Record<string, Tool[]>);

    listContent = (
      <>
        {top5.length > 0 && (
          <List.Section title="🌟 常用命令 (Top 5)">
            {top5.map((tool, index) => renderTool(tool, index))}
          </List.Section>
        )}
        {Object.entries(grouped).map(([category, categoryTools]) => (
          <List.Section key={category} title={`📁 ${category}`}>
            {categoryTools.map((tool, index) => renderTool(tool, index + 5))}
          </List.Section>
        ))}
      </>
    );
  } else {
    listContent = filteredTools.map((tool, index) => renderTool(tool, index));
  }

  return (
    <List 
      searchBarPlaceholder="Search CLI tools (e.g. docker ps)..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isShowingDetail={showDetail}
    >
      {listContent}
    </List>
  );"""

list_content_new = """  let listContent;
  
  if (activeCategory === "all" && !searchText.trim()) {
    const top5 = filteredTools.slice(0, 5);
    
    listContent = (
      <>
        {top5.length > 0 && (
          <List.Section title="🌟 最近使用 (Top 5)">
            {top5.map((tool, index) => renderTool(tool, index))}
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
    listContent = filteredTools.map((tool, index) => renderTool(tool, index));
  }

  return (
    <List 
      searchBarPlaceholder="Search CLI tools (e.g. docker ps)..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isShowingDetail={showDetail}
      searchBarAccessory={
        <List.Dropdown
          tooltip="筛选大类"
          value={activeCategory}
          onChange={setActiveCategory}
        >
          <List.Dropdown.Item title="所有大类" value="all" />
          <List.Dropdown.Section title="具体大类">
            {categories.map(c => (
              <List.Dropdown.Item key={c} title={formatCategory(c)} value={c} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {listContent}
    </List>
  );"""

content = content.replace(list_content_old, list_content_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated dropdown logic")
