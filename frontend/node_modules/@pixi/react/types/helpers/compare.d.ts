/** Whether the input is an array. */
export declare function isArray(input: any): input is [];
/** Whether the input is a boolean. */
export declare function isBoolean(input: any): input is boolean;
/** Whether the inputs are equal. */
export declare function isEqual(inputA: any, inputB: any, options?: {
    arrays?: 'reference' | 'shallow';
    objects?: 'reference' | 'shallow';
    strict?: boolean;
}): boolean;
/** Whether the input is a function. */
export declare function isFunction(input: any): input is (...args: any) => any;
/** Whether the input is null. */
export declare function isNull(input: any): input is null;
/** Whether the input is a number. */
export declare function isNumber(input: any): input is number;
/** Whether the input is an object. */
export declare function isObject(input: any): input is Record<string, unknown>;
/** Whether the input is a string. */
export declare function isString(input: any): input is string;
/** Whether the input is undefined. */
export declare function isUndefined(input: any): input is undefined;
