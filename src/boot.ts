import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';

/** Resolves once the game font is ready to draw with (text drawn before that falls back to a system font). */
export async function fontReady(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('600 20px "Barlow Condensed"'), document.fonts.load('700 20px "Barlow Condensed"')]);
    await document.fonts.ready;
  } catch {
    /* no font loading API: the fallback font is used */
  }
}
