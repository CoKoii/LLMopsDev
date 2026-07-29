import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SynthesizeAppSpeechDto {
  @IsString({ message: "语音文本必须是字符串" })
  @IsNotEmpty({ message: "语音文本不能为空" })
  @MaxLength(4000, { message: "语音文本不能超过4000个字符" })
  text!: string;
}
