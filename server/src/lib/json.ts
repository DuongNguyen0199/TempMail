import type { Prisma } from "@prisma/client";

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? item.toString() : item
  )) as Prisma.InputJsonValue;
}

export function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? item.toString() : item
  ));
}
