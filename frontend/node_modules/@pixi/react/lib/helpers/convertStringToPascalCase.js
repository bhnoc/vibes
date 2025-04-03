'use strict';

"use strict";
function convertStringToPascalCase(string) {
  const firstChar = string.charAt(0);
  const rest = string.substring(1);
  return `${firstChar.toUpperCase()}${rest}`;
}

exports.convertStringToPascalCase = convertStringToPascalCase;
//# sourceMappingURL=convertStringToPascalCase.js.map
