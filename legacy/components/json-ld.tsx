/** Injects a JSON-LD <script> for rich results. `data` must be safe structured
 * data (we build it ourselves from typed models, never raw user HTML). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
