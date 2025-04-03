import { extend } from '../helpers/extend';
/** Expose Pixi.js components for use in JSX. */
export declare function useExtend(
/** @description The Pixi.js components to be exposed. */
objects: Parameters<typeof extend>[0]): void;
