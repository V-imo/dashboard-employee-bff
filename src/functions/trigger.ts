import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBStreamEvent } from "aws-lambda";
import { EntityParser } from "dynamodb-toolbox";
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
  InspectorCreatedEvent,
  InspectorDeletedEvent,
} from "vimo-events";
import { EmployeeEntity } from "../core/employee/employee.entity";
import { InspectorEntity } from "../core/inspector/inspector.entity";
import { tracer } from "../core/utils";

const eventBridge = tracer.captureAWSv3Client(new EventBridgeClient());

export const handler = async (event: DynamoDBStreamEvent) => {
  await Promise.all(
    event.Records.map(async (record) => {
      const newImage = record.dynamodb?.NewImage;
      const oldImage = record.dynamodb?.OldImage;
      const object = newImage || oldImage;

      if (object?._et.S === EmployeeEntity.entityName) {
        const { item } = EmployeeEntity.build(EntityParser).parse(
          unmarshall(object as Record<string, any>),
        );

        if (item.latched) return;

        if (record.eventName === "INSERT" && !item.deleted) {
          await eventBridge.send(
            EmployeeCreatedEvent.build({
              agencyId: item.agencyId,
              email: item.email,
              given_name: item.firstname,
              family_name: item.lastname,
            }),
          );
        } else if (record.eventName === "MODIFY" && newImage && oldImage) {
          const { item: newItem } = EmployeeEntity.build(EntityParser).parse(
            unmarshall(newImage as Record<string, any>),
          );
          const { item: oldItem } = EmployeeEntity.build(EntityParser).parse(
            unmarshall(oldImage as Record<string, any>),
          );

          if (newItem.deleted && !oldItem.deleted) {
            await eventBridge.send(EmployeeDeletedEvent.build(newItem));
          }
        }
      }

      if (object?._et.S === InspectorEntity.entityName) {
        const { item } = InspectorEntity.build(EntityParser).parse(
          unmarshall(object as Record<string, any>),
        );

        if (item.latched) return;

        if (record.eventName === "INSERT" && !item.deleted) {
          await eventBridge.send(
            InspectorCreatedEvent.build({
              agencyId: item.agencyId,
              email: item.email,
              given_name: item.firstname,
              family_name: item.lastname,
            }),
          );
        } else if (record.eventName === "MODIFY" && newImage && oldImage) {
          const { item: newItem } = InspectorEntity.build(EntityParser).parse(
            unmarshall(newImage as Record<string, any>),
          );
          const { item: oldItem } = InspectorEntity.build(EntityParser).parse(
            unmarshall(oldImage as Record<string, any>),
          );

          if (newItem.deleted && !oldItem.deleted) {
            await eventBridge.send(InspectorDeletedEvent.build(newItem));
          }
        }
      }
    }),
  );
};
