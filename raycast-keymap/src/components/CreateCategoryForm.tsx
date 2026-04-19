import { Form, ActionPanel, Action, showToast, Toast, Icon, useNavigation, getPreferenceValues } from "@raycast/api";
import { useState, useEffect } from "react";
import * as fs from "fs";
import * as path from "path";
import { getDirPaths } from "../utils";

export function CreateCategoryForm({ onCreated }: { onCreated: () => void }) {
  const { pop } = useNavigation();
  const [categoryName, setCategoryName] = useState("");

  const handleSubmit = async () => {
    if (!categoryName.trim()) {
      showToast({ style: Toast.Style.Failure, title: "分类名称不能为空" });
      return;
    }

    const cleanName = categoryName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefs = getPreferenceValues<{ toolsDir: string }>();
    const dirs = getDirPaths(prefs.toolsDir);
    if (dirs.length === 0) {
      showToast({ style: Toast.Style.Failure, title: "未配置 Tools Directory" });
      return;
    }

    const targetDir = dirs[0];
    const filePath = path.join(targetDir, `${cleanName}.json`);

    if (fs.existsSync(filePath)) {
      showToast({ style: Toast.Style.Failure, title: "该分类已存在" });
      return;
    }

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify({ tools: [] }, null, 2), "utf-8");
      showToast({ style: Toast.Style.Success, title: `分类 ${cleanName} 创建成功` });
      onCreated();
      pop();
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "创建失败", message: e.message });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Category" icon={Icon.Plus} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="categoryName"
        title="分类名称 (Category Name)"
        placeholder="例如: my_tools (不需要写 .json)"
        value={categoryName}
        onChange={setCategoryName}
      />
    </Form>
  );
}
