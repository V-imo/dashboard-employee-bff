import { createRoute, OpenAPIHono, RouteHandler } from "@hono/zod-openapi";
import { $remove } from "dynamodb-toolbox";
import { z } from "zod";
import { Inspector } from "../../core/inspector";
import { logger } from "../../core/utils";

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

const registerUserRoute = createRoute({
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
      description: "User stored successfully",
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
  description: "Store inspector in projection table",
});

const registerUserHandler: RouteHandler<typeof registerUserRoute> = async (
  c,
) => {
  const { email, firstName, lastName, agencyId } = c.req.valid("json");

  try {
    await Inspector.update({
      agencyId,
      email,
      firstname: firstName,
      lastname: lastName,
      oplock: Date.now(),
      latched: false,
      deleted: false,
      ttl: $remove(),
    });

    return c.json({ message: "User stored successfully" }, 202);
  } catch (error) {
    logger.error("Error storing Inspector", { error });
    return c.json({ error: "Invalid request" }, 400);
  }
};

const getUsersRoute = createRoute({
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
  description: "Get inspectors by agency from projection table",
});

const getUsersHandler: RouteHandler<typeof getUsersRoute> = async (c) => {
  const { agencyId } = c.req.valid("param");
  const users = await Inspector.listByAgency(agencyId);

  const response = users.map((user) => ({
    username: user.email,
    email: user.email,
    firstName: user.firstname,
    lastName: user.lastname,
    agencyId: user.agencyId,
  }));

  return c.json(z.array(UserSchema).parse(response), 200);
};

const deleteUserRoute = createRoute({
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
      description: "Inspector marked as deleted",
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
  description: "Soft delete inspector in projection table",
});

const deleteUserHandler: RouteHandler<typeof deleteUserRoute> = async (c) => {
  const { agencyId, email } = c.req.valid("param");

  try {
    await Inspector.del(agencyId, email);

    return c.json({ message: "Inspector marked as deleted" }, 202);
  } catch (error) {
    logger.error("Error soft deleting inspector", { error });
    return c.json({ error: "Invalid request" }, 400);
  }
};

export const route = new OpenAPIHono()
  .openapi(registerUserRoute, registerUserHandler)
  .openapi(getUsersRoute, getUsersHandler)
  .openapi(deleteUserRoute, deleteUserHandler);
