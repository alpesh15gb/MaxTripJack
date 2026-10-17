// Next's bundler normally selects its server navigation entry. Standalone Node
// workers need the same selection when using the react-server condition.
import { registerHooks } from "node:module";
registerHooks({resolve(specifier,context,nextResolve){
 return nextResolve(specifier==="next/navigation"?"next/dist/api/navigation.react-server.js":specifier,context);
}});
