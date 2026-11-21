// Use only fixed inbox URLs; never navigate to a domain supplied by an account.
export const EMAIL_INBOXES = [
  { name: "Gmail", url: "https://mail.google.com/mail/", domains: ["gmail.com", "googlemail.com"] },
  { name: "Outlook", url: "https://outlook.live.com/mail/", domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"] },
  { name: "Yahoo Mail", url: "https://mail.yahoo.com/", domains: ["yahoo.com", "ymail.com"] },
  { name: "iCloud Mail", url: "https://www.icloud.com/mail", domains: ["icloud.com", "me.com", "mac.com"] },
  { name: "Proton Mail", url: "https://mail.proton.me/", domains: ["proton.me", "protonmail.com", "pm.me"] },
];

export function emailInbox(address?: string) {
  const domain = address?.trim().toLowerCase().split("@").pop();
  return EMAIL_INBOXES.find(provider => provider.domains.includes(domain ?? ""));
}
