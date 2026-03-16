import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getAwsClientConfig } from "./aws";

type CreateEmployeeParams = {
  userPoolId: string;
  clientId: string;
  agencyId: string;
  email?: string;
};

export const createEmployee = async ({
  userPoolId,
  clientId,
  agencyId,
  email,
}: CreateEmployeeParams) => {
  const cognito = new CognitoIdentityProviderClient(
    getAwsClientConfig(userPoolId.split("_")[0]),
  );
  const username = email ?? `employee.${Date.now()}@example.com`;
  const password = "P@ssword123!";

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
      Password: password,
      Permanent: true,
    }),
  );

  const auth = await cognito.send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    }),
  );

  if (!auth.AuthenticationResult?.IdToken) {
    throw new Error("Failed to authenticate test employee");
  }

  return {
    username,
    password,
    idToken: auth.AuthenticationResult.IdToken,
  };
};
