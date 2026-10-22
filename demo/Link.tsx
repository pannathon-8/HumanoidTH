import type { AnchorHTMLAttributes } from "react";

// The public browser-only demo uses normal same-origin links. The main Next app
// continues using next/link; only the demo bundler maps that import here.
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
