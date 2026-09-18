import { IsInt, Min } from "class-validator";

export class TranscribeAppAudioDto {
  @IsInt({ message: "音频文件ID必须是整数" })
  @Min(1, { message: "音频文件ID必须大于0" })
  fileId!: number;
}
