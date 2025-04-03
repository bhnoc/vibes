import { Container, Filter } from 'pixi.js';
import { attach } from './attach.mjs';
import { log } from './log.mjs';

"use strict";
function appendChild(parentNode, childNode) {
  log("info", "lifecycle::appendChild");
  if (!childNode) {
    return;
  }
  if (childNode instanceof Container) {
    parentNode.addChild(childNode);
  } else if (childNode instanceof Filter) {
    attach(parentNode, childNode);
  }
}

export { appendChild };
//# sourceMappingURL=appendChild.mjs.map
