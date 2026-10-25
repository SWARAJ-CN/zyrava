import { shell } from "./shell";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { sales } from "./sales";
import { expenses } from "./expenses";
import { products } from "./products";
import { tools } from "./tools";
import { developer } from "./developer";
import { settings } from "./settings";

/**
 * The master copy of every string in the app.
 *
 * `MessageKey` is the set of keys a translation has to cover — the other
 * languages are typed against it, so a missing translation is a build error
 * rather than a surprise in production.
 */
export const en = {
  ...shell,
  ...common,
  ...dashboard,
  ...sales,
  ...expenses,
  ...products,
  ...tools,
  ...developer,
  ...settings,
};

export type MessageKey = keyof typeof en;

export { shell, common, dashboard, sales, expenses, products, tools, developer, settings };
