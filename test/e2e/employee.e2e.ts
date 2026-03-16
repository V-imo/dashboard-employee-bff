import fs from "fs";
import type { DynamoDBStreamEvent, EventBridgeEvent } from "aws-lambda";
import {
  ServerlessSpyListener,
  createServerlessSpyListener,
} from "serverless-spy";
import {
  EmployeeCreatedEvent,
  EmployeeCreatedEventEnvelope,
  EmployeeDeletedEvent,
  EmployeeDeletedEventEnvelope,
} from "vimo-events";
import { ServerlessSpyEvents } from "../spy";
import { createEmployee } from "../utils/auth";
import { ApiClient } from "../utils/api";
import { primeAwsEnvironment } from "../utils/aws";
import { generateEmployee } from "../utils/generator";
import { EventBridge, eventualAssertion } from "../utils";

const outputs = Object.values(
  JSON.parse(fs.readFileSync("test.output.json", "utf8")),
)[0] as Record<string, string> | undefined;

const ApiUrl = outputs?.ApiUrl;
const ServerlessSpyWsUrl = outputs?.ServerlessSpyWsUrl;
const UserPoolId = outputs?.UserPoolId;
const UserPoolClientId = outputs?.UserPoolClientId;
const EventBusName = outputs?.EventBusName;

const hasRequiredOutputs = Boolean(
  ApiUrl &&
    ServerlessSpyWsUrl &&
    UserPoolId &&
    UserPoolClientId &&
    EventBusName,
);

const describeIfConfigured = hasRequiredOutputs ? describe : describe.skip;

let serverlessSpyListener: ServerlessSpyListener<ServerlessSpyEvents>;

if (EventBusName) {
  process.env.EVENT_BUS_NAME = EventBusName;
}

if (UserPoolId) {
  process.env.AWS_REGION ??= UserPoolId.split("_")[0];
}

process.env.SERVICE ??= "dashboard-employee-bff";

describeIfConfigured("employee e2e", () => {
  beforeAll(async () => {
    await primeAwsEnvironment(process.env.AWS_REGION);
  });

  beforeEach(async () => {
    serverlessSpyListener =
      await createServerlessSpyListener<ServerlessSpyEvents>({
        serverlessSpyWsUrl: ServerlessSpyWsUrl!,
      });
  }, 10000);

  afterEach(async () => {
    serverlessSpyListener?.stop();
  });

  jest.setTimeout(30000);

  test("should get employees by agency after employee-created event", async () => {
    const employee = generateEmployee();
    const eventBridge = new EventBridge(EventBusName!);

    const [user] = await Promise.all([
      createEmployee({
        userPoolId: UserPoolId!,
        clientId: UserPoolClientId!,
        agencyId: employee.agencyId,
      }),
      eventBridge.send(
        EmployeeCreatedEvent.build({
          agencyId: employee.agencyId,
          email: employee.email,
          given_name: employee.firstName,
          family_name: employee.lastName,
        }),
      ),
    ]);

    const apiClient = new ApiClient(ApiUrl!, user.idToken);

    const listenerEvent =
      await serverlessSpyListener.waitForFunctionListenerRequest<
        EventBridgeEvent<string, EmployeeCreatedEventEnvelope>
      >({
        condition: ({ request }) =>
          request["detail-type"] === EmployeeCreatedEvent.type &&
          request.detail.data.email === employee.email,
      });

    expect(listenerEvent.getData().request.detail.data.agencyId).toEqual(
      employee.agencyId,
    );

    const triggerEvent =
      await serverlessSpyListener.waitForFunctionTriggerRequest<DynamoDBStreamEvent>(
        {
          condition: ({ request }) =>
            request.Records.some(
              (record) =>
                record.eventName === "INSERT" &&
                record.dynamodb?.NewImage?.email?.S === employee.email,
            ),
        },
      );

    expect(
      triggerEvent.getData().request.Records[0].dynamodb?.NewImage?.latched?.BOOL,
    ).toBe(true);

    await eventualAssertion(
      async () => await apiClient.getEmployees(employee.agencyId),
      (res) => {
        expect(res).toContainEqual({
          username: employee.email,
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
          agencyId: employee.agencyId,
        });
      },
    );
  });

  test("should create and delete an employee through the API", async () => {
    const employee = generateEmployee();
    const [user] = await Promise.all([
      createEmployee({
        userPoolId: UserPoolId!,
        clientId: UserPoolClientId!,
        agencyId: employee.agencyId,
      }),
    ]);

    const apiClient = new ApiClient(ApiUrl!, user.idToken);

    await eventualAssertion(
      async () => await apiClient.createEmployee(employee),
      (res) => {
        expect(res).toEqual({ message: "User creation event published" });
      },
    );

    const employeeCreated = (
      await serverlessSpyListener.waitForEventBridgeEventBus<EmployeeCreatedEventEnvelope>(
        {
          condition: ({ detail }) =>
            detail.type === EmployeeCreatedEvent.type &&
            detail.data.email === employee.email,
        },
      )
    ).getData();

    expect(employeeCreated.detail.data.agencyId).toEqual(employee.agencyId);

    await serverlessSpyListener.waitForFunctionListenerRequest<
      EventBridgeEvent<string, EmployeeCreatedEventEnvelope>
    >({
      condition: ({ request }) =>
        request["detail-type"] === EmployeeCreatedEvent.type &&
        request.detail.data.email === employee.email,
    });

    await serverlessSpyListener.waitForFunctionTriggerRequest<DynamoDBStreamEvent>(
      {
        condition: ({ request }) =>
          request.Records.some(
            (record) =>
              record.eventName === "INSERT" &&
              record.dynamodb?.NewImage?.email?.S === employee.email,
          ),
      },
    );

    await eventualAssertion(
      async () => await apiClient.getEmployees(employee.agencyId),
      (res) => {
        expect(res).toContainEqual({
          username: employee.email,
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
          agencyId: employee.agencyId,
        });
      },
    );

    await eventualAssertion(
      async () =>
        await apiClient.deleteEmployee(employee.agencyId, employee.email),
      (res) => {
        expect(res).toEqual({ message: "User deletion event published" });
      },
    );

    const employeeDeleted = (
      await serverlessSpyListener.waitForEventBridgeEventBus<EmployeeDeletedEventEnvelope>(
        {
          condition: ({ detail }) =>
            detail.type === EmployeeDeletedEvent.type &&
            detail.data.email === employee.email,
        },
      )
    ).getData();

    expect(employeeDeleted.detail.data.agencyId).toEqual(employee.agencyId);

    await serverlessSpyListener.waitForFunctionListenerRequest<
      EventBridgeEvent<string, EmployeeDeletedEventEnvelope>
    >({
      condition: ({ request }) =>
        request["detail-type"] === EmployeeDeletedEvent.type &&
        request.detail.data.email === employee.email,
    });

    const deleteTriggerEvent =
      await serverlessSpyListener.waitForFunctionTriggerRequest<DynamoDBStreamEvent>(
        {
          condition: ({ request }) =>
            request.Records.some(
              (record) =>
                record.eventName === "REMOVE" &&
                record.dynamodb?.OldImage?.email?.S === employee.email,
            ),
        },
      );

    expect(
      deleteTriggerEvent.getData().request.Records[0].dynamodb?.OldImage?.latched
        ?.BOOL,
    ).toBe(true);

    await eventualAssertion(
      async () => await apiClient.getEmployees(employee.agencyId),
      (res) => {
        expect(res).toEqual([]);
      },
    );
  });
});
