import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { EmployeeCreatedEvent, EmployeeDeletedEvent } from "vimo-events";
import { z } from "zod";
import { Employee } from "../../core/employee";
import { logger, tracer } from "../../core/utils";

const eventBridge = tracer.captureAWSv3Client(new EventBridgeClient());

const RegisterUserSchema = z
  .object({
    email: z.email(),
    firstName: z.string(),
    lastName: z.string(),
    agencyId: z.string(),
  })
  .openapi("RegisterUser");

const RegisterUserResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("RegisterUserResponse");

const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

const UserSchema = z
  .object({
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    agencyId: z.string(),
  })
  .openapi("User");

const DeleteUserParamsSchema = z.object({
  agencyId: z.string(),
  email: z.email(),
});

export const route = new OpenAPIHono<any>()
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: RegisterUserSchema,
            },
          },
        },
      },
      responses: {
        202: {
          content: {
            "application/json": {
              schema: RegisterUserResponseSchema,
            },
          },
          description: "User creation event published",
        },
        400: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "Invalid request",
        },
      },
      description: "Publish employee-created event",
    }),
    (async (c: any) => {
      const { email, firstName, lastName, agencyId } = c.req.valid("json");
      try {
        await eventBridge.send(
          EmployeeCreatedEvent.build({
            email,
            given_name: firstName,
            family_name: lastName,
            agencyId,
          }),
        );

        return c.json({ message: "User creation event published" }, 202);
      } catch (error) {
        logger.error("Error publishing employee-created event", { error });
        return c.json({ error: "Invalid request" }, 400);
      }
    }) as any,
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/{agencyId}",
      request: {
        params: z.object({
          agencyId: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(UserSchema),
            },
          },
          description: "Users retrieved successfully",
        },
        404: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "Group not found",
        },
      },
      description: "Get users by agency from projection table",
    }),
    (async (c: any) => {
      const { agencyId } = c.req.valid("param");
      const users = await Employee.listByAgency(agencyId);

      const response = users.map((user) => ({
        username: user.email,
        email: user.email,
        firstName: user.firstname,
        lastName: user.lastname,
        agencyId: user.agencyId,
      }));

      return c.json(z.array(UserSchema).parse(response), 200);
    }) as any,
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{agencyId}/{email}",
      request: {
        params: DeleteUserParamsSchema,
      },
      responses: {
        202: {
          content: {
            "application/json": {
              schema: RegisterUserResponseSchema,
            },
          },
          description: "User deletion event published",
        },
        400: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "Invalid request",
        },
      },
      description: "Publish employee-deleted event",
    }),
    (async (c: any) => {
      const { agencyId, email } = c.req.valid("param");

      try {
        await eventBridge.send(
          EmployeeDeletedEvent.build({
            agencyId,
            email,
          }),
        );

        return c.json({ message: "User deletion event published" }, 202);
      } catch (error) {
        logger.error("Error publishing employee-deleted event", { error });
        return c.json({ error: "Invalid request" }, 400);
      }
    }) as any,
  );
