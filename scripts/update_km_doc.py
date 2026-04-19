import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
imports_old = """import { generateCommandFromAI } from "./ai";"""
imports_new = """import { generateCommandFromAI, generateDocFromAI } from "./ai";
import DocPreview from "./components/DocPreview";
import { useNavigation } from "@raycast/api";"""
content = content.replace(imports_old, imports_new)

# 2. Add useNavigation to Command
cmd_old = """export default function Command(props: LaunchProps<{ arguments: CommandArguments }>) {
  const [tools, setTools] = useState<Tool[]>([]);"""
cmd_new = """export default function Command(props: LaunchProps<{ arguments: CommandArguments }>) {
  const { push } = useNavigation();
  const [tools, setTools] = useState<Tool[]>([]);"""
content = content.replace(cmd_old, cmd_new)

# 3. Add handleGenerateDoc
doc_handler = """
  const handleGenerateDoc = async (tool: Tool) => {
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "AI 正在撰写文档..." });
    try {
      const docContent = await generateDocFromAI(tool);
      toast.style = Toast.Style.Success;
      toast.title = "文档生成成功！";
      push(<DocPreview tool={tool} initialContent={docContent} />);
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "文档生成失败";
      toast.message = error.message;
    } finally {
      setIsGeneratingAI(false);
    }
  };
"""
content = content.replace("  const handleAIGeneration = async () => {", doc_handler + "\n  const handleAIGeneration = async () => {")

# 4. Add Action in ActionPanel
action_panel_old = """            <ActionPanel.Section title="Parameters">"""
action_panel_new = """            <ActionPanel.Section title="Learning & Docs">
              <Action 
                title="Generate AI Guide (生成文档)" 
                icon={Icon.Book} 
                shortcut={{ modifiers: ["cmd", "shift"], key: "g" }} 
                onAction={() => handleGenerateDoc(tool)} 
              />
            </ActionPanel.Section>

            <ActionPanel.Section title="Parameters">"""
content = content.replace(action_panel_old, action_panel_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated km.tsx with AI Doc Generation")
