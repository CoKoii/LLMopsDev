import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getDatabaseEnvironment } from "../config/env";
import { getDatabaseDriver } from "./database-driver.registry";
import type { DatabaseErrorMessages } from "./database.types";

@Injectable()
export class DatabaseErrorMapper {
  constructor(private readonly configService: ConfigService) {}

  rethrow(error: unknown, messages: DatabaseErrorMessages): never {
    const databaseEnvironment = getDatabaseEnvironment(this.configService);
    return getDatabaseDriver(databaseEnvironment.type).rethrowError(
      error,
      messages,
    );
  }
}
