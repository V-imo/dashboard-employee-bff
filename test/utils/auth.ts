import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export type UserRole = "employee" | "inspector";

type CreateUsersParams = {
  userPoolId: string;
  clientId: string;
  agencyId: string;
  email?: string;
};

const PASSWORD = "P@ssword123!";

const createUser = async (
  role: UserRole,
  {
    userPoolId,
    clientId,
    agencyId,
    email,
  }: CreateUsersParams,
) => {
  const username = email ?? `${role}.${Date.now()}@example.com`;
  const cognito = new CognitoIdentityProviderClient({
    region: userPoolId.split("_")[0],
  });

  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: username },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:currentAgency", Value: agencyId },
      ],
    }),
  );

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: PASSWORD,
      Permanent: true,
    }),
  );

  const auth = await cognito.send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: PASSWORD,
      },
    }),
  );

  if (!auth.AuthenticationResult?.IdToken) {
    throw new Error(`Failed to authenticate test ${role}`);
  }

  return {
    username,
    password: PASSWORD,
    idToken: auth.AuthenticationResult.IdToken,
  };
};

export const createEmployee = async ({
  userPoolId,
  clientId,
  agencyId,
  email,
}: CreateUsersParams) => {
  return createUser("employee", {
    userPoolId,
    clientId,
    agencyId,
    email,
  });
};

export const createInspector = async ({
  userPoolId,
  clientId,
  agencyId,
  email,
}: CreateUsersParams) => {
  return createUser("inspector", {
    userPoolId,
    clientId,
    agencyId,
    email,
  });
};
