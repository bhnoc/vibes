'use strict';

var log = require('./log.js');

"use strict";
function afterActiveInstanceBlur() {
  log.log("info", "lifecycle::afterActiveInstanceBlur");
}

exports.afterActiveInstanceBlur = afterActiveInstanceBlur;
//# sourceMappingURL=afterActiveInstanceBlur.js.map
