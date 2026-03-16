import { fromEnv } from "@aws-sdk/credential-provider-env";
import { fromIni } from "@aws-sdk/credential-provider-ini";
import {
  fromSSO,
  isSsoProfile,
} from "@aws-sdk/credential-provider-sso";
import {
  parseKnownFiles,
  type Profile,
} from "@smithy/shared-ini-file-loader";

type AwsClientConfig = {
  region?: string;
  credentials: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
};

let profilePromise:
  | Promise<{ name: string; profile: Profile } | undefined>
  | undefined;

const resolveProfile = async () => {
  const profiles = await parseKnownFiles({});
  const configuredProfile =
    process.env.AWS_PROFILE ?? process.env.AWS_DEFAULT_PROFILE;

  if (configuredProfile && profiles[configuredProfile]) {
    return { name: configuredProfile, profile: profiles[configuredProfile] };
  }

  if (profiles.default) {
    return { name: "default", profile: profiles.default };
  }

  const profileNames = Object.keys(profiles);
  if (profileNames.length === 1) {
    const [name] = profileNames;
    return { name, profile: profiles[name] };
  }

  return undefined;
};

const getProfile = async () => {
  profilePromise ??= resolveProfile();
  return profilePromise;
};

const getCredentials = async () => {
  try {
    return await fromEnv()();
  } catch {
    const resolvedProfile = await getProfile();

    if (!resolvedProfile) {
      throw new Error(
        "No AWS credentials available for e2e tests. Set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.",
      );
    }

    if (isSsoProfile(resolvedProfile.profile)) {
      return fromSSO({ profile: resolvedProfile.name })();
    }

    return fromIni({ profile: resolvedProfile.name })();
  }
};

export const getAwsClientConfig = (region?: string): AwsClientConfig => ({
  region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
  credentials: getCredentials,
});

export const primeAwsEnvironment = async (region?: string) => {
  const credentials = await getCredentials();

  process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;

  if (credentials.sessionToken) {
    process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
  }

  if (region) {
    process.env.AWS_REGION = region;
    process.env.AWS_DEFAULT_REGION = region;
  }
};
