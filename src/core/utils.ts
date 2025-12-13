import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { z } from "zod";

export const env = z
  .object({
    SERVICE: z.string(),
  })
  .parse(process.env);

export const logger = new Logger({ serviceName: env.SERVICE });
export const tracer = new Tracer({ serviceName: env.SERVICE });
