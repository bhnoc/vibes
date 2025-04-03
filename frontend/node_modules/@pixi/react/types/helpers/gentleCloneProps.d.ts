/** Clones a props object, excluding keys that are special to React and Pixi React. */
export declare function gentleCloneProps(props: Record<string, any>, additionalIgnoredProps?: readonly string[]): Record<string, any>;
