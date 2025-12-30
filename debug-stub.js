// Debug stub for mobile compatibility - returns no-op functions
function createDebug() {
  const noop = () => {};
  noop.enabled = false;
  noop.log = noop;
  noop.extend = () => noop;
  return noop;
}
createDebug.default = createDebug;
createDebug.debug = createDebug;
createDebug.enable = () => {};
createDebug.disable = () => {};
createDebug.enabled = () => false;
createDebug.humanize = () => "";
createDebug.formatters = {};
export default createDebug;
