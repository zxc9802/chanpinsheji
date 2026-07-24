"use client";

import { useState } from "react";

export function TagInput({
  value,
  onChange,
  placeholder = "添加关键词",
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = draft.trim();
    if (next && !value.includes(next)) onChange([...value, next]);
    setDraft("");
  };

  return (
    <div className="tag-input">
      <div className="tag-list">
        {value.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(value.filter((item) => item !== tag))} aria-label={`删除 ${tag}`}>×</button>
          </span>
        ))}
      </div>
      <div className="tag-add-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={value.length ? "继续添加…" : placeholder}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>＋ 添加关键词</button>
      </div>
    </div>
  );
}
