// Process shim for mobile compatibility.
const globalProcess =
  typeof globalThis !== "undefined" &&
  (globalThis).process &&
  typeof (globalThis).process === "object"
    ? (globalThis).process
    : null;

export const process =
  globalProcess && globalProcess.env
    ? globalProcess
    : {
        env: {
          NODE_ENV: "production",
        },
        platform: "browser",
        version: "",
        versions: {},
        browser: true,
        argv: [],
        stderr: { write: () => {} },
        stdout: { write: () => {} },
        nextTick: (fn) => setTimeout(fn, 0),
        emit: () => {},
        on: () => {},
        once: () => {},
        off: () => {},
        cwd: () => "/",
      };
