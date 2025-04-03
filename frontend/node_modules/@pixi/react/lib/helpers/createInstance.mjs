import { ReactToPixiEventPropNames } from '../constants/EventPropNames.mjs';
import { PixiReactIgnoredProps } from '../constants/PixiReactIgnoredProps.mjs';
import { applyProps } from './applyProps.mjs';
import { catalogue } from './catalogue.mjs';
import { convertStringToPascalCase } from './convertStringToPascalCase.mjs';
import { gentleCloneProps } from './gentleCloneProps.mjs';
import { log } from './log.mjs';
import { parseComponentType } from './parseComponentType.mjs';
import { prepareInstance } from './prepareInstance.mjs';

"use strict";
function createInstance(type, props, root) {
  log("info", "lifecycle::createInstance");
  const parsedType = parseComponentType(type);
  const name = convertStringToPascalCase(parsedType);
  if (!(name in catalogue)) {
    throw new Error(`${name} is not part of the PIXI namespace! Did you forget to extend?`);
  }
  const PixiComponent = catalogue[name];
  const pixiProps = gentleCloneProps(props, PixiReactIgnoredProps);
  Object.entries(props).forEach(([key, value]) => {
    if (key in ReactToPixiEventPropNames) {
      const pixiEventName = ReactToPixiEventPropNames[key];
      pixiProps[pixiEventName] = value;
    }
  });
  const instance = prepareInstance(new PixiComponent(pixiProps), {
    root,
    type: parsedType
  });
  applyProps(instance, props);
  return instance;
}

export { createInstance };
//# sourceMappingURL=createInstance.mjs.map
