/**
 * Stub for @emotion/is-prop-valid — not installed in this project.
 * framer-motion's filter-props.mjs does:
 *   try { loadExternalIsValidProp(require("@emotion/is-prop-valid").default) } catch {}
 * The try/catch handles the missing module, but in a browser ESM context the
 * bare require() throws ReferenceError before the catch runs.
 * This stub satisfies the import so framer-motion uses its own built-in prop
 * filter list instead of the emotion one (identical behaviour for our use case).
 */
const isValidProp = (_prop: string): boolean => true;
export default isValidProp;
