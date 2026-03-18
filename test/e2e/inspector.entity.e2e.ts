import fs from "fs";
import {
  ServerlessSpyListener,
  createServerlessSpyListener,
} from "serverless-spy";
import {
  InspectorCreatedEvent,
  InspectorCreatedEventEnvelope,
  InspectorDeletedEvent,
  InspectorDeletedEventEnvelope,
} from "vimo-events";
import { ServerlessSpyEvents } from "../spy";
import { createInspector } from "../utils/auth";
import { ApiClient } from "../utils/api";
import { generateInspector } from "../utils/generator";
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
process.env.SERVICE = "inspection-inspector-bff";

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

test("should get inspectors by agency after inspector-created event", async () => {
  const inspector = generateInspector();

  const [user] = await Promise.all([
    createInspector({
      userPoolId: UserPoolId,
      clientId: UserPoolClientId,
      agencyId: inspector.agencyId,
    }),
    eventBridge.send(
      InspectorCreatedEvent.build({
        agencyId: inspector.agencyId,
        email: inspector.email,
        given_name: inspector.firstName,
        family_name: inspector.lastName,
      }),
    ),
  ]);
  const apiClient = new ApiClient(ApiUrl, user.idToken);

  await eventualAssertion(
    async () => await apiClient.getInspectors(inspector.agencyId),
    (res) => {
      expect(res).toContainEqual({
        username: inspector.email,
        email: inspector.email,
        firstName: inspector.firstName,
        lastName: inspector.lastName,
        agencyId: inspector.agencyId,
      });
    },
  );
});

test("should create and delete an inspector through the API", async () => {
  const inspector = generateInspector();

  const [user] = await Promise.all([
    createInspector({
      userPoolId: UserPoolId,
      clientId: UserPoolClientId,
      agencyId: inspector.agencyId,
    }),
  ]);
  const apiClient = new ApiClient(ApiUrl, user.idToken);
  const inspectorCreatedEventPromise =
    serverlessSpyListener.waitForEventBridgeEventBus<InspectorCreatedEventEnvelope>(
      {
        condition: ({ detail }) =>
          detail.type === InspectorCreatedEvent.type &&
          detail.data.agencyId === inspector.agencyId &&
          detail.data.email === inspector.email,
      },
    );

  await eventualAssertion(
    async () => await apiClient.createInspector(inspector),
    (res) => {
      expect(res).toEqual({ message: "User stored successfully" });
    },
  );

  const inspectorCreatedEvent = (await inspectorCreatedEventPromise).getData();
  expect(inspectorCreatedEvent.detail.data.given_name).toEqual(
    inspector.firstName,
  );
  expect(inspectorCreatedEvent.detail.data.family_name).toEqual(
    inspector.lastName,
  );

  await eventualAssertion(
    async () => await apiClient.getInspectors(inspector.agencyId),
    (res) => {
      expect(res).toContainEqual({
        username: inspector.email,
        email: inspector.email,
        firstName: inspector.firstName,
        lastName: inspector.lastName,
        agencyId: inspector.agencyId,
      });
    },
  );

  const inspectorDeletedEventPromise =
    serverlessSpyListener.waitForEventBridgeEventBus<InspectorDeletedEventEnvelope>(
      {
        condition: ({ detail }) =>
          detail.type === InspectorDeletedEvent.type &&
          detail.data.agencyId === inspector.agencyId &&
          detail.data.email === inspector.email,
      },
    );

  await eventualAssertion(
    async () =>
      await apiClient.deleteInspector(inspector.agencyId, inspector.email),
    (res) => {
      expect(res).toEqual({ message: "Inspector marked as deleted" });
    },
  );

  const inspectorDeletedEvent = (await inspectorDeletedEventPromise).getData();
  expect(inspectorDeletedEvent.detail.data.agencyId).toEqual(
    inspector.agencyId,
  );
  expect(inspectorDeletedEvent.detail.data.email).toEqual(inspector.email);

  await eventualAssertion(
    async () => await apiClient.getInspectors(inspector.agencyId),
    (res) => {
      expect(res).toEqual([]);
    },
  );
});
