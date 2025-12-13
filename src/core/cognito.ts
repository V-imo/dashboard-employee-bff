import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { env } from "./utils";

const cognitoClient = new CognitoIdentityProviderClient({});

export async function createUser(
  email: string,
  firstName: string,
  lastName: string,
  currentAgency: string
) {
  await cognitoClient
    .send(
      new AdminCreateUserCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "given_name", Value: firstName },
          { Name: "family_name", Value: lastName },
          { Name: "custom:currentAgency", Value: currentAgency },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      })
    )
    .catch((err) => {
      if (err?.name !== "UsernameExistsException") {
        throw err;
      }
    });

  await cognitoClient
    .send(
      new CreateGroupCommand({
        GroupName: currentAgency,
        UserPoolId: env.USER_POOL_ID,
      })
    )
    .catch((err) => {
      if (err?.name !== "GroupExistsException") {
        throw err;
      }
    });

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      GroupName: currentAgency,
      UserPoolId: env.USER_POOL_ID,
      Username: email,
    })
  );
}

export async function getUsers(groupName: string) {
  const response = await cognitoClient.send(
    new ListUsersInGroupCommand({
      GroupName: groupName,
      UserPoolId: env.USER_POOL_ID,
    })
  );
  return response.Users?.map((user) => {
    const attrs: Record<string, string> = {};
    user.Attributes?.forEach((attr) => {
      if (attr.Name && attr.Value) {
        attrs[attr.Name] = attr.Value;
      }
    });
    return {
      username: user.Username,
      email: attrs["email"],
      firstName: attrs["given_name"],
      lastName: attrs["family_name"],
      currentAgency: attrs["custom:currentAgency"],
    };
  });
}