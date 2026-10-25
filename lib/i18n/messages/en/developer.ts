/**
 * The English text of Developer Mode — the repository bar, the code browser,
 * branches, pull requests, commits and workflow runs.
 *
 * Keys are the English sentences themselves, so the wording in the interface
 * and the wording in the dictionary can never drift apart. A translator
 * replaces the values later; the keys stay put.
 */

export const developer = {
  /* Section tabs */
  "Code": "Code",
  "Branches": "Branches",
  "Pull requests": "Pull requests",
  "Commits": "Commits",
  "Actions": "Actions",
  "Developer sections": "Developer sections",

  /* Page header and page-level notices */
  "Browse, edit and ship this repository without leaving the admin.":
    "Browse, edit and ship this repository without leaving the admin.",
  "Contacting GitHub…": "Contacting GitHub…",
  "Reload": "Reload",
  "This session": "This session",
  "Open": "Open",
  "GitHub token is not configured": "GitHub token is not configured",
  "Developer Mode needs a GitHub token in the environment. Add it and restart the app:":
    "Developer Mode needs a GitHub token in the environment. Add it and restart the app:",
  "Locally this goes in": "Locally this goes in",
  "on your host, add it in the project’s environment variables.":
    "on your host, add it in the project’s environment variables.",
  "Could not load the repository": "Could not load the repository",
  "GitHub did not answer.": "GitHub did not answer.",
  "Full write access. Commits and pushes go straight to":
    "Full write access. Commits and pushes go straight to",
  "on": "on",
  "and reach production, so review the diff before you ship.":
    "and reach production, so review the diff before you ship.",

  /* Repository identity strip */
  "Branch": "Branch",
  "Signed in": "Signed in",
  "Pushed": "Pushed",
  "{count} {label}": "{count} {label}",
  "stars": "stars",
  "forks": "forks",
  "watchers": "watchers",
  "open issues": "open issues",
  "private": "private",
  "public": "public",
  "No description on the repository.": "No description on the repository.",
  "Notify dev": "Notify dev",
  "Open on GitHub": "Open on GitHub",
  "push": "push",
  "maintain": "maintain",
  "read": "read",
  "GitHub API calls left, resetting {time}": "GitHub API calls left, resetting {time}",
  "GitHub calls are made from the server — the token never reaches this page.":
    "GitHub calls are made from the server — the token never reaches this page.",
  "token set": "token set",
  "token missing": "token missing",

  /* Branches */
  "A branch name is required.": "A branch name is required.",
  "Use letters, numbers, dots, dashes and slashes only.":
    "Use letters, numbers, dots, dashes and slashes only.",
  "Give the branch a name.": "Give the branch a name.",
  "Letters, numbers, dots, dashes and slashes only.":
    "Letters, numbers, dots, dashes and slashes only.",
  "That branch already exists.": "That branch already exists.",
  "Could not create the branch.": "Could not create the branch.",
  "1 branch on the repository": "1 branch on the repository",
  "{count} branches on the repository": "{count} branches on the repository",
  "default": "default",
  "protected": "protected",
  "No commits": "No commits",
  "No branches": "No branches",
  "GitHub returned no branches for this repository.":
    "GitHub returned no branches for this repository.",
  "New branch": "New branch",
  "Branch off an existing ref.": "Branch off an existing ref.",
  "Branch off any ref, then commit to it from the code browser.":
    "Branch off any ref, then commit to it from the code browser.",
  "Branch name": "Branch name",
  "Start from": "Start from",
  "Create branch": "Create branch",
  "Branch to browse and commit to": "Branch to browse and commit to",
  "the only branch on GitHub": "the only branch on GitHub",
  "branches off {branch}": "branches off {branch}",
  "Find file": "Find file",
  "Find a file (Ctrl/⌘ + P)": "Find a file (Ctrl/⌘ + P)",
  "Reload this branch": "Reload this branch",

  /* Code browser */
  "Could not open the file.": "Could not open the file.",
  "Could not open the file": "Could not open the file",
  "File staged for deletion": "File staged for deletion",
  "Path copied": "Path copied",
  "Could not copy": "Could not copy",
  "Your browser blocked clipboard access.": "Your browser blocked clipboard access.",
  "Pushed to {branch}": "Pushed to {branch}",
  "Committed to {branch}": "Committed to {branch}",
  "1 file": "1 file",
  "{count} files": "{count} files",
  "Commit failed": "Commit failed",
  "Diff": "Diff",
  "Files": "Files",
  "1 file on {branch}": "1 file on {branch}",
  "{count} files on {branch}": "{count} files on {branch}",
  "{count} staged": "{count} staged",
  "Could not load the tree": "Could not load the tree",
  "Editor": "Editor",
  "1 line": "1 line",
  "{count} lines": "{count} lines",
  "Pick a file to read, edit and ship it.": "Pick a file to read, edit and ship it.",
  "uncommitted": "uncommitted",
  "Discard changes to this file": "Discard changes to this file",
  "Revert": "Revert",
  "File view": "File view",
  "Wrap long lines": "Wrap long lines",
  "Wrap": "Wrap",
  "Smaller text": "Smaller text",
  "Smaller code text": "Smaller code text",
  "Larger text": "Larger text",
  "Larger code text": "Larger code text",
  "Copy path": "Copy path",
  "Download this file": "Download this file",
  "No file selected": "No file selected",
  "Choose a file on the left, or press Ctrl/⌘ + P to jump straight to one by path.":
    "Choose a file on the left, or press Ctrl/⌘ + P to jump straight to one by path.",
  "Binary file": "Binary file",
  "This file is not text, so it cannot be shown here. Open it on GitHub to inspect it.":
    "This file is not text, so it cannot be shown here. Open it on GitHub to inspect it.",
  "File is too large": "File is too large",
  "Files above 512 KB are shown read-only. Open it on GitHub instead.":
    "Files above 512 KB are shown read-only. Open it on GitHub instead.",
  "Edit {file}": "Edit {file}",
  "Contents of {file}": "Contents of {file}",
  "Staged changes": "Staged changes",
  "Unstage {file}": "Unstage {file}",
  "Unstage": "Unstage",
  "Commit message": "Commit message",
  "Describe the change…": "Describe the change…",
  "Pushing writes straight to": "Pushing writes straight to",
  "on GitHub.": "on GitHub.",
  "Discard all": "Discard all",
  "Commit to {branch}": "Commit to {branch}",
  "Push to {branch}": "Push to {branch}",
  "Push to {branch}?": "Push to {branch}?",
  "Are you sure? This commits {count} file directly to {branch} and notifies the developer on WhatsApp.":
    "Are you sure? This commits {count} file directly to {branch} and notifies the developer on WhatsApp.",
  "Are you sure? This commits {count} files directly to {branch} and notifies the developer on WhatsApp.":
    "Are you sure? This commits {count} files directly to {branch} and notifies the developer on WhatsApp.",
  "Yes, push to main": "Yes, push to main",
  "Delete this file?": "Delete this file?",
  "{file} will be staged for deletion. Nothing is removed until you commit or push.":
    "{file} will be staged for deletion. Nothing is removed until you commit or push.",
  "This file": "This file",
  "Stage deletion": "Stage deletion",
  "Discard every staged change?": "Discard every staged change?",
  "{count} file will be reset to the committed revision. This cannot be undone.":
    "{count} file will be reset to the committed revision. This cannot be undone.",
  "{count} files will be reset to the committed revision. This cannot be undone.":
    "{count} files will be reset to the committed revision. This cannot be undone.",
  "Staged changes discarded": "Staged changes discarded",
  "The code is live on GitHub. Notify the developer so they can pick it up.":
    "The code is live on GitHub. Notify the developer so they can pick it up.",
  "The commit is on GitHub. Notify the developer if they need to know.":
    "The commit is on GitHub. Notify the developer if they need to know.",
  "Done": "Done",
  "Send WhatsApp to dev": "Send WhatsApp to dev",
  "View commit on GitHub": "View commit on GitHub",
  "The WhatsApp button opens a pre-filled message to +91 85900 53568. Press send in WhatsApp to deliver it.":
    "The WhatsApp button opens a pre-filled message to +91 85900 53568. Press send in WhatsApp to deliver it.",

  /* File tree and quick-open */
  "Filter files…": "Filter files…",
  "Filter repository files": "Filter repository files",
  "Clear filter": "Clear filter",
  "No files match.": "No files match.",
  "This branch is empty.": "This branch is empty.",
  "Modified": "Modified",
  "Find a file": "Find a file",
  "1 file on this branch": "1 file on this branch",
  "{count} files on this branch": "{count} files on this branch",
  "Type a path — {example}": "Type a path — {example}",
  "Search files by path": "Search files by path",
  "No file matches “{query}”.": "No file matches “{query}”.",

  /* Pull requests */
  "A pull request title is required.": "A pull request title is required.",
  "Create a branch first — there is nothing to compare.":
    "Create a branch first — there is nothing to compare.",
  "Could not open the pull request.": "Could not open the pull request.",
  "Could not merge.": "Could not merge.",
  "{count} open": "{count} open",
  "draft": "draft",
  "merged": "merged",
  "Merge": "Merge",
  "No open pull requests": "No open pull requests",
  "Open one from the panel on the right to review a branch before it lands on main.":
    "Open one from the panel on the right to review a branch before it lands on main.",
  "New pull request": "New pull request",
  "Compare a branch with the base.": "Compare a branch with the base.",
  "Add reports export": "Add reports export",
  "Head branch": "Head branch",
  "No other branches": "No other branches",
  "Base branch": "Base branch",
  "What does this change and why?": "What does this change and why?",
  "Open pull request": "Open pull request",
  "Merge #{number}?": "Merge #{number}?",
  "This lands the branch on its base and can trigger deployments.":
    "This lands the branch on its base and can trigger deployments.",
  "Merge pull request": "Merge pull request",
  "Merging cannot be undone from here. Prefer a pull request over pushing straight to main when the change is risky.":
    "Merging cannot be undone from here. Prefer a pull request over pushing straight to main when the change is risky.",
  "Merge method": "Merge method",
  "Create a merge commit": "Create a merge commit",
  "Squash and merge": "Squash and merge",
  "Rebase and merge": "Rebase and merge",

  /* Commits */
  "Recent commits": "Recent commits",
  "{count} shown": "{count} shown",
  "Commit": "Commit",
  "Message": "Message",
  "Author": "Author",
  "This branch has no commits yet.": "This branch has no commits yet.",

  /* Workflow runs */
  "Workflow runs": "Workflow runs",
  "1 most recent run on this repository": "1 most recent run on this repository",
  "{count} most recent runs on this repository": "{count} most recent runs on this repository",
  "Workflow": "Workflow",
  "Event": "Event",
  "Actor": "Actor",
  "When": "When",
  "Link": "Link",
  "No workflow runs": "No workflow runs",
  "This repository has no GitHub Actions runs yet, or Actions is disabled.":
    "This repository has no GitHub Actions runs yet, or Actions is disabled.",
  "running": "running",
  "unknown": "unknown",

  /* Diff view */
  "This file matches the committed revision — nothing staged.":
    "This file matches the committed revision — nothing staged.",
  "Diff of {file}": "Diff of {file}",
  "1 unchanged line collapsed": "1 unchanged line collapsed",
  "{count} unchanged lines collapsed": "{count} unchanged lines collapsed",
  "no lines collapsed": "no lines collapsed",

  /* Session activity */
  "Branch created": "Branch created",
  "Created branch {branch}": "Created branch {branch}",
  "from {branch}": "from {branch}",
  "Pull request opened": "Pull request opened",
  "Opened pull request #{number}": "Opened pull request #{number}",
  "Pull request merged": "Pull request merged",
  "Merged pull request #{number}": "Merged pull request #{number}",
  "GitHub did not merge the pull.": "GitHub did not merge the pull.",
  "Merge failed": "Merge failed",

  /* WhatsApp notifications to the developer */
  "Amare Handmades — Developer Mode": "Amare Handmades — Developer Mode",
  "Repo: {repo}": "Repo: {repo}",
  "Default branch: {branch}": "Default branch: {branch}",
  "Last push: {time}": "Last push: {time}",
  "Open pull requests: {count}": "Open pull requests: {count}",
  "Recent workflow runs: {count}": "Recent workflow runs: {count}",
  "Sent by: {name}": "Sent by: {name}",
  "Time: {time}": "Time: {time}",
  "Push completed ✅": "Push completed ✅",
  "Branch: {branch}": "Branch: {branch}",
  "Commit: {commit}": "Commit: {commit}",
  "Message: {message}": "Message: {message}",
  "Files: {files}": "Files: {files}",
  "By: {actor}": "By: {actor}",
};
