/**
 * The English text of the tool screens: the calculator, the database browser,
 * the server status panel and the live log that hangs off it.
 *
 * Keys are the English sentences themselves, so the call sites stay readable
 * and the wording in the interface and the wording in the dictionary can never
 * drift apart.
 */

export const tools = {
  /* Calculator */
  "Run pricing and cost maths, then save the ones worth keeping.":
    "Run pricing and cost maths, then save the ones worth keeping.",
  "Expression": "Expression",
  "Use + − × ÷ ^ %, brackets and functions like sqrt(9) or max(2,5).":
    "Use + − × ÷ ^ %, brackets and functions like sqrt(9) or max(2,5).",
  "1250 * 3 + 80": "1250 * 3 + 80",
  "Result": "Result",
  "Type an expression to see the result.": "Type an expression to see the result.",
  "Keep going — the expression isn’t finished yet.":
    "Keep going — the expression isn’t finished yet.",
  "Finish the expression": "Finish the expression",
  "Nothing to save": "Nothing to save",
  "Untitled calculation": "Untitled calculation",
  "Calculation saved": "Calculation saved",
  "Could not save the calculation": "Could not save the calculation",
  "Calculation deleted": "Calculation deleted",
  "Could not delete the calculation": "Could not delete the calculation",
  "Insert {key}": "Insert {key}",
  "Open bracket": "Open bracket",
  "Close bracket": "Close bracket",
  "Backspace": "Backspace",
  "Save as": "Save as",
  "Bulk order quote": "Bulk order quote",
  "Save calculation": "Save calculation",
  "Saved calculations": "Saved calculations",
  "{count} on file": "{count} on file",
  "No matches": "No matches",
  "No saved calculations": "No saved calculations",
  "Try a different search term.": "Try a different search term.",
  "Evaluate an expression and save it to build a reusable price list.":
    "Evaluate an expression and save it to build a reusable price list.",
  "Delete this calculation?": "Delete this calculation?",
  "“{name}” ({expression}) will be permanently removed.":
    "“{name}” ({expression}) will be permanently removed.",
  "Delete calculation": "Delete calculation",
  "Delete {what}": "Delete {what}",

  /* Calculator errors raised by the expression parser */
  "Enter an expression to evaluate.": "Enter an expression to evaluate.",
  "Cannot divide by zero.": "Cannot divide by zero.",
  "Cannot take a remainder by zero.": "Cannot take a remainder by zero.",
  "Missing a closing bracket.": "Missing a closing bracket.",
  "The expression ends unexpectedly.": "The expression ends unexpectedly.",
  "The result is not a finite number.": "The result is not a finite number.",
  "Could not evaluate the expression.": "Could not evaluate the expression.",

  /* Database browser */
  "Read-only inspection of every collection behind the shop.":
    "Read-only inspection of every collection behind the shop.",
  "Export JSON": "Export JSON",
  "Could not reach the database": "Could not reach the database",
  "Could not load the database.": "Could not load the database.",
  "“{table}” is not a readable collection.": "“{table}” is not a readable collection.",
  "Could not load the collection.": "Could not load the collection.",
  "Backup downloaded": "Backup downloaded",
  "Full database export saved as JSON.": "Full database export saved as JSON.",
  "Export failed": "Export failed",
  "Collections": "Collections",
  "Updated {when}": "Updated {when}",
  "No collections reported.": "No collections reported.",
  "{table} collection": "{table} collection",
  "Select a collection": "Select a collection",
  "{count} document total": "{count} document total",
  "{count} documents total": "{count} documents total",
  "Choose a table on the left to inspect its documents.":
    "Choose a table on the left to inspect its documents.",
  "Filter rows…": "Filter rows…",
  "Could not load this collection": "Could not load this collection",
  "Showing": "Showing",
  "of": "of",
  "filtered row on this page": "filtered row on this page",
  "filtered rows on this page": "filtered rows on this page",
  "No rows match the filter": "No rows match the filter",
  "This collection is empty": "This collection is empty",
  "Clear the filter to see every row on this page.":
    "Clear the filter to see every row on this page.",
  "Documents created through the app will show up here.":
    "Documents created through the app will show up here.",

  /* Server status */
  "Live health of the backend that powers this admin.":
    "Live health of the backend that powers this admin.",
  "Auto-refresh interval": "Auto-refresh interval",
  "15s": "15s",
  "30s": "30s",
  "1m": "1m",
  "5m": "5m",
  "Check now": "Check now",
  "The server may be waking up": "The server may be waking up",
  "This project runs on a free tier that sleeps after a period of inactivity. The first request can take up to a minute while the instance boots.":
    "This project runs on a free tier that sleeps after a period of inactivity. The first request can take up to a minute while the instance boots.",
  "Checking…": "Checking…",
  "All systems online": "All systems online",
  "Contacting the backend for the first time.":
    "Contacting the backend for the first time.",
  "The backend is responding to every public endpoint.":
    "The backend is responding to every public endpoint.",
  "Partially degraded": "Partially degraded",
  "Some endpoints responded, but the health check did not.":
    "Some endpoints responded, but the health check did not.",
  "No endpoint answered. On the free tier the service may be asleep.":
    "No endpoint answered. On the free tier the service may be asleep.",
  "{passed}/{total} responding": "{passed}/{total} responding",
  "Latency": "Latency",
  "Last checked": "Last checked",
  "Uptime": "Uptime",
  "Endpoint checks": "Endpoint checks",
  "Public routes used to judge whether the backend is healthy.":
    "Public routes used to judge whether the backend is healthy.",
  "Health check": "Health check",
  "Service info": "Service info",
  "GraphQL": "GraphQL",
  "Auth guard": "Auth guard",
  "401 is expected without a token — it still proves the server is up.":
    "401 is expected without a token — it still proves the server is up.",
  "No response": "No response",
  "Could not reach the server. Check your connection.":
    "Could not reach the server. Check your connection.",
  "Health latency": "Health latency",
  "Recent /health round-trip times for this session.":
    "Recent /health round-trip times for this session.",
  "Min": "Min",
  "Avg": "Avg",
  "Max": "Max",
  "Not enough samples yet. Latency is charted after a couple of successful health checks.":
    "Not enough samples yet. Latency is charted after a couple of successful health checks.",
  "Response body": "Response body",

  /* Live log */
  "Live log": "Live log",
  "Requests this browser has made to the backend, newest last.":
    "Requests this browser has made to the backend, newest last.",
  "Every request the backend has served since it last restarted, newest last.":
    "Every request the backend has served since it last restarted, newest last.",
  "Live · this device": "Live · this device",
  "Live · server": "Live · server",
  "Paused": "Paused",
  "Filter log lines": "Filter log lines",
  "Info": "Info",
  "Warn": "Warn",
  "Error": "Error",
  "Pause": "Pause",
  "Resume": "Resume",
  "Clear the log view": "Clear the log view",
  "Copy visible log lines": "Copy visible log lines",
  "Nothing yet — the log fills as this admin talks to the backend.":
    "Nothing yet — the log fills as this admin talks to the backend.",
  "Waiting for the first request…": "Waiting for the first request…",
  "No lines match this filter.": "No lines match this filter.",
  "Jump to latest": "Jump to latest",
  "The backend's own log switches on once the current server build is deployed. Until then this shows what this browser asks it for.":
    "The backend's own log switches on once the current server build is deployed. Until then this shows what this browser asks it for.",
  "Try the server log": "Try the server log",
  "{shown} of {total} line shown": "{shown} of {total} line shown",
  "{shown} of {total} lines shown": "{shown} of {total} lines shown",
  "filtered to {level}": "filtered to {level}",
  "{count} warning / error": "{count} warning / error",
  "{count} warnings / errors": "{count} warnings / errors",
  "Kept on this device": "Kept on this device",
  "Server buffer {count}/{max}": "Server buffer {count}/{max}",
  "Waiting for the server buffer…": "Waiting for the server buffer…",
};
