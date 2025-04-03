"use strict";
function lowercaseFirstCharacter(_fullMatch, firstCharacter) {
  return firstCharacter.toLowerCase();
}
function parseComponentType(type) {
  let parsedType = type;
  if (type.startsWith("pixi")) {
    parsedType = type.replace(/^pixi([A-Z])/, lowercaseFirstCharacter);
  }
  return parsedType;
}

export { parseComponentType };
//# sourceMappingURL=parseComponentType.mjs.map
