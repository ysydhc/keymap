import { Form, ActionPanel, Action, showToast, Toast, Icon } from "@raycast/api";
import { useState } from "react";
import { Tool } from "../types";
import { modifyDocWithAI } from "../ai";
import { saveDocToLocal, deleteDocFromLocal } from "../utils";

export function DocEditor({ tool, initialContent, onSaved, onDeleted }: { tool: Tool, initialContent: string, onSaved: () => void, onDeleted: () => void }) {
  const [content, setContent] = useState(initialContent);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiModifying, setIsAiModifying] = useState(false);

  const handleAiModify = async () => {
    if (!aiPrompt) return;
    setIsAiModifying(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在修改文档..." });
    try {
      const newContent = await modifyDocWithAI(content, aiPrompt);
      setContent(newContent);
      setAiPrompt("");
      toast.style = Toast.Style.Success;
      toast.title = "修改成功";
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "修改失败";
      toast.message = error.message;
    } finally {
      setIsAiModifying(false);
    }
  };

  const handleSave = async () => {
    try {
      const path = saveDocToLocal(tool, content);
      await showToast({ style: Toast.Style.Success, title: "文档已保存", message: path });
      onSaved();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
    }
  };

  const handleDelete = async () => {
    try {
      deleteDocFromLocal(tool);
      await showToast({ style: Toast.Style.Success, title: "文档已删除" });
      onDeleted();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "删除失败", message: e.message });
    }
  };

  return (
    <Form
      isLoading={isAiModifying}
      actions={
        <ActionPanel>
          <Action title="Save Document (保存)" icon={Icon.SaveDocument} onAction={handleSave} shortcut={{ modifiers: ["cmd"], key: "s" }} />
          <Action title="Modify with AI (AI 修改)" icon={Icon.Stars} onAction={() => { if (aiPrompt) handleAiModify(); else handleSave(); }} />
          <Action title="Delete Document (删除)" icon={Icon.Trash} style={Action.Style.Destructive} onAction={handleDelete} shortcut={{ modifiers: ["ctrl"], key: "x" }} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="content"
        title="Markdown Content"
        value={content}
        onChange={setContent}
        enableMarkdown={true}
      />
      <Form.Separator />
      <Form.TextField
        id="aiPrompt"
        title="✨ AI Assist"
        placeholder="输入修改要求，按 Enter 让 AI 帮你修改文档内容..."
        value={aiPrompt}
        onChange={setAiPrompt}
      />
    </Form>
  );
}
