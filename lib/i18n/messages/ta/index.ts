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
 * The language's dictionary, assembled from its message modules.
 */
export const ta = {
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

export { shell, common, dashboard, sales, expenses, products, tools, developer, settings };
