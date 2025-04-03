'use strict';

var EventPropNames = require('../constants/EventPropNames.js');
var compare = require('./compare.js');
var gentleCloneProps = require('./gentleCloneProps.js');

"use strict";
const DEFAULT = "__default";
function diffProps(newProps, oldProps = {}, remove = false) {
  const newPropsRest = gentleCloneProps.gentleCloneProps(newProps);
  const oldPropsRest = gentleCloneProps.gentleCloneProps(oldProps);
  const entries = Object.entries(newPropsRest);
  const changes = [];
  if (remove) {
    const oldPropsKeys = Object.keys(oldPropsRest);
    let propIndex = 0;
    while (propIndex < oldPropsKeys.length) {
      const propKey = oldPropsKeys[propIndex];
      const isPropRemoved = !(propKey in newPropsRest);
      if (isPropRemoved) {
        entries.unshift([propKey, `${DEFAULT}remove`]);
      }
      propIndex += 1;
    }
  }
  entries.forEach(([key, value]) => {
    if (compare.isEqual(value, oldPropsRest[key])) {
      return;
    }
    if (key in EventPropNames.ReactToPixiEventPropNames) {
      changes.push([key, value, true, []]);
      return;
    }
    let entries2 = [];
    if (key.includes("-")) {
      entries2 = key.split("-");
    }
    changes.push([key, value, false, entries2]);
    for (const prop in newPropsRest) {
      const value2 = newPropsRest[prop];
      if (prop.startsWith(`${key}-`)) {
        changes.push([prop, value2, false, prop.split("-")]);
      }
    }
  });
  return { changes };
}

exports.diffProps = diffProps;
//# sourceMappingURL=diffProps.js.map
