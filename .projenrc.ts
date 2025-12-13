import { Projalf } from "projalf";
const project = new Projalf({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: ["projalf"],
  deps: [
    "@aws-lambda-powertools/logger",
    "@aws-lambda-powertools/tracer",

    "@aws-sdk/client-cognito-identity-provider",

    "zod",

    "hono",
    "@hono/zod-openapi",
    "@hono/swagger-ui",

    "@middy/core",
  ],
  name: "dashboard-employee-bff",
  projenrcTs: true,

  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
