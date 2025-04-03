import { Application } from 'pixi.js';
import { useContext } from 'react';
import { Context } from '../components/Context.mjs';
import { invariant } from '../helpers/invariant.mjs';

"use strict";
function useApplication() {
  const appContext = useContext(Context);
  invariant(
    appContext.app instanceof Application,
    "No Context found with `%s`. Make sure to wrap component with `%s`",
    "Application",
    "AppProvider"
  );
  return appContext;
}

export { useApplication };
//# sourceMappingURL=useApplication.mjs.map
