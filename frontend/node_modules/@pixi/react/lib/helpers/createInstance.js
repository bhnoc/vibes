'use strict';

var EventPropNames = require('../constants/EventPropNames.js');
var PixiReactIgnoredProps = require('../constants/PixiReactIgnoredProps.js');
var applyProps = require('./applyProps.js');
var catalogue = require('./catalogue.js');
var convertStringToPascalCase = require('./convertStringToPascalCase.js');
var gentleCloneProps = require('./gentleCloneProps.js');
var log = require('./log.js');
var parseComponentType = require('./parseComponentType.js');
var prepareInstance = require('./prepareInstance.js');

"use strict";
function createInstance(type, props, root) {
  log.log("info", "lifecycle::createInstance");
  const parsedType = parseComponentType.parseComponentType(type);
  const name = convertStringToPascalCase.convertStringToPascalCase(parsedType);
  if (!(name in catalogue.catalogue)) {
    throw new Error(`${name} is not part of the PIXI namespace! Did you forget to extend?`);
  }
  const PixiComponent = catalogue.catalogue[name];
  const pixiProps = gentleCloneProps.gentleCloneProps(props, PixiReactIgnoredProps.PixiReactIgnoredProps);
  Object.entries(props).forEach(([key, value]) => {
    if (key in EventPropNames.ReactToPixiEventPropNames) {
      const pixiEventName = EventPropNames.ReactToPixiEventPropNames[key];
      pixiProps[pixiEventName] = value;
    }
  });
  const instance = prepareInstance.prepareInstance(new PixiComponent(pixiProps), {
    root,
    type: parsedType
  });
  applyProps.applyProps(instance, props);
  return instance;
}

exports.createInstance = createInstance;
//# sourceMappingURL=createInstance.js.map
