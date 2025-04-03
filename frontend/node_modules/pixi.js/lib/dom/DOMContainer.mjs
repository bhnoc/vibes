import { Point } from '../maths/point/Point.mjs';
import { ViewContainer } from '../scene/view/ViewContainer.mjs';

"use strict";
class DOMContainer extends ViewContainer {
  /**
   * @param options - The options for creating the DOM container.
   */
  constructor(options = {}) {
    const { element, anchor, ...rest } = options;
    super({
      label: "DOMContainer",
      ...rest
    });
    /** @private */
    this.renderPipeId = "dom";
    /** @private */
    this.batched = false;
    this._anchor = new Point(0, 0);
    if (anchor) {
      this.anchor = anchor;
    }
    this.element = options.element || document.createElement("div");
  }
  /**
   * The anchor sets the origin point of the container.
   * The default is `(0,0)`, this means the container's origin is the top left.
   *
   * Setting the anchor to `(0.5,0.5)` means the container's origin is centered.
   * Setting the anchor to `(1,1)` would mean the container's origin point will be the bottom right corner.
   *
   * If you pass only single parameter, it will set both x and y to the same value as shown in the example below.
   */
  get anchor() {
    return this._anchor;
  }
  set anchor(value) {
    typeof value === "number" ? this._anchor.set(value) : this._anchor.copyFrom(value);
  }
  set element(value) {
    if (this._element === value)
      return;
    this._element = value;
    this.onViewUpdate();
  }
  /** The DOM element that this container is using. */
  get element() {
    return this._element;
  }
  /** @private */
  updateBounds() {
    const bounds = this._bounds;
    const element = this._element;
    if (!element) {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = 0;
      bounds.maxY = 0;
      return;
    }
    const { offsetWidth, offsetHeight } = element;
    bounds.minX = 0;
    bounds.maxX = offsetWidth;
    bounds.minY = 0;
    bounds.maxY = offsetHeight;
  }
  /**
   * Destroys this DOM container.
   * @param options - Options parameter. A boolean will act as if all options
   *  have been set to that value
   */
  destroy(options = false) {
    super.destroy(options);
    this._element?.parentNode?.removeChild(this._element);
    this._element = null;
    this._anchor = null;
  }
}

export { DOMContainer };
//# sourceMappingURL=DOMContainer.mjs.map
