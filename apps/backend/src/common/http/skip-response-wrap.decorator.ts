import { SetMetadata } from "@nestjs/common";

export const SKIP_RESPONSE_WRAP_KEY = "app:http:skipResponseWrap";

export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
