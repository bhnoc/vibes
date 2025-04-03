'use strict';

var pixi_js = require('pixi.js');
var detach = require('./detach.js');
var log = require('./log.js');

"use strict";
function removeChild(_parentInstance, childInstance) {
  log.log("info", "lifecycle::removeChild");
  if (childInstance instanceof pixi_js.Filter) {
    detach.detach(childInstance);
  }
  childInstance.destroy();
}

exports.removeChild = removeChild;
//# sourceMappingURL=removeChild.js.map
