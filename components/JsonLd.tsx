// Renders a JSON-LD structured-data block. Search engines and AI assistants
// (Google rich results, ChatGPT, Perplexity, Google AI) read this to extract
// facts about the page reliably.
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Safe: data is built server-side from our own content, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
