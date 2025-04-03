import { Container, Filter } from 'pixi.js';

"use strict";
function hideInstance(instance) {
  if (instance instanceof Container) {
    instance.visible = false;
  } else if (instance instanceof Filter) {
    instance.enabled = false;
  }
}

export { hideInstance };
//# sourceMappingURL=hideInstance.mjs.map
