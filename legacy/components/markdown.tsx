import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/**
 * Renders user Markdown safely. rehype-sanitize is the real XSS boundary (runs
 * in SSR and on the client); the API also strips HTML from the stored source as
 * defense-in-depth.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-glass measure">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
