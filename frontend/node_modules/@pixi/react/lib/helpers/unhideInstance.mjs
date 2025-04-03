import { Container, Filter } from 'pixi.js';

"use strict";
function unhideInstance(instance) {
  if (instance instanceof Container) {
    instance.visible = true;
  } else if (instance instanceof Filter) {
    instance.enabled = true;
  }
}

export { unhideInstance };
//# sourceMappingURL=unhideInstance.mjs.map
