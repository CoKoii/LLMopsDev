import { ChatOpenAI } from "@langchain/openai";
import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createAgent, tool } from "langchain";
import { Readable } from "node:stream";
import * as z from "zod";
import { getAiEnvironment } from "../../common/config/env";
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly chatModel: ChatOpenAI;
  private readonly getWeather = tool(
    (input) => `${input.city} 的天气一直是晴天！`,
    {
      name: "get_weather",
      description: "查询指定城市的天气",
      schema: z.object({
        city: z.string().describe("要查询天气的城市"),
      }),
    },
  );
  private readonly Answer = z.object({
    answer: z.string().describe("AI 的回答"),
  });
  constructor(configService: ConfigService) {
    const aiEnvironment = getAiEnvironment(configService);
    this.chatModel = new ChatOpenAI({
      apiKey: aiEnvironment.apiKey,
      model: aiEnvironment.chatModel,
      maxRetries: 1,
      temperature: aiEnvironment.temperature,
      configuration: aiEnvironment.baseUrl
        ? { baseURL: aiEnvironment.baseUrl }
        : undefined,
    });
  }
  // --------------------------------------------------------------------------------------------------
  // 学习测试用
  async learn(message: string) {
    try {
      const agent = createAgent({
        model: this.chatModel,
        tools: [this.getWeather],
        responseFormat: this.Answer,
      });

      const response = await agent.invoke({
        messages: [
          { role: "system", content: "你是一个简洁、准确的 AI 助手。" },
          { role: "user", content: message },
        ],
      });

      return {
        messages: response.structuredResponse,
      };
    } catch (error) {
      throw new BadGatewayException("AI 服务请求失败", { cause: error });
    }
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 发起普通对话
  async chat(message: string) {
    try {
      const response = await this.chatModel.invoke([
        ["system", "你是一个简洁、准确的 AI 助手。"],
        ["human", message],
      ]);

      return {
        content: response.text,
      };
    } catch (error) {
      throw new BadGatewayException("AI 服务请求失败", { cause: error });
    }
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 创建流式对话响应
  createChatSseStream(message: string): Readable {
    return Readable.from(this.streamChat(message));
  }

  private async *streamChat(message: string): AsyncGenerator<string> {
    try {
      const stream = await this.chatModel.stream([
        ["system", "你是一个简洁、准确的 AI 助手。"],
        ["human", message],
      ]);

      for await (const chunk of stream) {
        if (chunk.text) {
          yield `data: ${JSON.stringify({ content: chunk.text })}\n\n`;
        }
      }

      yield "data: [DONE]\n\n";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`AI 流式服务请求失败: ${message}`, stack);
      yield `event: error\ndata: ${JSON.stringify({ message: "AI 服务请求失败" })}\n\n`;
    }
  }
  // --------------------------------------------------------------------------------------------------
}
