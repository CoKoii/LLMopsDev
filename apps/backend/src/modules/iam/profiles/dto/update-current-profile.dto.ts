import { IsString, Length } from "class-validator";

export class UpdateCurrentProfileDto {
  @IsString({ message: "昵称必须为字符串" })
  @Length(1, 20, { message: "昵称长度应在$constraint1到$constraint2之间" })
  nickname!: string;
}
