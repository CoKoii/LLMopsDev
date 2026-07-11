import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "app:auth:isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
