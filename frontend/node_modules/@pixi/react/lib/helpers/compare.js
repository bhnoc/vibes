'use strict';

"use strict";
function isArray(input) {
  return Array.isArray(input);
}
function isBoolean(input) {
  return typeof input === "boolean";
}
function isEqual(inputA, inputB, options = {
  arrays: "reference",
  objects: "reference",
  strict: true
}) {
  const {
    arrays,
    objects,
    strict
  } = options;
  if (typeof inputA !== typeof inputB || !!inputA !== !!inputB) {
    return false;
  }
  if (isString(inputA) || isNumber(inputA)) {
    return inputA === inputB;
  }
  const isInputAAnObject = isObject(inputA);
  if (isInputAAnObject && objects === "reference") {
    return inputA === inputB;
  }
  const isInputAAnArray = isArray(inputA);
  if (isInputAAnArray && arrays === "reference") {
    return inputA === inputB;
  }
  if ((isInputAAnArray || isInputAAnObject) && inputA === inputB) {
    return true;
  }
  let key;
  for (key in inputA) {
    if (!(key in inputB)) {
      return false;
    }
  }
  let input = inputA;
  if (strict) {
    input = inputB;
  }
  if (isInputAAnObject && arrays === "shallow" && objects === "shallow") {
    for (key in input) {
      const equalityCheckResult = isEqual(inputA[key], inputB[key], {
        strict,
        objects: "reference"
      });
      if (!equalityCheckResult) {
        return false;
      }
    }
  } else {
    for (key in input) {
      if (inputA[key] !== inputB[key]) {
        return false;
      }
    }
  }
  if (isUndefined(key)) {
    if (isInputAAnArray && inputA.length === 0 && inputB.length === 0) {
      return true;
    }
    if (isInputAAnObject && Object.keys(inputA).length === 0 && Object.keys(inputB).length === 0) {
      return true;
    }
    if (inputA !== inputB) {
      return false;
    }
  }
  return true;
}
function isFunction(input) {
  return typeof input === "function";
}
function isNull(input) {
  return input === null;
}
function isNumber(input) {
  return typeof input === "number";
}
function isObject(input) {
  if (input !== Object(input)) {
    return false;
  }
  if (isArray(input)) {
    return false;
  }
  if (typeof input === "function") {
    return false;
  }
  return true;
}
function isString(input) {
  return typeof input === "string";
}
function isUndefined(input) {
  return input === void 0;
}

exports.isArray = isArray;
exports.isBoolean = isBoolean;
exports.isEqual = isEqual;
exports.isFunction = isFunction;
exports.isNull = isNull;
exports.isNumber = isNumber;
exports.isObject = isObject;
exports.isString = isString;
exports.isUndefined = isUndefined;
//# sourceMappingURL=compare.js.map
