import { ReactToPixiEventPropNames } from '../constants/EventPropNames.mjs';
import { isEqual } from './compare.mjs';
import { gentleCloneProps } from './gentleCloneProps.mjs';

"use strict";
const DEFAULT = "__default";
function diffProps(newProps, oldProps = {}, remove = false) {
  const newPropsRest = gentleCloneProps(newProps);
  const oldPropsRest = gentleCloneProps(oldProps);
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
    if (isEqual(value, oldPropsRest[key])) {
      return;
    }
    if (key in ReactToPixiEventPropNames) {
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

export { diffProps };
//# sourceMappingURL=diffProps.mjs.map
