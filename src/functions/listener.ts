import { EventBridgeEvent } from "aws-lambda";
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
} from "vimo-events";
import { Employee } from "../core/employee";
import { logger } from "../core/utils";

export const handler = async (
  event: EventBridgeEvent<string, unknown>,
) => {
  switch (event["detail-type"]) {
    case EmployeeCreatedEvent.type: {
      const parsed = EmployeeCreatedEvent.parse(event.detail);
      await Employee.update({
        agencyId: parsed.data.agencyId,
        email: parsed.data.email,
        firstname: parsed.data.given_name,
        lastname: parsed.data.family_name,
        oplock: parsed.timestamp,
        latched: true,
      });
      break;
    }
    case EmployeeDeletedEvent.type: {
      const parsed = EmployeeDeletedEvent.parse(event.detail);
      await Employee.del(parsed.data.agencyId, parsed.data.email);
      break;
    }
    default:
      logger.warn("Ignoring unsupported event type", {
        detailType: event["detail-type"],
      });
  }

  return { ok: true };
};
