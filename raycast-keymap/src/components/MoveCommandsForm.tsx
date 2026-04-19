import { List, ActionPanel, Action, showToast, Toast, Icon, useNavigation } from "@raycast/api";
import { useState, useEffect } from "react";
import { Tool } from "../types";
import { getTools, updateToolInLocal, getAllCategories } from "../utils";

export function MoveCommandsForm({ onMoved }: { onMoved: () => void }) {
  const { pop } = useNavigation();
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [targetCategory, setTargetCategory] = useState<string>("");

  useEffect(() => {
    const allTools = getTools();
    setTools(allTools.filter(t => t.category === "custom"));
    
    const cats = getAllCategories();
    setCategories(cats);
    if (cats.length > 0) {
      setTargetCategory(cats[0]);
    }
  }, []);

  const handleMove = async () => {
    if (selectedTools.length === 0) {
      showToast({ style: Toast.Style.Failure, title: "请至少选择一个命令" });
      return;
    }
    if (!targetCategory) {
      showToast({ style: Toast.Style.Failure, title: "请选择目标分类" });
      return;
    }

    try {
      const toolsToMove = tools.filter(t => selectedTools.includes(t.id));
      for (const tool of toolsToMove) {
        updateToolInLocal(tool, targetCategory);
      }
      showToast({ style: Toast.Style.Success, title: `成功移动 ${toolsToMove.length} 个命令到 ${targetCategory}` });
      onMoved();
      pop();
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "移动失败", message: e.message });
    }
  };

  return (
    <List
      searchBarPlaceholder="搜索 custom.json 中的命令..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="目标分类"
          value={targetCategory}
          onChange={setTargetCategory}
        >
          {categories.map(c => (
            <List.Dropdown.Item key={c} value={c} title={`移动到: ${c}.json`} />
          ))}
        </List.Dropdown>
      }
    >
      <List.Section title={`从 custom.json 移动命令到 ${targetCategory}.json`}>
        {tools.map(tool => {
          const isSelected = selectedTools.includes(tool.id);
          return (
            <List.Item
              key={tool.id}
              title={tool.title}
              subtitle={tool.cmd}
              icon={isSelected ? Icon.CheckCircle : Icon.Circle}
              actions={
                <ActionPanel>
                  <Action
                    title={isSelected ? "取消选中" : "选中"}
                    icon={isSelected ? Icon.XMarkCircle : Icon.CheckCircle}
                    onAction={() => {
                      if (isSelected) {
                        setSelectedTools(selectedTools.filter(id => id !== tool.id));
                      } else {
                        setSelectedTools([...selectedTools, tool.id]);
                      }
                    }}
                  />
                  {selectedTools.length > 0 && (
                    <Action
                      title={`移动选中的 ${selectedTools.length} 个命令`}
                      icon={Icon.ArrowRight}
                      shortcut={{ modifiers: ["cmd"], key: "enter" }}
                      onAction={handleMove}
                    />
                  )}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
