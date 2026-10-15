import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "hrcc:public";

/** Skips the session guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
