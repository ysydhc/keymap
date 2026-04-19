import { Form, ActionPanel, Action, showToast, Toast, Icon, useNavigation, getPreferenceValues } from "@raycast/api";
import { useState } from "react";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { AIPreferences, modifyScriptWithAI } from "../ai";

export function ScriptEditor({ 
  scriptPath, 
  initialCode, 
  isNew = false,
  onSaved 
}: { 
  scriptPath: string; 
  initialCode: string; 
  isNew?: boolean;
  onSaved?: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [aiPrompt, setAiPrompt] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [hasTested, setHasTested] = useState(false);
  const { pop } = useNavigation();

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setHasTested(false);
  };

  const handleTest = () => {
    setIsTesting(true);
    setTestOutput("Running test...");
    
    const tmpPath = path.join(os.tmpdir(), `test_script_${Date.now()}.sh`);
    fs.writeFileSync(tmpPath, code, 'utf-8');
    fs.chmodSync(tmpPath, 0o755);

    exec(`"${tmpPath}" "."`, (error, stdout, stderr) => {
      setIsTesting(false);
      setHasTested(true);
      let out = "";
      if (stdout) out += `[Stdout]\n${stdout}\n`;
      if (stderr) out += `[Stderr]\n${stderr}\n`;
      if (error) out += `[Error]\n${error.message}\n`;
      if (!out) out = "No output";
      setTestOutput(out);
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    });
  };

  const handleSave = async () => {
    if (!hasTested) {
      await showToast({ style: Toast.Style.Failure, title: "请先测试", message: "修改代码后必须先运行测试(Cmd+R)，确认无误后才能保存" });
      return;
    }
    try {
      fs.writeFileSync(scriptPath, code, 'utf-8');
      fs.chmodSync(scriptPath, 0o755);
      await showToast({ style: Toast.Style.Success, title: "保存成功" });
      if (onSaved) onSaved();
      pop();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
    }
  };

  const handleAiModify = async () => {
    if (!aiPrompt.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "请输入 AI 修改需求" });
      return;
    }
    setIsAiLoading(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在修改脚本..." });
    try {
      const newCode = await modifyScriptWithAI(code, aiPrompt);
      setCode(newCode);
      setHasTested(false);
      setAiPrompt("");
      toast.style = Toast.Style.Success;
      toast.title = "AI 修改完成，请测试后保存";
    } catch (e: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "AI 修改失败";
      toast.message = e.message;
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <Form
      isLoading={isTesting || isAiLoading}
      actions={
        <ActionPanel>
          {aiPrompt.trim() ? (
            <>
              <Action.SubmitForm title="Modify with AI (AI 修改)" onSubmit={handleAiModify} icon={Icon.Wand} />
              <Action title="Run Test (测试)" onAction={handleTest} icon={Icon.Play} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              <Action title="Save Script (保存)" onAction={handleSave} icon={Icon.SaveDocument} shortcut={{ modifiers: ["cmd"], key: "s" }} />
              <Action.CopyToClipboard title="Copy Script Name" content={path.basename(scriptPath)} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} />
              <Action.ShowInFinder title="Reveal in Finder" path={scriptPath} shortcut={{ modifiers: ["cmd"], key: "o" }} />
            </>
          ) : (
            <>
              <Action title="Run Test (测试)" onAction={handleTest} icon={Icon.Play} />
              <Action title="Save Script (保存)" onAction={handleSave} icon={Icon.SaveDocument} shortcut={{ modifiers: ["cmd"], key: "s" }} />
              <Action.CopyToClipboard title="Copy Script Name" content={path.basename(scriptPath)} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} />
              <Action.ShowInFinder title="Reveal in Finder" path={scriptPath} shortcut={{ modifiers: ["cmd"], key: "o" }} />
            </>
          )}
        </ActionPanel>
      }
    >
      <Form.Description text={`编辑脚本: ${path.basename(scriptPath)}`} />
      <Form.TextArea
        id="code"
        title="Script Code"
        value={code}
        onChange={handleCodeChange}
        enableMarkdown={false}
        info="脚本将接收当前项目路径作为第一个参数 ($1)。输出格式应为 value|title 或 value。"
      />
      <Form.Separator />
      <Form.TextField
        id="aiPrompt"
        title="✨ AI 辅助修改"
        placeholder="例如：增加对 xxx 的过滤 (填完后直接按 Enter)"
        value={aiPrompt}
        onChange={setAiPrompt}
      />
      {testOutput && (
        <>
          <Form.Separator />
          <Form.TextArea
            id="testOutput"
            title="🧪 测试输出"
            value={testOutput}
            onChange={() => {}}
          />
        </>
      )}
    </Form>
  );
}