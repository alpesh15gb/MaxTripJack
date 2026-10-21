// Next's bundler normally selects its server navigation entry. Standalone Node
// workers need the same selection when using the react-server condition.
// Use the concrete CommonJS implementation: the API ESM facade re-exports an
// extensionless path that plain Node (without a bundler/tsx loader) cannot load.
import { registerHooks } from "node:module";
registerHooks({resolve(specifier,context,nextResolve){
 return nextResolve(specifier==="next/navigation"?"next/dist/client/components/navigation.react-server.js":specifier,context);
}});
