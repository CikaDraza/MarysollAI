// Renders a JSON-LD <script>. Server component — the structured data lands in
// the initial HTML for crawlers.
export function JsonLdScript({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
