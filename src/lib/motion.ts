/** Scroll behaviour that honours prefers-reduced-motion: an explicit 'smooth' in script overrides the CSS opt-out, so every script scroll goes through here. */
export function smoothBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
