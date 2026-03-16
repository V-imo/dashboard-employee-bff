import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { EntityParser } from "dynamodb-toolbox";
import { EmployeeCreatedEvent, EmployeeDeletedEvent } from "vimo-events";
import { EmployeeEntity } from "../core/employee/employee.entity";
import { tracer } from "../core/utils";

const eventBridge = tracer.captureAWSv3Client(new EventBridgeClient());

export const handler = async (event: DynamoDBStreamEvent) => {
  await Promise.all(
    event.Records.map(async (record) => {
      const object = record.dynamodb?.NewImage || record.dynamodb?.OldImage;
      if (object?._et.S === EmployeeEntity.entityName) {
        const { item } = EmployeeEntity.build(EntityParser).parse(
          unmarshall(object as Record<string, any>),
        );
        if (item.latched) return;
        if (record.eventName === "INSERT") {
          await eventBridge.send(EmployeeCreatedEvent.build(item));
        } else if (record.eventName === "REMOVE") {
          await eventBridge.send(EmployeeDeletedEvent.build(item));
        }
      }
    }),
  );
};
