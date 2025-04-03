'use strict';

var EventPropNames = require('./EventPropNames.js');

"use strict";
const PixiReactIgnoredProps = Object.freeze([
  ...Object.keys(EventPropNames.PixiToReactEventPropNames),
  "draw"
]);

exports.PixiReactIgnoredProps = PixiReactIgnoredProps;
//# sourceMappingURL=PixiReactIgnoredProps.js.map
