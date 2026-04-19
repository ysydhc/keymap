import { Form, ActionPanel, Action, showToast, Toast, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import fs from "fs";
import { parseRawCommandWithAI } from "../ai";
import EditToolForm from "./EditToolForm";
import { getTools, saveToolToLocal } from "../utils";

export function ImportLocalScriptForm({ onImported }: { onImported: () => void }) {
  const { push, pop } = useNavigation();
  const [files, setFiles] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async () => {
    if (files.length === 0) {
      showToast({ style: Toast.Style.Failure, title: "请选择一个脚本文件" });
      return;
    }
    
    const filePath = files[0];
    if (!fs.existsSync(filePath)) {
      showToast({ style: Toast.Style.Failure, title: "文件不存在" });
      return;
    }

    setIsParsing(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在分析脚本..." });
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const prompt = `This is a local script located at: ${filePath}\n\nContent:\n${content}\n\nPlease generate a Keymap Tool JSON to execute this script. The 'cmd' should be something like 'bash ${filePath} {args}' or just '${filePath} {args}' if it has a shebang. Identify any required arguments from the script logic and create 'params' for them.`;
      
      const generatedTool = await parseRawCommandWithAI(prompt);
      toast.style = Toast.Style.Success;
      toast.title = "分析成功！请确认配置";
      
      push(
        <EditToolForm
          tool={generatedTool}
          onSave={async (updatedTool, explicitCategory) => {
            try {
              const result = saveToolToLocal(updatedTool, explicitCategory);
              await showToast({ style: Toast.Style.Success, title: `已保存到 ${result.category}.json` });
              onImported();
              pop(); // Pop EditToolForm
              pop(); // Pop ImportLocalScriptForm
            } catch (e: any) {
              await showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
            }
          }}
        />
      );
    } catch (e: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "分析失败";
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
          <Action.SubmitForm title="Analyze Script with AI" icon={Icon.Wand} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="选择一个本地脚本文件 (如 .sh, .py, .js)，AI 会自动分析它的参数并生成一个 Keymap 命令配置。" />
      <Form.FilePicker
        id="files"
        title="选择脚本文件"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        value={files}
        onChange={setFiles}
      />
    </Form>
  );
}
