'use strict';

var log = require('./log.js');

"use strict";
function beforeActiveInstanceBlur() {
  log.log("info", "lifecycle::beforeActiveInstanceBlur");
}

exports.beforeActiveInstanceBlur = beforeActiveInstanceBlur;
//# sourceMappingURL=beforeActiveInstanceBlur.js.map
