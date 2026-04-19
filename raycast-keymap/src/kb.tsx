import path from "path";
import { ActionPanel, Action, List, Icon, LaunchProps, getPreferenceValues } from "@raycast/api";
import { useState, useEffect, useMemo } from "react";
import { getBooks, expandPath } from "./utils";
import { Book } from "./types";

import { CreateBookForm } from "./components/CreateBookForm";

interface CommandArguments {
  query?: string;
}

export default function Command(props: LaunchProps<{ arguments: CommandArguments }>) {
  const [books, setBooks] = useState<Book[]>([]);
  const [searchText, setSearchText] = useState(props.arguments.query || "");

  useEffect(() => {
    setBooks(getBooks());
  }, []);

  // 自定义逐级过滤与评分逻辑
  const filteredBooks = useMemo(() => {
    if (!searchText.trim()) return books;

    const query = searchText.toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);

    const scored = books.map(book => {
      const title = (book.title || "").toLowerCase();
      const subtitle = (book.subtitle || "").toLowerCase();
      const target = (book.target || "").toLowerCase();
      const tags = (book.tags || []).join(" ").toLowerCase();

      const searchableText = `${title} ${subtitle} ${target} ${tags}`;

      // 逐级过滤：必须包含所有搜索词
      for (const term of terms) {
        if (!searchableText.includes(term)) {
          return { book, score: 0 };
        }
      }

      let score = 10;
      
      if (title.includes(query)) score += 50;
      if (title.startsWith(query)) score += 30;
      if (tags.includes(query)) score += 40;
      if (subtitle.includes(query)) score += 20;

      return { book, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.book);
  }, [books, searchText]);

  return (
    <List 
      searchBarPlaceholder="Search reference books..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      <List.EmptyView 
        icon={Icon.Document} 
        title="No books found"
        description="Press Cmd+N to create a new book binding"
        actions={
          <ActionPanel>
            <Action.Push
              title="Create Book Binding"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              target={<CreateBookForm onSaved={() => setBooks(getBooks())} />}
            />
          </ActionPanel>
        }
      />
      {filteredBooks.map((book, index) => {
        const isUrl = book.target.startsWith("http://") || book.target.startsWith("https://");
        let targetPath = book.target;
        
        if (!isUrl) {
          if (!targetPath.startsWith('/') && !targetPath.startsWith('~/')) {
            // Relative path handling
            if (book.baseDir) {
              targetPath = path.join(book.baseDir, targetPath);
            } else {
              // Fallback if baseDir somehow missing
              const prefs = getPreferenceValues<any>();
              const defaultBooksDir = prefs.booksDir ? expandPath(prefs.booksDir.split(',')[0].trim()) : "";
              targetPath = path.join(defaultBooksDir, targetPath);
            }
          } else {
            targetPath = expandPath(targetPath);
          }
        }
        
        let mainAction;
        if (!isUrl) {
          const encodedPath = encodeURIComponent(targetPath);
          mainAction = <Action.Open title="Open in KeyBook (Hammerspoon)" target={`hammerspoon://show_md?path=${encodedPath}`} icon={Icon.Window} />;
        } else {
          mainAction = <Action.OpenInBrowser url={targetPath} />;
        }

        const subtitleParts = [];
        if (book.subtitle) subtitleParts.push(book.subtitle);
        if (book.tags && book.tags.length > 0) subtitleParts.push(`[${book.tags.join(", ")}]`);
        const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : targetPath;

        const keywords = [
          targetPath,
          ...(book.tags || [])
        ].filter(Boolean);

        return (
          <List.Item
            key={index}
            icon={isUrl ? Icon.Globe : Icon.Document}
            title={book.title}
            subtitle={subtitle}
            keywords={keywords}
            actions={
              <ActionPanel>
                {mainAction}
                {!isUrl && <Action.ShowInFinder path={targetPath} shortcut={{ modifiers: ["cmd"], key: "enter" }} />}
                {isUrl && <Action.OpenInBrowser url={targetPath} shortcut={{ modifiers: ["cmd"], key: "enter" }} />}
                <Action.CopyToClipboard 
                  title="Copy Glow Command" 
                  content={isUrl ? targetPath : `glow '${targetPath}'`} 
                  shortcut={{ modifiers: ["opt"], key: "enter" }} 
                />
                <Action.CopyToClipboard 
                  title="Copy Target Path" 
                  content={targetPath} 
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} 
                />
                <Action.Push
                  title="Create Book Binding"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  target={<CreateBookForm onSaved={() => setBooks(getBooks())} />}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
