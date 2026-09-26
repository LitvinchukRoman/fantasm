import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export function GuideMarkdown({ source }: { source: string }) {
  return (
    <div className="prose-guide">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          table: ({ children }) => (
            <div className="guide-table">
              <table>{children}</table>
            </div>
          ),
          a: ({ href = "", children }) => {
            const internal = href.startsWith("/") || href.startsWith("#");
            return internal ? (
              <a href={href}>{children}</a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
