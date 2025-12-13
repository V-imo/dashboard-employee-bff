import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

const RegisterUserSchema = z
  .object({
    email: z.email(),
    firstName: z.string(),
    lastName: z.string(),
    currentAgency: z.number(),
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

const getEnv = () => ({
  userPoolId: process.env.USER_POOL_ID,
});

export const route = new OpenAPIHono().openapi(
  createRoute({
    method: "post",
    path: "/register",
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
    const { userPoolId } = getEnv();
    if (!userPoolId) {
      return c.json({ error: "Server misconfiguration" }, 500);
    }

    try {
      await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          UserAttributes: [
            {
              Name: "email",
              Value: email,
            },
            {
              Name: "given_name",
              Value: firstName,
            },
            {
              Name: "family_name",
              Value: lastName,
            },
            {
              Name: "currentAgency",
              Value: Number(currentAgency).toString(),
            },
            {
              Name: "custom:userPoolId",
              Value: userPoolId,
            },
          ],
          DesiredDeliveryMediums: ["EMAIL"],
        })
      );

      return c.json({ message: "User registered successfully" }, 201);
    } catch (error) {
      return c.json({ error: "Registration failed" }, 400);
    }
  }
);
