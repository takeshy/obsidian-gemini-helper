// Process shim for mobile compatibility.
const globalProcess =
  typeof globalThis !== "undefined" &&
  (globalThis).process &&
  typeof (globalThis).process === "object"
    ? (globalThis).process
    : null;

const hasNodeLikeProcess =
  !!globalProcess &&
  !!globalProcess.versions &&
  (typeof globalProcess.versions.node === "string" ||
    typeof globalProcess.versions.electron === "string");

export const process = hasNodeLikeProcess
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
