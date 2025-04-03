import { ReactIgnoredProps } from '../constants/ReactIgnoredProps.mjs';
import { gentleClone } from './gentleClone.mjs';

"use strict";
function gentleCloneProps(props, additionalIgnoredProps = []) {
  return gentleClone(props, ReactIgnoredProps.concat(additionalIgnoredProps));
}

export { gentleCloneProps };
//# sourceMappingURL=gentleCloneProps.mjs.map
