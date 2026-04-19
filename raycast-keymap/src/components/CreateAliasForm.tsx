import { Form, ActionPanel, Action, useNavigation, showToast, Toast, Icon } from "@raycast/api";
import { useState, useEffect } from "react";
import { Tool, Param, WorkflowStep } from "../types";
import { saveToolToLocal, updateToolInLocal, getAllCategories, predictCategory } from "../utils";

interface CreateAliasFormProps {
  initialCmd: string;
  initialParams?: Param[];
  isWorkflow?: boolean;
  workflowSteps?: WorkflowStep[];
  existingTool?: Tool;
  onSaved: () => void;
}

export function CreateAliasForm({ initialCmd, initialParams, isWorkflow, workflowSteps, existingTool, onSaved }: CreateAliasFormProps) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState(existingTool?.title || "");
  const [cmd, setCmd] = useState(existingTool?.cmd || initialCmd);
  const [keyword, setKeyword] = useState(existingTool?.keyword || "");
  const [mode, setMode] = useState(existingTool?.mode || "cli");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(existingTool?.category || "custom");

  useEffect(() => {
    const cats = getAllCategories();
    setCategories(cats);
    if (!existingTool) {
      const mockTool = { id: "temp", title: "", action: "", cmd: initialCmd, weight: 10 };
      setSelectedCategory(predictCategory(mockTool));
    }
  }, [initialCmd, existingTool]);

  const handleSubmit = async () => {
    if (!title.trim() || !cmd.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Title and Command are required" });
      return;
    }

    const newTool: Tool = {
      id: existingTool ? existingTool.id : `alias-${Date.now()}`,
      title: title.trim(),
      action: isWorkflow ? "Custom workflow pipeline" : "Custom alias command",
      cmd: cmd.trim(),
      mode: isWorkflow ? "workflow" : (mode as "cli" | "silent" | "workflow"),
      keyword: keyword.trim() || undefined,
      weight: existingTool?.weight || 10,
      tags: existingTool?.tags || ["alias", "custom", ...(isWorkflow ? ["workflow"] : [])],
      params: initialParams && initialParams.length > 0 ? initialParams : undefined,
      steps: isWorkflow ? workflowSteps : undefined
    };

    try {
      if (existingTool) {
        updateToolInLocal(newTool, selectedCategory);
      } else {
        saveToolToLocal(newTool, selectedCategory);
      }
      await showToast({ style: Toast.Style.Success, title: "Alias Saved", message: `Saved to ${selectedCategory}.json` });
      onSaved();
      pop();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to save", message: e.message });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Alias" icon={Icon.SaveDocument} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Save a fixed command as an alias for quick access." />
      <Form.TextField
        id="title"
        title="Title (Name)"
        placeholder="e.g. hermes -daily"
        value={title}
        onChange={setTitle}
        autoFocus
      />
      <Form.TextArea
        id="cmd"
        title="Command"
        placeholder="e.g. hermes --resume 20260416_165427_c1ff56"
        value={cmd}
        onChange={setCmd}
      />
      <Form.TextField
        id="keyword"
        title="Keyword (Optional)"
        placeholder="e.g. hermes, daily"
        value={keyword}
        onChange={setKeyword}
      />
      {!isWorkflow && (
        <Form.Dropdown id="mode" title="Execution Mode" value={mode} onChange={setMode}>
          <Form.Dropdown.Item value="cli" title="Terminal (CLI)" icon={Icon.Terminal} />
          <Form.Dropdown.Item value="silent" title="Silent (Background)" icon={Icon.EyeDisabled} />
        </Form.Dropdown>
      )}
      <Form.Dropdown id="category" title="Category (File)" value={selectedCategory} onChange={setSelectedCategory}>
        {categories.map(cat => (
          <Form.Dropdown.Item key={cat} value={cat} title={`${cat}.json`} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
