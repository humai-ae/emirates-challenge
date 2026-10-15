/** The same shape as the English resource, with every leaf widened to `string`. */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
};
