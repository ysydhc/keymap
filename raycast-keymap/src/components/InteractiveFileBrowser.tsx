import { List, ActionPanel, Action, Icon, useNavigation, showToast, Toast, getPreferenceValues, LocalStorage } from "@raycast/api";
import { useState, useEffect, useMemo } from "react";
import fs from "fs";
import path from "path";
import os from "os";
import { getActiveAppPath } from "../utils";

interface InteractiveFileBrowserProps {
  title: string;
  allowMultiple: boolean;
  onSelect: (paths: string[]) => void;
  previewCommand?: (currentSelection: string) => string;
}

export function InteractiveFileBrowser({ title, allowMultiple, onSelect, previewCommand }: InteractiveFileBrowserProps) {
  const { pop } = useNavigation();
  const [currentPath, setCurrentPath] = useState<string>(os.homedir());
  const [initialPath, setInitialPath] = useState<string>(os.homedir());
  const [files, setFiles] = useState<{name: string, isDir: boolean, path: string}[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState(os.homedir() + "/");
  const [filterText, setFilterText] = useState("");
  const [favoriteDirs, setFavoriteDirs] = useState<string[]>([]);

  useEffect(() => {
    const loadFavorites = async () => {
      const prefs = getPreferenceValues<{ favoriteDirs?: string }>();
      let prefDirs: string[] = [];
      if (prefs.favoriteDirs) {
        prefDirs = prefs.favoriteDirs.split(',').map(d => d.trim().replace(/^~/, os.homedir())).filter(d => fs.existsSync(d));
      }
      
      const localFavsStr = await LocalStorage.getItem<string>("file_browser_favorites");
      let localFavs: string[] = [];
      if (localFavsStr) {
        try { localFavs = JSON.parse(localFavsStr); } catch (e) {}
      }
      
      const combined = Array.from(new Set([...prefDirs, ...localFavs])).filter(d => d && d.trim() !== "" && fs.existsSync(d));
      setFavoriteDirs(combined);
    };
    loadFavorites();

    getActiveAppPath().then(activePath => {
      let initPath = os.homedir();
      if (activePath && fs.existsSync(activePath)) {
        initPath = activePath;
      }
      setCurrentPath(initPath);
      setInitialPath(initPath);
      setSearchText(initPath.endsWith('/') ? initPath : initPath + '/');
    });
  }, []);

  useEffect(() => {
    if (!currentPath || !fs.existsSync(currentPath)) return;
    try {
      const stat = fs.statSync(currentPath);
      if (!stat.isDirectory()) return;

      const items = fs.readdirSync(currentPath);
      const fileList = items.map(item => {
        const fullPath = path.join(currentPath, item);
        try {
          const isDir = fs.statSync(fullPath).isDirectory();
          return { name: item, isDir, path: fullPath };
        } catch {
          return { name: item, isDir: false, path: fullPath };
        }
      }).filter(f => !f.name.startsWith('.')); // hide hidden files by default

      // Sort: dirs first, then files
      fileList.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      setFiles(fileList);
    } catch (e) {
      console.error(e);
    }
  }, [currentPath]);

  const toggleFavorite = async (dirPath: string) => {
    let newFavs;
    if (favoriteDirs.includes(dirPath)) {
      newFavs = favoriteDirs.filter(d => d !== dirPath);
      await showToast({ style: Toast.Style.Success, title: "已取消收藏" });
    } else {
      newFavs = [...favoriteDirs, dirPath];
      await showToast({ style: Toast.Style.Success, title: "已添加收藏" });
    }
    setFavoriteDirs(newFavs);
    await LocalStorage.setItem("file_browser_favorites", JSON.stringify(newFavs));
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (!text) {
      setFilterText("");
      return;
    }

    if (text.startsWith("/") || text.startsWith("~")) {
      const expanded = text.replace(/^~/, os.homedir());
      try {
        if (fs.existsSync(expanded) && fs.statSync(expanded).isDirectory()) {
          setCurrentPath(expanded);
          setFilterText("");
        } else {
          const parent = path.dirname(expanded);
          if (fs.existsSync(parent) && fs.statSync(parent).isDirectory()) {
            setCurrentPath(parent);
            setFilterText(path.basename(expanded));
          } else {
            setFilterText(path.basename(expanded));
          }
        }
      } catch (e) {
        setFilterText(path.basename(expanded));
      }
    } else {
      setFilterText(text);
    }
  };

  const filteredFiles = useMemo(() => {
    if (!filterText) return files;
    return files.filter(f => f.name.toLowerCase().includes(filterText.toLowerCase()));
  }, [files, filterText]);

  const toggleSelect = (filePath: string) => {
    const newSet = new Set(selectedPaths);
    if (newSet.has(filePath)) {
      newSet.delete(filePath);
    } else {
      if (!allowMultiple) newSet.clear();
      newSet.add(filePath);
    }
    setSelectedPaths(newSet);
  };

  const handleConfirm = () => {
    if (selectedPaths.size === 0) {
      showToast({ style: Toast.Style.Failure, title: "请至少选择一个文件/目录" });
      return;
    }
    onSelect(Array.from(selectedPaths));
  };

  return (
    <List
      navigationTitle={title}
      searchBarPlaceholder="输入绝对路径跳转，或在路径后输入名称过滤..."
      searchText={searchText}
      onSearchTextChange={handleSearchChange}
      filtering={false}
      searchBarAccessory={
        favoriteDirs.length > 0 ? (
          <List.Dropdown
            tooltip="Quick Jump to Favorite Directories"
            value={currentPath}
            onChange={(newPath) => {
              if (newPath && fs.existsSync(newPath)) {
                setCurrentPath(newPath);
                setSearchText(newPath.endsWith('/') ? newPath : newPath + '/');
                setFilterText("");
              }
            }}
          >
            {!favoriteDirs.includes(currentPath) && currentPath !== initialPath && (
              <List.Dropdown.Item title="Current Directory" value={currentPath} icon={Icon.Folder} />
            )}
            
            <List.Dropdown.Section title="Context">
              <List.Dropdown.Item title="Initial Directory" value={initialPath} icon={Icon.Terminal} />
            </List.Dropdown.Section>

            {favoriteDirs.filter(d => d !== initialPath).length > 0 && (
              <List.Dropdown.Section title="Favorites">
                {favoriteDirs.filter(d => d !== initialPath).map(dir => {
                  const title = path.basename(dir) || dir;
                  return <List.Dropdown.Item key={dir} title={title} value={dir} icon={Icon.Star} />;
                })}
              </List.Dropdown.Section>
            )}
          </List.Dropdown>
        ) : undefined
      }
    >
      <List.EmptyView
        icon={Icon.Folder}
        title="未检测到有效的目录"
        description="请在上方输入绝对路径，或使用快捷键重新检测"
        actions={
          <ActionPanel>
            <Action title="Retry Detection (重新检测)" icon={Icon.ArrowClockwise} onAction={() => {
              getActiveAppPath().then(activePath => {
                let initPath = os.homedir();
                if (activePath && fs.existsSync(activePath)) {
                  initPath = activePath;
                }
                setCurrentPath(initPath);
                setInitialPath(initPath);
                setSearchText(initPath.endsWith('/') ? initPath : initPath + '/');
              });
            }} />
          </ActionPanel>
        }
      />
      <List.Section 
        title={previewCommand 
          ? previewCommand(selectedPaths.size > 0 ? Array.from(selectedPaths).join(" ") : currentPath) 
          : `当前目录: ${currentPath} (已选: ${selectedPaths.size})`
        }
      >
        {currentPath !== "/" && !filterText && (
          <List.Item
            icon={Icon.ArrowUp}
            title=".."
            subtitle="返回上级目录"
            actions={
              <ActionPanel>
                <Action title="Go Up" onAction={() => {
                  const parent = path.dirname(currentPath);
                  setCurrentPath(parent);
                  setSearchText(parent.endsWith('/') ? parent : parent + '/');
                  setFilterText("");
                }} />
                <ActionPanel.Section title="Favorites">
                  <Action 
                    title={favoriteDirs.includes(currentPath) ? "Remove Current Dir from Favorites" : "Add Current Dir to Favorites"} 
                    icon={favoriteDirs.includes(currentPath) ? Icon.StarDisabled : Icon.Star} 
                    shortcut={{ modifiers: ["cmd"], key: "d" }} 
                    onAction={() => toggleFavorite(currentPath)} 
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        )}
        {filteredFiles.map(f => {
          const isSelected = selectedPaths.has(f.path);
          return (
            <List.Item
              key={f.path}
              icon={f.isDir ? Icon.Folder : Icon.Document}
              title={f.name}
              accessories={isSelected ? [{ icon: Icon.Checkmark }] : []}
              actions={
                <ActionPanel>
                  {f.isDir ? (
                    <>
                      <Action title="Enter Directory" icon={Icon.ArrowRight} onAction={() => {
                        setCurrentPath(f.path);
                        setSearchText(f.path.endsWith('/') ? f.path : f.path + '/');
                        setFilterText("");
                      }} />
                      <Action title={isSelected ? "Deselect" : "Select"} icon={isSelected ? Icon.Circle : Icon.CheckCircle} onAction={() => toggleSelect(f.path)} />
                    </>
                  ) : (
                    <>
                      {!allowMultiple ? (
                        <Action title="Select & Confirm" icon={Icon.Checkmark} onAction={() => onSelect([f.path])} />
                      ) : (
                        <Action title={isSelected ? "Deselect" : "Select"} icon={isSelected ? Icon.Circle : Icon.CheckCircle} onAction={() => toggleSelect(f.path)} />
                      )}
                    </>
                  )}
                  {selectedPaths.size > 0 && (
                    <Action title="Confirm Selection" icon={Icon.Checkmark} shortcut={{ modifiers: ["cmd"], key: "enter" }} onAction={handleConfirm} />
                  )}
                  <ActionPanel.Section title="Favorites">
                    <Action 
                      title={favoriteDirs.includes(currentPath) ? "Remove Current Dir from Favorites" : "Add Current Dir to Favorites"} 
                      icon={favoriteDirs.includes(currentPath) ? Icon.StarDisabled : Icon.Star} 
                      shortcut={{ modifiers: ["cmd"], key: "d" }} 
                      onAction={() => toggleFavorite(currentPath)} 
                    />
                    {f.isDir && (
                      <Action 
                        title={favoriteDirs.includes(f.path) ? "Remove Selected Dir from Favorites" : "Add Selected Dir to Favorites"} 
                        icon={favoriteDirs.includes(f.path) ? Icon.StarDisabled : Icon.Star} 
                        shortcut={{ modifiers: ["cmd", "shift"], key: "d" }} 
                        onAction={() => toggleFavorite(f.path)} 
                      />
                    )}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
