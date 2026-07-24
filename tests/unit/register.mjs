// Node test-runner resolver: lets extensionless relative imports in app/lib
// TypeScript resolve to their .ts files under --experimental-strip-types,
// so source modules can stay Vite-native (no import extensions).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        try {
          return nextResolve(`${specifier}.ts`, context);
        } catch {
          throw error;
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
