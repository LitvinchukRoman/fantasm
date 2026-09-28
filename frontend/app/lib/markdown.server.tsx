import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

/**
 * Markdown рендериться в HTML у лоадері, тобто на білді або на сервері.
 * Клієнт отримує готовий рядок: без react-markdown у бандлі і без
 * другої копії тексту статті в даних гідрації.
 */
export function renderMarkdown(source: string): string {
  return renderToStaticMarkup(
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
    </ReactMarkdown>,
  );
}
