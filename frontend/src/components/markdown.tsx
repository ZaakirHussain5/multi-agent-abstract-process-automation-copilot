import ReactMarkdown from "react-markdown";

export function Markdown({ content }: { content: string }) {
  const trimmed = content.trim();
  if (trimmed.startsWith("<svg")) {
    return (
      <img
        alt="Visual deliverable"
        className="w-full rounded-lg border bg-black"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`}
      />
    );
  }
  if (trimmed.startsWith("data:image") || /^https?:\/\//.test(trimmed)) {
    return <img alt="Visual deliverable" className="w-full rounded-lg border" src={trimmed} />;
  }
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-medium prose-headings:tracking-tight prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-foreground">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
