import { useMemo } from 'react';
import { extend } from '../helpers/extend.mjs';

"use strict";
function useExtend(objects) {
  useMemo(() => {
    extend(objects);
  }, [objects]);
}

export { useExtend };
//# sourceMappingURL=useExtend.mjs.map
