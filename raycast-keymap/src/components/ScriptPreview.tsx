import { ActionPanel, Action, Detail, Icon, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { useState } from "react";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AIPreferences } from "../ai";

export function ScriptPreview({ script, path: initialPath, prompt }: { script: {name: string, code: string, language: string}, path: string, prompt: string }) {
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [hasTested, setHasTested] = useState(false);
  
  // If the path contains tmpdir, it means it's a temporary test script and not saved to the final directory yet.
  const isTemp = initialPath.includes(os.tmpdir());
  const [savedPath, setSavedPath] = useState<string | null>(isTemp ? null : initialPath);

  const runTest = () => {
    setIsTesting(true);
    setTestOutput("Running...");
    
    exec(`"${initialPath}" "."`, (error, stdout, stderr) => {
      setIsTesting(false);
      setHasTested(true);
      let output = "";
      if (stdout) output += `**Stdout:**\n\`\`\`\n${stdout}\n\`\`\`\n\n`;
      if (stderr) output += `**Stderr:**\n\`\`\`\n${stderr}\n\`\`\`\n\n`;
      if (error) output += `**Error:**\n\`\`\`\n${error.message}\n\`\`\`\n\n`;
      if (!output) output = "*No output*";
      setTestOutput(output);
    });
  };

  const saveScript = async () => {
    if (!hasTested && isTemp) {
      await showToast({ style: Toast.Style.Failure, title: "请先测试", message: "保存前请先运行测试(Cmd+R)确认无误" });
      return;
    }
    try {
      const prefs = getPreferenceValues<AIPreferences>();
      const dirs = prefs.scriptsDir ? prefs.scriptsDir.split(',').map(p => {
          p = p.trim();
          if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
          return path.resolve(p);
      }).filter(p => p.length > 0) : [];
      
      if (dirs.length === 0) throw new Error("Scripts Directory is not configured");
      
      const targetDir = path.join(dirs[0], "dynamic");
      if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
      }
      
      const ext = script.language === 'python' ? '.py' : '.sh';
      const fileName = script.name.endsWith(ext) ? script.name : script.name + ext;
      const finalPath = path.join(targetDir, fileName);
      
      fs.writeFileSync(finalPath, script.code, 'utf-8');
      fs.chmodSync(finalPath, 0o755);
      
      setSavedPath(finalPath);
      await showToast({ style: Toast.Style.Success, title: "保存成功", message: finalPath });
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "保存失败", message: e.message });
    }
  };

  let markdown = `# 📝 Generated Script: ${script.name}\n\n**Prompt:** ${prompt}\n\n`;
  
  if (savedPath) {
    markdown += `**✅ Saved to:** \`${savedPath}\`\n\n`;
  } else {
    markdown += `**⚠️ 尚未保存:** 请先点击 "Run Test" 运行测试，确认无误后再保存。\n\n`;
  }

  markdown += `---\n\n\`\`\`${script.language}\n${script.code}\n\`\`\`\n\n`;

  if (testOutput) {
    markdown += `---\n\n## 🧪 Test Output\n\n${testOutput}`;
  }
  
  return (
    <Detail 
      markdown={markdown}
      isLoading={isTesting}
      actions={
        <ActionPanel>
          <Action title="Run Test (测试执行)" onAction={runTest} icon={Icon.Play} shortcut={{ modifiers: ["cmd"], key: "r" }} />
          {!savedPath && <Action title="Save Script (保存脚本)" onAction={saveScript} icon={Icon.SaveDocument} shortcut={{ modifiers: ["cmd"], key: "s" }} />}
          {savedPath && <Action.CopyToClipboard title="Copy Path" content={savedPath} icon={Icon.Clipboard} />}
          <Action.CopyToClipboard title="Copy Code" content={script.code} icon={Icon.Code} />
          {savedPath && <Action.ShowInFinder title="Reveal in Finder" path={savedPath} />}
        </ActionPanel>
      }
    />
  );
}
