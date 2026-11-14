import '@fontsource/lilita-one/400.css';

/** Resolves once the game font is ready to draw with (text drawn before that falls back to a system font). */
export async function fontReady(): Promise<void> {
  try {
    await document.fonts.load('20px "Lilita One"');
    await document.fonts.ready;
  } catch {
    /* no font loading API: the fallback font is used */
  }
}
