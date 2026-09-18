import { Injectable } from "@nestjs/common";
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from "typeorm";
import { RequestContextService } from "../request-context/request-context.service";
import { AuditableEntity } from "./base.entity";

const isAuditableEntity = (entity: unknown): entity is AuditableEntity =>
  entity instanceof AuditableEntity;

@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly requestContext: RequestContextService,
  ) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<unknown>) {
    const userId = this.requestContext.getUserId();
    if (!userId || !isAuditableEntity(event.entity)) {
      return;
    }

    event.entity.createdBy ??= userId;
    event.entity.updatedBy ??= userId;
  }

  beforeUpdate(event: UpdateEvent<unknown>) {
    const userId = this.requestContext.getUserId();
    if (!userId || !isAuditableEntity(event.entity)) {
      return;
    }

    event.entity.updatedBy = userId;
  }

  async beforeSoftRemove(event: SoftRemoveEvent<unknown>) {
    const userId = this.requestContext.getUserId();
    if (!userId || !isAuditableEntity(event.entity)) {
      return;
    }

    event.entity.updatedBy = userId;
    const entityId = event.metadata.getEntityIdMap(event.entity);
    if (!entityId) {
      return;
    }

    await event.manager.update(event.metadata.target, entityId, {
      updatedBy: userId,
    });
  }
}
