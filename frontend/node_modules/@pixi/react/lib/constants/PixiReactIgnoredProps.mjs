import { PixiToReactEventPropNames } from './EventPropNames.mjs';

"use strict";
const PixiReactIgnoredProps = Object.freeze([
  ...Object.keys(PixiToReactEventPropNames),
  "draw"
]);

export { PixiReactIgnoredProps };
//# sourceMappingURL=PixiReactIgnoredProps.mjs.map
