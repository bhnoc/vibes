'use strict';

var pixi_js = require('pixi.js');
var attach = require('./attach.js');
var detach = require('./detach.js');
var invariant = require('./invariant.js');
var log = require('./log.js');

"use strict";
function insertBefore(parentInstance, childInstance, beforeChildInstance) {
  log.log("info", "lifecycle::insertBefore");
  invariant.invariant(childInstance !== beforeChildInstance, "Cannot insert node before itself");
  if (childInstance instanceof pixi_js.Container) {
    const childContainerInstance = childInstance;
    const childContainer = childInstance;
    const beforeChildContainer = beforeChildInstance;
    if (childContainerInstance.parent === parentInstance) {
      parentInstance.removeChild(childContainer);
    }
    const index = parentInstance.getChildIndex(beforeChildContainer);
    parentInstance.addChildAt(childContainer, index);
  } else if (childInstance instanceof pixi_js.Filter) {
    const childFilterInstance = childInstance;
    const instanceState = childFilterInstance.__pixireact;
    const targetIndex = instanceState.filters.indexOf(beforeChildInstance);
    detach.detach(childInstance);
    attach.attach(parentInstance, childInstance, targetIndex);
  }
}

exports.insertBefore = insertBefore;
//# sourceMappingURL=insertBefore.js.map
