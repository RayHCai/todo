import type { IsoDate } from "../../lib/dates";

/** `YYYY-MM-DD` strings compare correctly as text. */
export const maxIso = (a: IsoDate, b: IsoDate): IsoDate => (a > b ? a : b);
