/**
 * The English text of the app — the master copy every other language is
 * checked against.
 *
 * Keys are the English sentences themselves. That keeps the call sites
 * readable (`t("Save settings")`), makes a missing translation obvious — the
 * English shows through — and means the wording in the interface and the
 * wording in the dictionary can never drift apart.
 *
 * The file is split by domain so each one can be worked on without the others
 * in the way; `index.ts` merges them into the single map the app reads.
 */

export const shell = {
  /* Navigation */
  "Overview": "Overview",
  "Operations": "Operations",
  "Tools": "Tools",
  "Advanced": "Advanced",
  "Dashboard": "Dashboard",
  "Reports": "Reports",
  "Sales": "Sales",
  "Expenses": "Expenses",
  "Products": "Products",
  "Calculator": "Calculator",
  "Database": "Database",
  "Server": "Server",
  "Settings": "Settings",
  "Developer": "Developer",
  "Key numbers and trends": "Key numbers and trends",
  "Deeper analytics and charts": "Deeper analytics and charts",
  "Bills and custom orders": "Bills and custom orders",
  "Spending and suppliers": "Spending and suppliers",
  "Catalogue and pricing": "Catalogue and pricing",
  "Price and cost maths": "Price and cost maths",
  "Read-only collection browser": "Read-only collection browser",
  "Backend health and endpoints": "Backend health and endpoints",
  "Shop profile and invoice": "Shop profile and invoice",
  "Edit and ship the codebase": "Edit and ship the codebase",

  /* Topbar and sidebar */
  "Open navigation": "Open navigation",
  "Close navigation": "Close navigation",
  "Refresh data": "Refresh data",
  "Amare Handmades": "Amare Handmades",
  "Handmade with Love": "Handmade with Love",
  "Syncing…": "Syncing…",
  "Sync now": "Sync now",
  "Synced {time}": "Synced {time}",

  /* Theme */
  "Light": "Light",
  "Dark": "Dark",
  "System": "System",
  "Colour theme": "Colour theme",

  /* Account */
  "Account menu": "Account menu",
  "Signed in to Amare admin": "Signed in to Amare admin",
  "Sign out": "Sign out",
  "owner": "owner",
  "admin": "admin",

  /* Server status */
  "Checking": "Checking",
  "Online": "Online",
  "Offline": "Offline",
  "Server online": "Server online",
  "Server unreachable": "Server unreachable",
  "Checking server…": "Checking server…",

  /* Splash */
  "Preparing your workspace…": "Preparing your workspace…",
  "Checking your session…": "Checking your session…",
  "The server sleeps when idle, so the very first request can take up to a minute. Thanks for waiting.":
    "The server sleeps when idle, so the very first request can take up to a minute. Thanks for waiting.",

  /* Voice command panel */
  "Voice commands": "Voice commands",
  "Stop listening": "Stop listening",
  "Switch pages by voice": "Switch pages by voice",
  "Show voice commands": "Show voice commands",
  "Voice commands need Chrome or Edge": "Voice commands need Chrome or Edge",
  "Close the voice panel": "Close the voice panel",
  "Listening…": "Listening…",
  "Not available here": "Not available here",
  "Voice input stopped": "Voice input stopped",
  "Voice input off": "Voice input off",
  "Speak now — a page name, or “open settings”.":
    "Speak now — a page name, or “open settings”.",
  "Say a page name, for example “sales”.": "Say a page name, for example “sales”.",
  "Use": "Use",
  "Or maybe": "Or maybe",
  "Did you mean": "Did you mean",
  "Also heard: {list}": "Also heard: {list}",
  "No command in that — try a page name.": "No command in that — try a page name.",
  "Try saying": "Try saying",
  "You can also say": "You can also say",
  "Language": "Language",
  "The recogniser expects this accent. Changing it restarts listening.":
    "The recogniser expects this accent. Changing it restarts listening.",
  "Voice input language": "Voice input language",
  "Close": "Close",
  "Not sure about that one — pick the command you meant.":
    "Not sure about that one — pick the command you meant.",
  "That was not a command — try a page name.": "That was not a command — try a page name.",
  "Microphone blocked. Allow it in your browser settings, then try again.":
    "Microphone blocked. Allow it in your browser settings, then try again.",
  "The browser refused speech recognition on this connection.":
    "The browser refused speech recognition on this connection.",
  "No microphone was found.": "No microphone was found.",
  "Speech recognition needs a working connection to the browser's speech service.":
    "Speech recognition needs a working connection to the browser's speech service.",
  "This browser has no speech model for that language.":
    "This browser has no speech model for that language.",
  "Voice input needs Chrome or Edge — this browser has no speech recognition.":
    "Voice input needs Chrome or Edge — this browser has no speech recognition.",
  "Voice input stopped ({code}).": "Voice input stopped ({code}).",
  "Already on {page}": "Already on {page}",
  "Opened {page}": "Opened {page}",
  "Dark theme on": "Dark theme on",
  "Light theme on": "Light theme on",
  "System theme on": "System theme on",
  "Dark theme": "Dark theme",
  "Light theme": "Light theme",
  "System theme": "System theme",
  "Confident enough to act on its own": "Confident enough to act on its own",
  "Not confident — pick it to use it": "Not confident — pick it to use it",
  "Follow the app ({language})": "Follow the app ({language})",
  "Refreshing data": "Refreshing data",
  "{action} is not available now.": "{action} is not available now.",

  /* Voice output */
  "Voice output": "Voice output",
  "Speak what happens as you use the app": "Speak what happens as you use the app",
  "Voice mode": "Voice mode",
  "Male": "Male",
  "Female": "Female",
  "Kid": "Kid",
  "The voice that reads the app back to you.": "The voice that reads the app back to you.",
  "Voice output is on. I will tell you when you open a page or save something.":
    "Voice output is on. I will tell you when you open a page or save something.",
  "You can say a page name, “open settings”, “dark mode” or “refresh data”.":
    "You can say a page name, “open settings”, “dark mode” or “refresh data”.",
  "Voice output is off.": "Voice output is off.",
  "Voice mode set to {mode}.": "Voice mode set to {mode}.",

  /* Operations the pages put up for voice */
  "Save sale": "Save sale",
  "Sale saved": "Sale saved",
  "Save expense": "Save expense",
  "Expense saved": "Expense saved",
  "Save product": "Save product",
  "Product saved": "Product saved",
  "Filters cleared": "Filters cleared",
  "Changes discarded": "Changes discarded",
  "Saving…": "Saving…",
  "Closed": "Closed",

  /* Language switcher */
  "App language": "App language",
  "Language & voice": "Language & voice",
  "The language the admin reads in, and the voice that reads it back.":
    "The language the admin reads in, and the voice that reads it back.",
  "Choose the language the admin reads in.": "Choose the language the admin reads in.",
  "Fully translated": "Fully translated",
  "Translated to English": "Translated to English",
  "Language changed to {language}.": "Language changed to {language}.",
  "These languages are translated into English as you use them.":
    "These languages are translated into English as you use them.",
};
