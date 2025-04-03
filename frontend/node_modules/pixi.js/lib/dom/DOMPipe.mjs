import { ExtensionType } from '../extensions/Extensions.mjs';

"use strict";
class DOMPipe {
  /**
   * Constructor for the DOMPipe class.
   * @param renderer - The renderer instance that this DOMPipe will be associated with.
   */
  constructor(renderer) {
    this._destroyRenderableBound = this.destroyRenderable.bind(this);
    /** Array to keep track of attached DOM elements */
    this._attachedDomElements = [];
    this._renderer = renderer;
    this._renderer.runners.postrender.add(this);
    this._domElement = document.createElement("div");
    this._domElement.style.position = "absolute";
    this._domElement.style.top = "0";
    this._domElement.style.left = "0";
    this._domElement.style.pointerEvents = "none";
    this._domElement.style.zIndex = "1000";
  }
  /**
   * Adds a renderable DOM container to the list of attached elements.
   * @param domContainer - The DOM container to be added.
   * @param _instructionSet - The instruction set (unused).
   */
  addRenderable(domContainer, _instructionSet) {
    if (!this._attachedDomElements.includes(domContainer)) {
      this._attachedDomElements.push(domContainer);
      domContainer.on("destroyed", this._destroyRenderableBound);
    }
  }
  /**
   * Updates a renderable DOM container.
   * @param _domContainer - The DOM container to be updated (unused).
   */
  updateRenderable(_domContainer) {
  }
  /**
   * Validates a renderable DOM container.
   * @param _domContainer - The DOM container to be validated (unused).
   * @returns Always returns true as validation is not required.
   */
  validateRenderable(_domContainer) {
    return true;
  }
  /**
   * Destroys a renderable DOM container, removing it from the list of attached elements.
   * @param domContainer - The DOM container to be destroyed.
   */
  destroyRenderable(domContainer) {
    const index = this._attachedDomElements.indexOf(domContainer);
    if (index !== -1) {
      this._attachedDomElements.splice(index, 1);
    }
    domContainer.off("destroyed", this._destroyRenderableBound);
  }
  /** Handles the post-rendering process, ensuring DOM elements are correctly positioned and visible. */
  postrender() {
    const attachedDomElements = this._attachedDomElements;
    if (attachedDomElements.length === 0) {
      this._domElement.remove();
      return;
    }
    const canvas = this._renderer.view.canvas;
    if (this._domElement.parentNode !== canvas.parentNode) {
      canvas.parentNode?.appendChild(this._domElement);
    }
    this._domElement.style.transform = `translate(${canvas.offsetLeft}px, ${canvas.offsetTop}px)`;
    for (let i = 0; i < attachedDomElements.length; i++) {
      const domContainer = attachedDomElements[i];
      const element = domContainer.element;
      if (!domContainer.parent || domContainer.globalDisplayStatus < 7) {
        element.remove();
        attachedDomElements.splice(i, 1);
        i--;
      } else {
        if (!this._domElement.contains(element)) {
          element.style.position = "absolute";
          element.style.pointerEvents = "auto";
          this._domElement.appendChild(element);
        }
        const wt = domContainer.worldTransform;
        const anchor = domContainer._anchor;
        const ax = domContainer.width * anchor.x;
        const ay = domContainer.height * anchor.y;
        element.style.transformOrigin = `${ax}px ${ay}px`;
        element.style.transform = `matrix(${wt.a}, ${wt.b}, ${wt.c}, ${wt.d}, ${wt.tx - ax}, ${wt.ty - ay})`;
        element.style.opacity = domContainer.groupAlpha.toString();
      }
    }
  }
  /** Destroys the DOMPipe, removing all attached DOM elements and cleaning up resources. */
  destroy() {
    this._renderer.runners.postrender.remove(this);
    for (let i = 0; i < this._attachedDomElements.length; i++) {
      const domContainer = this._attachedDomElements[i];
      domContainer.off("destroyed", this._destroyRenderableBound);
      domContainer.element.remove();
    }
    this._attachedDomElements.length = 0;
    this._domElement.remove();
    this._renderer = null;
  }
}
/**
 * Static property defining the extension type and name for the DOMPipe.
 * This is used to register the DOMPipe with different rendering pipelines.
 */
DOMPipe.extension = {
  type: [
    ExtensionType.WebGLPipes,
    ExtensionType.WebGPUPipes,
    ExtensionType.CanvasPipes
  ],
  name: "dom"
};

export { DOMPipe };
//# sourceMappingURL=DOMPipe.mjs.map
