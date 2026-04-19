import { Form, ActionPanel, Action, showToast, Toast, useNavigation, getPreferenceValues } from "@raycast/api";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AIPreferences } from "../ai";

export function ImportScriptForm({ onImported }: { onImported: () => void }) {
  const { pop } = useNavigation();

  const handleSubmit = async (values: { files: string[] }) => {
    if (!values.files || values.files.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "请选择一个脚本文件" });
      return;
    }
    const sourcePath = values.files[0];
    try {
      const prefs = getPreferenceValues<AIPreferences>();
      const dirs = prefs.scriptsDir ? prefs.scriptsDir.split(',').map(p => {
          p = p.trim();
          if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
          return path.resolve(p);
      }).filter(p => p.length > 0) : [];
      
      if (dirs.length === 0) throw new Error("未配置 Scripts Directory");
      const targetDir = path.join(dirs[0], "dynamic");
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const fileName = path.basename(sourcePath);
      const targetPath = path.join(targetDir, fileName);
      
      fs.copyFileSync(sourcePath, targetPath);
      fs.chmodSync(targetPath, 0o755);
      
      await showToast({ style: Toast.Style.Success, title: "导入成功", message: targetPath });
      onImported();
      pop();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "导入失败", message: e.message });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import Script" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="选择一个本地的 Bash 或 Python 脚本文件，它将被复制到你的 Scripts Directory 中。" />
      <Form.FilePicker id="files" title="Select Script File" allowMultipleSelection={false} />
    </Form>
  );
}
