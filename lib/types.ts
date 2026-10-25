export type Role = "owner" | "manager" | "staff";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

export interface CustomerAddress {
  phone: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface SaleItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export interface Sale {
  id: string;
  billNumber: string;
  billType: "product" | "custom";
  saleType: string;
  customerName: string;
  customerAddress: CustomerAddress;
  items: SaleItem[];
  customAmount: number;
  handlingFee: number;
  deliveryFee: number;
  discount: number;
  /** Amount already collected from the customer. Does not reduce `total`. */
  advancePaid: number;
  productAmount: number;
  total: number;
  /** ISO date the sale is booked against (backend `saleDate`). */
  date: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  type: string;
  description: string;
  amount: number;
  paymentMethod: string;
  category: string;
  notes: string;
  /** ISO date the expense is booked against (backend `expenseDate`). */
  date: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  imageUri: string;
  category: string;
  details: string;
  sourceUrl: string;
  createdAt: string;
}

export interface Calculation {
  id: string;
  name: string;
  expression: string;
  result: number;
  savedAt: string;
}

export interface Settings {
  id: string;
  shopName: string;
  tagline: string;
  primaryColor: string;
  backgroundStyle: string;
  colorScheme: "light" | "dark";
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
  gstin: string;
  whatsapp: string;
  upiId: string;
  /** When false, the UPI id and its payment QR are left off bills. */
  upiEnabled: boolean;
  currency: string;
  dateFormat: string;
  invoicePrefix: string;
  invoiceFooter: string;
}

export interface DbCollection {
  name: string;
  count: number;
}

export interface DbTable {
  table: string;
  count: number;
  limit: number;
  skip: number;
  documents: Array<Record<string, unknown>>;
}

export const EMPTY_ADDRESS: CustomerAddress = {
  phone: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
};

export const DEFAULT_SETTINGS: Settings = {
  id: "",
  shopName: "Amare Handmades",
  tagline: "Handmade with Love ♥",
  primaryColor: "pink",
  backgroundStyle: "light",
  colorScheme: "light",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  phone: "",
  email: "",
  gstin: "",
  whatsapp: "",
  upiId: "",
  upiEnabled: true,
  currency: "INR",
  dateFormat: "DD MMM YYYY",
  invoicePrefix: "AM-",
  invoiceFooter: "Thank you!",
};

export const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Other",
] as const;

export const EXPENSE_TYPES = [
  "Materials",
  "Packaging",
  "Shipping",
  "Marketing",
  "Equipment",
  "Rent",
  "Salary",
  "Utilities",
  "Other",
] as const;
