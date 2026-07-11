import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";
import { AuthSession } from "./auth-session.entity";

@Injectable()
export class AuthSessionCleanupService {
  private readonly logger = new Logger(AuthSessionCleanupService.name);
  private readonly cleanupBatchSize = 500;

  constructor(
    @InjectRepository(AuthSession)
    private readonly authSessions: Repository<AuthSession>,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 清理过期登录会话
  @Cron(CronExpression.EVERY_HOUR, {
    name: "auth-session-cleanup",
    waitForCompletion: true,
  })
  async cleanupExpiredSessions(): Promise<void> {
    const cleanupBefore = new Date();
    const startedAt = Date.now();
    let deletedCount = 0;

    while (true) {
      const deletedInBatch =
        await this.deleteExpiredSessionBatch(cleanupBefore);
      deletedCount += deletedInBatch;

      if (deletedInBatch < this.cleanupBatchSize) {
        break;
      }
    }

    this.logger.log(
      `已删除 ${deletedCount} 条过期登录会话，耗时 ${Date.now() - startedAt}ms`,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 分批删除过期登录会话
  private async deleteExpiredSessionBatch(
    cleanupBefore: Date,
  ): Promise<number> {
    const expiredSessions = await this.authSessions.find({
      select: { id: true },
      where: { expiresAt: LessThanOrEqual(cleanupBefore) },
      order: { expiresAt: "ASC" },
      take: this.cleanupBatchSize,
    });

    const expiredSessionIds = expiredSessions.map(({ id }) => id);
    if (expiredSessionIds.length === 0) {
      return 0;
    }

    await this.authSessions.delete(expiredSessionIds);
    return expiredSessionIds.length;
  }
  // --------------------------------------------------------------------------------------------------
}
