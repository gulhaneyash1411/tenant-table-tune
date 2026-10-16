import { useEffect } from "react";

const SHOWN_KEY = "de_welcome_shown";
const VISIBLE_MS = 1600;
const FADE_MS = 400;

// Runs in <head> before first paint: marks <html> when the installed app (not the
// browser tab) is starting, so the welcome screen covers the page from the first frame.
export const APP_WELCOME_SCRIPT = `try{var s=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(s&&!sessionStorage.getItem("${SHOWN_KEY}")){document.documentElement.setAttribute("data-welcome","in");sessionStorage.setItem("${SHOWN_KEY}","1")}}catch(e){}`;

/** "Welcome to DineEatz" screen shown once each time the installed app is opened. */
export function AppWelcome() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.hasAttribute("data-welcome")) return;
    const fade = window.setTimeout(() => html.setAttribute("data-welcome", "out"), VISIBLE_MS);
    const done = window.setTimeout(() => html.removeAttribute("data-welcome"), VISIBLE_MS + FADE_MS);
    return () => { window.clearTimeout(fade); window.clearTimeout(done); };
  }, []);

  return (
    <div className="app-welcome" aria-hidden="true">
      <div className="app-welcome__inner">
        <p className="app-welcome__hello">Welcome to</p>
        <img src="/brand/dineeatz-logo.png?v=3" alt="" className="app-welcome__logo" />
      </div>
    </div>
  );
}
