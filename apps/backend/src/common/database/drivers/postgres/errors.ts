import { BadRequestException, ConflictException } from "@nestjs/common";
import type { DatabaseErrorMessages } from "../../database.types";

type PostgresError = {
  code?: string;
  detail?: string;
  message?: string;
};

const toPostgresError = (error: unknown): PostgresError | null => {
  if (!error || typeof error !== "object") {
    return null;
  }
  return error as PostgresError;
};

const isPostgresError = (error: unknown, code: string) =>
  toPostgresError(error)?.code === code;

const hasErrorText = (error: unknown, text: string) => {
  const candidate = toPostgresError(error);
  if (!candidate) return false;

  const message = `${candidate.detail ?? ""} ${candidate.message ?? ""}`
    .trim()
    .toLowerCase();

  return message.includes(text);
};

const isForeignKeyConstraintError = (
  error: unknown,
  kind: "reference" | "referenced",
) => {
  if (!isPostgresError(error, "23503")) {
    return false;
  }

  return kind === "reference"
    ? hasErrorText(error, "is not present") ||
        hasErrorText(error, "insert or update")
    : hasErrorText(error, "is still referenced") ||
        hasErrorText(error, "update or delete");
};

export const rethrowPostgresError = (
  error: unknown,
  messages: DatabaseErrorMessages,
): never => {
  if (messages.unique && isPostgresError(error, "23505")) {
    throw new ConflictException(messages.unique, { cause: error });
  }
  if (
    messages.foreignKeyConstraint &&
    isForeignKeyConstraintError(error, "reference")
  ) {
    throw new BadRequestException(messages.foreignKeyConstraint, {
      cause: error,
    });
  }
  if (
    messages.foreignKeyReferenced &&
    isForeignKeyConstraintError(error, "referenced")
  ) {
    throw new BadRequestException(messages.foreignKeyReferenced, {
      cause: error,
    });
  }
  if (messages.dataTooLong && isPostgresError(error, "22001")) {
    throw new BadRequestException(messages.dataTooLong, { cause: error });
  }
  if (messages.notNull && isPostgresError(error, "23502")) {
    throw new BadRequestException(messages.notNull, { cause: error });
  }
  if (messages.noDefaultValue && isPostgresError(error, "23502")) {
    throw new BadRequestException(messages.noDefaultValue, { cause: error });
  }
  if (messages.invalidValue && isPostgresError(error, "22P02")) {
    throw new BadRequestException(messages.invalidValue, { cause: error });
  }
  throw error;
};
