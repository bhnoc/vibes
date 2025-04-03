'use strict';

var ReactIgnoredProps = require('../constants/ReactIgnoredProps.js');
var gentleClone = require('./gentleClone.js');

"use strict";
function gentleCloneProps(props, additionalIgnoredProps = []) {
  return gentleClone.gentleClone(props, ReactIgnoredProps.ReactIgnoredProps.concat(additionalIgnoredProps));
}

exports.gentleCloneProps = gentleCloneProps;
//# sourceMappingURL=gentleCloneProps.js.map
