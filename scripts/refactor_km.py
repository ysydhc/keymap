import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

render_tool_func = """
  const renderTool = (tool: Tool, index: number) => {
    const needsWizard = hasParams(tool);
    const forceFormMode = tool.params && (tool.params.length > 1 || tool.params.some(p => p.type === "flags"));
    
    const keywords = [
      tool.cmd,
      tool.keyword || "",
      ...(tool.aliases || []),
      ...(tool.tags || [])
    ].filter(Boolean);

    const displayCmd = tool.mode !== "cli" ? (tool.mac || (tool.keys ? parseMacShortcut(tool.keys) : tool.cmd)) : tool.cmd;
    const subtitle = displayCmd;

    // 智能清理参数：将 {branch} 替换为空，方便直接粘贴到终端后继续输入
    const cleanCmd = tool.cmd.replace(/\\{[^}]+\\}/g, '');

    const accessories = [];
    
    if (tool.description) {
      accessories.push({ text: tool.description, tooltip: "Description" });
    } else if (tool.tags && tool.tags.length > 0) {
      accessories.push({ text: `[${tool.tags.join(", ")}]` });
    }

    if (needsWizard) {
      accessories.push({ text: "⇧↵", icon: Icon.List, tooltip: "需要填写参数" });
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
            markdown={`# ${tool.title}\\n\\n${tool.action}\\n\\n**Command / Keys:**\\n\\`\\`\\`bash\\n${tool.cmd}\\n\\`\\`\\`\\n\\n${tool.description ? `**Description:**\\n${tool.description}` : ''}`}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="Keys" text={tool.mac || tool.keys || "N/A"} />
                <List.Item.Detail.Metadata.TagList title="Tags">
                  {(tool.tags || []).map(t => <List.Item.Detail.Metadata.TagList.Item key={t} text={t} />)}
                </List.Item.Detail.Metadata.TagList>
                {tool.doc && <List.Item.Detail.Metadata.Link title="Doc" target={tool.doc} text="Open Documentation" />}
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <ActionPanel.Section title="Execute & Copy">
              <Action.CopyToClipboard title="Copy Command" content={needsWizard ? cleanCmd : tool.cmd} onCopy={() => recordUsage(tool.id)} />
              <Action.Paste title="Paste to Active App" content={needsWizard ? cleanCmd : tool.cmd} shortcut={{ modifiers: ["cmd"], key: "enter" }} onPaste={() => recordUsage(tool.id)} />
              
              {!needsWizard && (
                <Action 
                  title="Pure Output Copy (Opt+Enter)" 
                  onAction={() => {
                    recordUsage(tool.id);
                    const pureCmd = pureCopyCmd(tool.cmd);
                    const copyCmd = `${pureCmd} | tr -d '\\n' | pbcopy`;
                    executeInGhostty(copyCmd);
                  }} 
                  shortcut={{ modifiers: ["opt"], key: "enter" }} 
                  icon={Icon.Clipboard}
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
"""

list_content = """
  let listContent;
  if (!searchText.trim()) {
    const top5 = filteredTools.slice(0, 5);
    const rest = filteredTools.slice(5);
    const grouped = rest.reduce((acc, tool) => {
      const cat = tool.category || "other";
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
  );
"""

# Replace the return block
start_idx = content.find("  return (\n    <List")
if start_idx != -1:
    new_content = content[:start_idx] + render_tool_func + list_content + "}\n"
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Refactored km.tsx successfully")
else:
    print("Could not find return block")
