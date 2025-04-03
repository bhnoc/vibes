'use strict';

var pixi_js = require('pixi.js');
var attach = require('./attach.js');
var log = require('./log.js');

"use strict";
function appendChild(parentNode, childNode) {
  log.log("info", "lifecycle::appendChild");
  if (!childNode) {
    return;
  }
  if (childNode instanceof pixi_js.Container) {
    parentNode.addChild(childNode);
  } else if (childNode instanceof pixi_js.Filter) {
    attach.attach(parentNode, childNode);
  }
}

exports.appendChild = appendChild;
//# sourceMappingURL=appendChild.js.map
