import type { DynamoDBStreamEvent } from "aws-lambda";
import { EmployeeCreatedEvent, EmployeeDeletedEvent } from "vimo-events";

process.env.EVENT_BUS_NAME = "test-bus";
process.env.SERVICE = "dashboard-employee-bff";

const sendMock = jest.fn();

jest.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: jest.fn().mockImplementation(() => ({
    send: sendMock,
  })),
  PutEventsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("../src/core/utils", () => ({
  env: {
    TABLE_NAME: "test-table",
    SERVICE: "dashboard-employee-bff",
  },
  tracer: {
    captureAWSv3Client: <T>(client: T) => client,
  },
}));

const { handler } = require("../src/functions/trigger") as typeof import("../src/functions/trigger");

describe("trigger", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("publishes employee-created when a non-latched employee is inserted", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              PK: { S: "AGENCY#agency-1" },
              SK: { S: "EMPLOYEE#john@example.com" },
              _et: { S: "Employee" },
              agencyId: { S: "agency-1" },
              email: { S: "john@example.com" },
              firstname: { S: "John" },
              lastname: { S: "Doe" },
              oplock: { N: "1" },
              latched: { BOOL: false },
            },
          },
        } as any,
      ],
    };

    await handler(event);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    const entry = command.input.Entries[0];

    expect(entry.DetailType).toBe(EmployeeCreatedEvent.type);
    expect(JSON.parse(entry.Detail)).toMatchObject({
      type: EmployeeCreatedEvent.type,
      data: {
        agencyId: "agency-1",
        email: "john@example.com",
        given_name: "John",
        family_name: "Doe",
      },
    });
  });

  it("publishes employee-deleted when an employee is soft-deleted", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventName: "MODIFY",
          dynamodb: {
            OldImage: {
              PK: { S: "AGENCY#agency-1" },
              SK: { S: "EMPLOYEE#john@example.com" },
              _et: { S: "Employee" },
              agencyId: { S: "agency-1" },
              email: { S: "john@example.com" },
              firstname: { S: "John" },
              lastname: { S: "Doe" },
              oplock: { N: "1" },
              latched: { BOOL: false },
            },
            NewImage: {
              PK: { S: "AGENCY#agency-1" },
              SK: { S: "EMPLOYEE#john@example.com" },
              _et: { S: "Employee" },
              agencyId: { S: "agency-1" },
              email: { S: "john@example.com" },
              firstname: { S: "John" },
              lastname: { S: "Doe" },
              oplock: { N: "2" },
              latched: { BOOL: false },
              deleted: { BOOL: true },
              ttl: { N: "9999999999" },
            },
          },
        } as any,
      ],
    };

    await handler(event);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    const entry = command.input.Entries[0];

    expect(entry.DetailType).toBe(EmployeeDeletedEvent.type);
    expect(JSON.parse(entry.Detail)).toMatchObject({
      type: EmployeeDeletedEvent.type,
      data: {
        agencyId: "agency-1",
        email: "john@example.com",
      },
    });
  });
});
