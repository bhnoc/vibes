'use strict';

var pixi_js = require('pixi.js');

"use strict";
function hideInstance(instance) {
  if (instance instanceof pixi_js.Container) {
    instance.visible = false;
  } else if (instance instanceof pixi_js.Filter) {
    instance.enabled = false;
  }
}

exports.hideInstance = hideInstance;
//# sourceMappingURL=hideInstance.js.map
