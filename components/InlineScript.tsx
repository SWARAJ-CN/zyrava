/**
 * Renders an inline script that runs during HTML parsing (before first paint)
 * on hard navigations, while staying inert on the client.
 *
 * React 19 warns when a `<script>` is rendered on the client, so we advertise
 * `text/javascript` on the server (where the browser executes it) and
 * `text/plain` on the client (where React would otherwise re-create it).
 * `suppressHydrationWarning` accepts the resulting `type` mismatch.
 *
 * @see https://nextjs.org/docs/app/guides/preventing-flash-before-hydration
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
