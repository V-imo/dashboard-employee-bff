import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { DashboardEmployeeBff } from "../src/dashboard-employee-bff";

describe("DashboardEmployeeBff", () => {
  it("exposes /doc without an authorizer", () => {
    const app = new App();
    const stack = new DashboardEmployeeBff(app, "test-dashboard-employee-bff", {
      serviceName: "dashboard-employee-bff",
      stage: "test",
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /doc",
      AuthorizationType: "NONE",
    });

    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /{proxy+}",
      AuthorizationType: "JWT",
      AuthorizerId: Match.anyValue(),
    });
  });
});
