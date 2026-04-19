import { List, ActionPanel, Action, showToast, Toast, Icon, useNavigation } from "@raycast/api";
import { useState, useEffect } from "react";
import { Tool } from "../types";
import { getTools, updateToolInLocal } from "../utils";

export interface OrganizeSuggestion {
  toolId: string;
  toolTitle: string;
  toolCmd: string;
  oldCategory: string;
  newCategory: string;
  reason: string;
}

export function AiOrganizePreview({ suggestions, onApplied }: { suggestions: OrganizeSuggestion[], onApplied: () => void }) {
  const { pop } = useNavigation();
  const [selectedIds, setSelectedIds] = useState<string[]>(suggestions.map(s => s.toolId));

  const handleApply = async () => {
    if (selectedIds.length === 0) {
      showToast({ style: Toast.Style.Failure, title: "请至少选择一个建议" });
      return;
    }

    try {
      const allTools = getTools();
      const toApply = suggestions.filter(s => selectedIds.includes(s.toolId));
      
      for (const suggestion of toApply) {
        const tool = allTools.find(t => t.id === suggestion.toolId);
        if (tool) {
          updateToolInLocal(tool, suggestion.newCategory);
        }
      }
      
      showToast({ style: Toast.Style.Success, title: `成功应用 ${toApply.length} 个分类整理` });
      onApplied();
      pop();
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "应用失败", message: e.message });
    }
  };

  return (
    <List searchBarPlaceholder="搜索整理建议...">
      <List.Section title={`AI 整理建议 (选中 ${selectedIds.length} 个)`}>
        {suggestions.map(suggestion => {
          const isSelected = selectedIds.includes(suggestion.toolId);
          return (
            <List.Item
              key={suggestion.toolId}
              title={suggestion.toolTitle}
              subtitle={`${suggestion.oldCategory}.json ➡️ ${suggestion.newCategory}.json`}
              accessories={[{ text: suggestion.reason }]}
              icon={isSelected ? Icon.CheckCircle : Icon.Circle}
              actions={
                <ActionPanel>
                  <Action
                    title={isSelected ? "取消选中" : "选中"}
                    icon={isSelected ? Icon.XMarkCircle : Icon.CheckCircle}
                    onAction={() => {
                      if (isSelected) {
                        setSelectedIds(selectedIds.filter(id => id !== suggestion.toolId));
                      } else {
                        setSelectedIds([...selectedIds, suggestion.toolId]);
                      }
                    }}
                  />
                  {selectedIds.length > 0 && (
                    <Action
                      title={`应用选中的 ${selectedIds.length} 个建议`}
                      icon={Icon.ArrowRight}
                      shortcut={{ modifiers: ["cmd"], key: "enter" }}
                      onAction={handleApply}
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
