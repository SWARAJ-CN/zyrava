/**
 * Reading the shop's own words in a language the reader can follow.
 *
 * When the app is in one of the four languages it is written in, the shop's
 * data is shown exactly as it was typed. When the reader has picked a language
 * the app has no translation of, the words that came from the shop — product
 * names, customer names, notes — are translated into English so they can be
 * read.
 *
 * Nothing here writes anything back: the records the shop keeps are untouched.
 */

import type { Calculation, Expense, Product, Sale, Settings } from "@/lib/types";
import {
  contentSourceLanguage,
  shouldTranslateContent,
  translateManyToEnglish,
} from "./translate";

/** The address fields a reader might not be able to read. */
const ADDRESS_FIELDS = ["addressLine1", "addressLine2", "landmark", "city", "state"] as const;

function pick(
  values: string[],
  index: number
): string {
  return values[index] ?? "";
}

export async function translateSales(sales: Sale[]): Promise<Sale[]> {
  if (!shouldTranslateContent() || !sales.length) return sales;

  const source = contentSourceLanguage();
  const texts: string[] = [];
  for (const sale of sales) {
    texts.push(sale.customerName);
    for (const field of ADDRESS_FIELDS) {
      if (field !== "landmark" && field !== "addressLine2") texts.push(sale.customerAddress[field]);
    }
    for (const item of sale.items) texts.push(item.name);
  }

  const translated = await translateManyToEnglish(texts, source);

  let cursor = 0;
  return sales.map((sale) => {
    const customerName = pick(translated, cursor++);
    const address = { ...sale.customerAddress };
    for (const field of ADDRESS_FIELDS) {
      if (field === "landmark" || field === "addressLine2") continue;
      address[field] = pick(translated, cursor++);
    }
    const items = sale.items.map((item) => ({
      ...item,
      name: pick(translated, cursor++),
    }));
    return { ...sale, customerName, customerAddress: address, items };
  });
}

export async function translateExpenses(expenses: Expense[]): Promise<Expense[]> {
  if (!shouldTranslateContent() || !expenses.length) return expenses;

  const source = contentSourceLanguage();
  const texts: string[] = [];
  for (const expense of expenses) {
    texts.push(expense.description, expense.notes, expense.category);
  }

  const translated = await translateManyToEnglish(texts, source);

  let cursor = 0;
  return expenses.map((expense) => ({
    ...expense,
    description: pick(translated, cursor++),
    notes: pick(translated, cursor++),
    category: pick(translated, cursor++),
  }));
}

export async function translateProducts(products: Product[]): Promise<Product[]> {
  if (!shouldTranslateContent() || !products.length) return products;

  const source = contentSourceLanguage();
  const texts: string[] = [];
  for (const product of products) {
    texts.push(product.name, product.details, product.category);
  }

  const translated = await translateManyToEnglish(texts, source);

  let cursor = 0;
  return products.map((product) => ({
    ...product,
    name: pick(translated, cursor++),
    details: pick(translated, cursor++),
    category: pick(translated, cursor++),
  }));
}

export async function translateCalculations(
  calculations: Calculation[]
): Promise<Calculation[]> {
  if (!shouldTranslateContent() || !calculations.length) return calculations;

  const source = contentSourceLanguage();
  const translated = await translateManyToEnglish(
    calculations.map((entry) => entry.name),
    source
  );

  return calculations.map((entry, index) => ({ ...entry, name: pick(translated, index) }));
}

/**
 * The shop profile.
 *
 * The shop's name is its identity and is left alone; everything else — the
 * tagline, the address, the note at the foot of the bill — is read in English
 * when the reader has chosen a language the app does not speak.
 */
export async function translateSettings(settings: Settings): Promise<Settings> {
  if (!shouldTranslateContent()) return settings;

  const source = contentSourceLanguage();
  const translated = await translateManyToEnglish(
    [settings.tagline, settings.invoiceFooter],
    source
  );

  return {
    ...settings,
    tagline: pick(translated, 0),
    invoiceFooter: pick(translated, 1),
  };
}
