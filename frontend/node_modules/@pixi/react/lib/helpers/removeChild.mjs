import { Filter } from 'pixi.js';
import { detach } from './detach.mjs';
import { log } from './log.mjs';

"use strict";
function removeChild(_parentInstance, childInstance) {
  log("info", "lifecycle::removeChild");
  if (childInstance instanceof Filter) {
    detach(childInstance);
  }
  childInstance.destroy();
}

export { removeChild };
//# sourceMappingURL=removeChild.mjs.map
