import { Form, ActionPanel, Action, showToast, Toast, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import { parseRawCommandWithAI } from "../ai";
import EditToolForm from "./EditToolForm";
import { getTools, saveToolToLocal } from "../utils";

export function ImportRawCommandForm({ onImported }: { onImported: () => void }) {
  const { push, pop } = useNavigation();
  const [rawCmd, setRawCmd] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async () => {
    if (!rawCmd.trim()) {
      showToast({ style: Toast.Style.Failure, title: "请输入原始命令" });
      return;
    }
    
    setIsParsing(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在解析命令..." });
    
    try {
      const generatedTool = await parseRawCommandWithAI(rawCmd);
      toast.style = Toast.Style.Success;
      toast.title = "解析成功！请确认配置";
      
      push(
        <EditToolForm
          tool={generatedTool}
          onSave={async (updatedTool, explicitCategory) => {
            try {
              const result = saveToolToLocal(updatedTool, explicitCategory);
              await showToast({ style: Toast.Style.Success, title: `已保存到 ${result.category}.json` });
              onImported();
              pop(); // Pop EditToolForm
              pop(); // Pop ImportRawCommandForm
            } catch (e: any) {
              await showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
            }
          }}
        />
      );
    } catch (e: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "解析失败";
      toast.message = e.message;
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <Form
      isLoading={isParsing}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Parse Command with AI" icon={Icon.Wand} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴一段复杂的原始命令（如从 StackOverflow 复制的单行脚本），AI 会自动帮你提取变量并生成 Keymap 配置。" />
      <Form.TextArea
        id="rawCmd"
        title="Raw Command"
        placeholder="例如: find . -type f -name '*.log' -exec rm -f {} +"
        value={rawCmd}
        onChange={setRawCmd}
        enableMarkdown={false}
      />
    </Form>
  );
}
