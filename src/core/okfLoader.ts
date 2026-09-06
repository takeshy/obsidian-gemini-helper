// OKF bundle discovery and reading live in the shared library; this plugin only
// registers the help bundle it generates for itself.
import { configureBuiltinOkf } from "obsidian-llm-hub-common/skills";
import { BUILTIN_OKF_BUNDLE_ID, BUILTIN_OKF_BUNDLE_NAME, BUILTIN_OKF_DOCUMENTS } from "./builtinOkf";

configureBuiltinOkf({
  id: BUILTIN_OKF_BUNDLE_ID,
  name: BUILTIN_OKF_BUNDLE_NAME,
  documents: BUILTIN_OKF_DOCUMENTS,
});

export {
  getBuiltinOkfBundle,
  isBuiltinOkfBundleId,
  discoverOkfBundles,
  buildBuiltinOkfSystemPrompt,
  buildOkfSystemPrompt,
  readOkfDocument,
  type OkfBundle,
  type OkfDocument,
} from "obsidian-llm-hub-common/skills";
