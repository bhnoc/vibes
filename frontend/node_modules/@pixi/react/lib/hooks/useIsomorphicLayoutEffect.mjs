import { useLayoutEffect, useEffect } from 'react';

"use strict";
const useIsomorphicLayoutEffect = typeof window !== "undefined" && (window.document?.createElement || window.navigator?.product === "ReactNative") ? useLayoutEffect : useEffect;

export { useIsomorphicLayoutEffect };
//# sourceMappingURL=useIsomorphicLayoutEffect.mjs.map
