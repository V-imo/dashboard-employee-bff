import fs from "fs";
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
import { generateEmployee } from "../utils/generator";
import { EventBridge, eventualAssertion } from "../utils";

const {
  ApiUrl,
  EventBusName,
  ServerlessSpyWsUrl,
  UserPoolClientId,
  UserPoolId,
} = Object.values(
  JSON.parse(fs.readFileSync("test.output.json", "utf8")),
)[0] as Record<string, string>;
process.env.EVENT_BUS_NAME = EventBusName;
process.env.SERVICE = "dashboard-employee-bff";

const eventBridge = new EventBridge(EventBusName);

let serverlessSpyListener: ServerlessSpyListener<ServerlessSpyEvents>;
beforeEach(async () => {
  serverlessSpyListener =
    await createServerlessSpyListener<ServerlessSpyEvents>({
      serverlessSpyWsUrl: ServerlessSpyWsUrl,
    });
}, 10000);

afterEach(async () => {
  serverlessSpyListener?.stop();
});

jest.setTimeout(60000);

test("should get employees by agency after employee-created event", async () => {
  const employee = generateEmployee();

  const [user] = await Promise.all([
    createEmployee({
      userPoolId: UserPoolId,
      clientId: UserPoolClientId,
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
  const apiClient = new ApiClient(ApiUrl, user.idToken);

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
      userPoolId: UserPoolId,
      clientId: UserPoolClientId,
      agencyId: employee.agencyId,
    }),
  ]);
  const apiClient = new ApiClient(ApiUrl, user.idToken);
  const employeeCreatedEventPromise =
    serverlessSpyListener.waitForEventBridgeEventBus<EmployeeCreatedEventEnvelope>(
      {
        condition: ({ detail }) =>
          detail.type === EmployeeCreatedEvent.type &&
          detail.data.agencyId === employee.agencyId &&
          detail.data.email === employee.email,
      },
    );

  await eventualAssertion(
    async () => await apiClient.createEmployee(employee),
    (res) => {
      expect(res).toEqual({ message: "User stored successfully" });
    },
  );

  const employeeCreatedEvent = (await employeeCreatedEventPromise).getData();
  expect(employeeCreatedEvent.detail.data.given_name).toEqual(
    employee.firstName,
  );
  expect(employeeCreatedEvent.detail.data.family_name).toEqual(
    employee.lastName,
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

  const employeeDeletedEventPromise =
    serverlessSpyListener.waitForEventBridgeEventBus<EmployeeDeletedEventEnvelope>(
      {
        condition: ({ detail }) =>
          detail.type === EmployeeDeletedEvent.type &&
          detail.data.agencyId === employee.agencyId &&
          detail.data.email === employee.email,
      },
    );

  await eventualAssertion(
    async () =>
      await apiClient.deleteEmployee(employee.agencyId, employee.email),
    (res) => {
      expect(res).toEqual({ message: "User marked as deleted" });
    },
  );

  const employeeDeletedEvent = (await employeeDeletedEventPromise).getData();
  expect(employeeDeletedEvent.detail.data.agencyId).toEqual(employee.agencyId);
  expect(employeeDeletedEvent.detail.data.email).toEqual(employee.email);

  await eventualAssertion(
    async () => await apiClient.getEmployees(employee.agencyId),
    (res) => {
      expect(res).toEqual([]);
    },
  );
});
