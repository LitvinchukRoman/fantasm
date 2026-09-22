import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Link } from "@/lib/link";

/** Internal links route through the View-Transition Link; external open normally. */
const components = {
  a: ({ href = "", children, ...rest }: React.ComponentProps<"a">) => {
    const internal = href.startsWith("/");
    if (internal) {
      return (
        <Link href={href} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
};

/** Renders MDX body with heading anchors, styled by the .prose-glass palette. */
export function Mdx({ source }: { source: string }) {
  return (
    <div className="prose-glass measure">
      <MDXRemote
        source={source}
        components={components}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [
              rehypeSlug,
              [rehypeAutolinkHeadings, { behavior: "wrap", properties: { className: ["heading-anchor"] } }],
            ],
          },
        }}
      />
    </div>
  );
}
