'use strict';

var pixi_js = require('pixi.js');

"use strict";
function unhideInstance(instance) {
  if (instance instanceof pixi_js.Container) {
    instance.visible = true;
  } else if (instance instanceof pixi_js.Filter) {
    instance.enabled = true;
  }
}

exports.unhideInstance = unhideInstance;
//# sourceMappingURL=unhideInstance.js.map
