import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { createUser, deleteUser, getUsers } from "../../core/cognito";
const RegisterUserSchema = z
  .object({
    email: z.email(),
    firstName: z.string(),
    lastName: z.string(),
    currentAgency: z.string(),
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
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    currentAgency: z.string().optional(),
  })
  .openapi("User");

export const route = new OpenAPIHono()
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
        201: {
          content: {
            "application/json": {
              schema: RegisterUserResponseSchema,
            },
          },
          description: "User registered successfully",
        },
        400: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "Registration failed",
        },
        500: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "Server error",
        },
      },
      description: "Register a new user",
    }),
    async (c) => {
      const { email, firstName, lastName, currentAgency } = c.req.valid("json");
      try {
        await createUser(email, firstName, lastName, currentAgency);
        return c.json({ message: "User registered successfully" }, 201);
      } catch (error) {
        console.error("Error registering user:", JSON.stringify(error));
        return c.json({ error: "Registration failed" }, 400);
      }
    }
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
      description: "Get users from a group",
    }),
    async (c) => {
      const { agencyId } = c.req.valid("param");
      try {
        const users = await getUsers(agencyId);
        console.log("Retrieved users:", JSON.stringify(users));
        return c.json(z.array(UserSchema).parse(users), 200);
      } catch (error) {
        console.error("Error retrieving users:", JSON.stringify(error));
        return c.json({ error: "Group not found" }, 404);
      }
    }
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{username}",
      request: {
        params: z.object({
          username: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: RegisterUserResponseSchema,
            },
          },
          description: "User deleted successfully",
        },
        404: {
          content: {
            "application/json": {
              schema: ErrorResponseSchema,
            },
          },
          description: "User not found",
        },
      },
      description: "Delete a user",
    }),
    async (c) => {
      const { username } = c.req.valid("param");
      try {
        await deleteUser(username);
        return c.json({ message: "User deleted successfully" }, 200);
      } catch (error) {
        console.error("Error deleting user:", JSON.stringify(error));
        return c.json({ error: "User not found" }, 404);
      }
    }
  );
