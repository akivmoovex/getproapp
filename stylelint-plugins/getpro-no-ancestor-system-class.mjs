import stylelint from "stylelint";
import selectorParser from "postcss-selector-parser";

const ruleName = "getpro/no-ancestor-before-system-class";

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (selector) =>
    `Do not target a system component root after a non-system ancestor (use only .c-* roots or system parents): "${selector}"`,
});

function isSystemClassName(value) {
  return (
    value === "c-search-bar" ||
    value.startsWith("c-search-bar-") ||
    value === "c-button" ||
    value.startsWith("c-button--") ||
    value === "c-input" ||
    value.startsWith("c-input--") ||
    value === "c-card" ||
    value.startsWith("c-card__") ||
    value.startsWith("c-card--")
  );
}

function compoundHasSystemRoot(nodes) {
  return nodes.some((n) => n.type === "class" && isSystemClassName(n.value));
}

/** True if compound is only system classes / harmless glue (no page/feature roots). */
function isSystemOnlyCompound(nodes) {
  for (const n of nodes) {
    if (n.type === "class" && isSystemClassName(n.value)) continue;
    if (n.type === "class") return false;
    if (n.type === "comment") continue;
    if (n.type === "combinator") continue;
    if (n.type === "universal") continue;
    if (n.type === "tag" && (n.value === "html" || n.value === "body")) continue;
    if (n.type === "pseudo" && (n.value === ":root" || n.value === "::root")) continue;
    return false;
  }
  return true;
}

function splitSelectorIntoCompounds(selector) {
  const compounds = [];
  let current = [];
  selector.each((node) => {
    if (node.type === "combinator") {
      compounds.push(current);
      current = [];
    } else {
      current.push(node);
    }
  });
  compounds.push(current);
  return compounds;
}

function checkSelectorString(selectorString, reportFn) {
  let ast;
  try {
    ast = selectorParser().astSync(selectorString);
  } catch {
    return;
  }

  ast.each((selector) => {
    const compounds = splitSelectorIntoCompounds(selector);
    compounds.forEach((compound, i) => {
      if (!compoundHasSystemRoot(compound)) return;
      if (i === 0) return;
      if (!isSystemOnlyCompound(compounds[i - 1])) {
        reportFn(selectorString.trim());
      }
    });
  });
}

const plugin = stylelint.createPlugin(ruleName, () => (root, result) => {
  root.walkRules((rule) => {
    const raw = rule.selector;
    if (!raw || raw.includes("/*")) return;

    checkSelectorString(raw, (bad) => {
      stylelint.utils.report({
        result,
        ruleName,
        message: messages.rejected(bad),
        node: rule,
        word: bad,
      });
    });
  });
});

plugin.ruleName = ruleName;

export default plugin;
