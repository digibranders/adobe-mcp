import { z } from "zod";

import type { JsonObject, JsonValue } from "../adapters/illustrator/bridge.js";

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(jsonValueSchema);
