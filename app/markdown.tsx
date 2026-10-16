"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Claude's write-ups (evaluations, replies, profiles) are markdown, including tables.
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
