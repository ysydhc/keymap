#!/bin/bash
# Alfred Run Script（接在「复制到剪贴板」之后）：将剪贴板内容粘贴到前台应用。
# 依赖： preceding 节点已把要选中的 arg 写入剪贴板。
sleep 0.05
osascript <<'APPLESCRIPT'
tell application "System Events"
  keystroke "v" using command down
end tell
APPLESCRIPT
