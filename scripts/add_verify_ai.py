import re

file_path = '/Users/yeshouyou/Work/agent/MyGuguGaga/key_map/raycast-keymap/src/km.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add verify AI function
verify_func = """
  const handleVerifyAI = async () => {
    setIsGeneratingAI(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "正在连接 AI 服务..." });
    try {
      // Just a simple ping to the AI
      await generateCommandFromAI("测试连接，请只回复'ok'");
      toast.style = Toast.Style.Success;
      toast.title = "AI 配置正确，连接成功！";
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "AI 连接失败";
      toast.message = error.message;
    } finally {
      setIsGeneratingAI(false);
    }
  };
"""

# Insert before handleAIGeneration
content = content.replace("  const handleAIGeneration = async () => {", verify_func + "\n  const handleAIGeneration = async () => {")

# Add Action in the UI
action_old = """                  <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />"""
action_new = """                  <Action title="Generate Command" onAction={handleAIGeneration} icon={Icon.Wand} />
                  <Action title="Verify AI Configuration" onAction={handleVerifyAI} icon={Icon.CheckCircle} shortcut={{ modifiers: ["cmd"], key: "t" }} />
                  <Action title="Restore Previous Backup" onAction={handleRestoreBackup} icon={Icon.ArrowCounterClockwise} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />"""
content = content.replace(action_old, action_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added handleVerifyAI")
