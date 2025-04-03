import { Point } from '../maths/point/Point';
import { ViewContainer, type ViewContainerOptions } from '../scene/view/ViewContainer';
import type { PointData } from '../maths/point/PointData';
/**
 * Options for the {@link scene.DOMContainer} constructor.
 * @memberof scene
 */
export interface DOMContainerOptions extends ViewContainerOptions {
    /** The DOM element to use for the container. */
    element?: HTMLElement;
    /** The anchor point of the container. */
    anchor?: PointData | number;
}
/**
 * The DOMContainer object is used to render DOM elements within the PixiJS scene graph.
 * It allows you to integrate HTML elements into your PixiJS application.
 *
 * DOMContainer is especially useful for rendering standard DOM elements
 * that handle user input, such as `<input>` or `<textarea>`.
 * This is often simpler and more flexible than trying to implement text input
 * directly in PixiJS. For instance, if you need text fields or text areas,
 * you can embed them through this container for native browser text handling.
 *
 * --------- EXPERIMENTAL ---------
 *
 * This is a new API, things may change and it may not work as expected.
 * We want to hear your feedback as we go!
 *
 * --------------------------------
 * @example
 * ```js
 * import { DOMContainer } from 'pixi.js';
 *
 * const element = document.createElement('div');
 * element.innerHTML = 'Hello World!';
 *
 * const domContainer = new DOMContainer({ element });
 * ```
 * @memberof scene
 * @extends scene.ViewContainer
 */
export declare class DOMContainer extends ViewContainer {
    /** @private */
    readonly renderPipeId: string;
    /** @private */
    batched: boolean;
    /**
     * The anchor point of the container.
     * @private
     */
    readonly _anchor: Point;
    /** The DOM element that this container is using. */
    private _element;
    /**
     * @param options - The options for creating the DOM container.
     */
    constructor(options?: DOMContainerOptions);
    /**
     * The anchor sets the origin point of the container.
     * The default is `(0,0)`, this means the container's origin is the top left.
     *
     * Setting the anchor to `(0.5,0.5)` means the container's origin is centered.
     * Setting the anchor to `(1,1)` would mean the container's origin point will be the bottom right corner.
     *
     * If you pass only single parameter, it will set both x and y to the same value as shown in the example below.
     */
    get anchor(): Point;
    set anchor(value: PointData | number);
    set element(value: HTMLElement);
    /** The DOM element that this container is using. */
    get element(): HTMLElement;
    /** @private */
    protected updateBounds(): void;
    /**
     * Destroys this DOM container.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     */
    destroy(options?: boolean): void;
}
