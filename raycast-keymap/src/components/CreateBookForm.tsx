import { Form, ActionPanel, Action, useNavigation, showToast, Toast, Icon, getPreferenceValues } from "@raycast/api";
import { useState } from "react";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Book, BookFile } from "../types";

interface CreateBookFormProps {
  onSaved: () => void;
}

export function CreateBookForm({ onSaved }: CreateBookFormProps) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [target, setTarget] = useState<string[]>([]);
  const [tags, setTags] = useState("");

  const handleSubmit = async () => {
    if (!title.trim() || target.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Title and Target File are required" });
      return;
    }

    const filePath = target[0];
    const newBook: Book = {
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      target: filePath,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean)
    };

    try {
      const prefs = getPreferenceValues<any>();
      const dirs = prefs.booksDir ? prefs.booksDir.split(',').map((d: string) => d.trim().replace(/^~/, os.homedir())) : [];
      if (dirs.length === 0) throw new Error("Books Directory is not configured");

      const targetDir = dirs[0];
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const customFile = path.join(targetDir, "custom.json");
      let data: BookFile = { books: [] };

      if (fs.existsSync(customFile)) {
        try {
          const content = fs.readFileSync(customFile, 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            data = { books: parsed };
          } else if (parsed.books && Array.isArray(parsed.books)) {
            data = parsed;
          }
        } catch (e) {}
      }

      data.books.push(newBook);
      fs.writeFileSync(customFile, JSON.stringify(data, null, 2));

      await showToast({ style: Toast.Style.Success, title: "Book Binding Saved" });
      onSaved();
      pop();
    } catch (e: any) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to save", message: e.message });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Book Binding" icon={Icon.SaveDocument} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Bind a local file or directory to the Knowledge Base." />
      <Form.TextField
        id="title"
        title="Title"
        placeholder="e.g. My Project Docs"
        value={title}
        onChange={setTitle}
        autoFocus
      />
      <Form.FilePicker
        id="target"
        title="Target File/Folder"
        allowMultipleSelection={false}
        value={target}
        onChange={setTarget}
      />
      <Form.TextField
        id="subtitle"
        title="Subtitle (Optional)"
        placeholder="e.g. Local documentation reference"
        value={subtitle}
        onChange={setSubtitle}
      />
      <Form.TextField
        id="tags"
        title="Tags (Comma separated)"
        placeholder="e.g. docs, reference, project"
        value={tags}
        onChange={setTags}
      />
    </Form>
  );
}
