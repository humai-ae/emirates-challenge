import { SetMetadata } from "@nestjs/common";

export const ALLOW_DURING_PASSWORD_CHANGE_KEY = "hrcc:allow-during-password-change";

/** Lets a user who must change their password call this route. */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);
