/**
 * Drop-in replacement for `next/link` that animates route changes through the
 * View Transitions API (crossfade defined in globals.css). Same props as
 * next/link. Use this for in-app navigation so pages don't hard-cut.
 */
export { Link } from "next-view-transitions";
