import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as levs from "aws-cdk-lib/aws-lambda-event-sources";
import * as ln from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { ServerlessSpy } from "serverless-spy";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as apigw_authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { EmployeeCreatedEvent, EmployeeDeletedEvent } from "vimo-events";

export interface DashboardEmployeeBffProps extends cdk.StackProps {
  serviceName: string;
  stage: string;
}

export class DashboardEmployeeBff extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardEmployeeBffProps) {
    super(scope, id, props);

    const { userPool, userPoolClient } = this.getAuth(props.stage);
    const eventBus = this.getEventBus(props.stage);

    const table = new ddb.TableV2(this, "DashboardEmployeeBffTable", {
      partitionKey: { name: "PK", type: ddb.AttributeType.STRING },
      sortKey: { name: "SK", type: ddb.AttributeType.STRING },
      dynamoStream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      billing: ddb.Billing.onDemand(),
      removalPolicy:
        props.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    const listener = new ln.NodejsFunction(this, "Listener", {
      entry: `${__dirname}/functions/listener.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        TABLE_NAME: table.tableName,
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    table.grantReadWriteData(listener);

    const trigger = new ln.NodejsFunction(this, "Trigger", {
      entry: `${__dirname}/functions/trigger.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        TABLE_NAME: table.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
    });
    trigger.addEventSource(
      new levs.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        retryAttempts: 3,
      }),
    );
    table.grantReadWriteData(trigger);
    eventBus.grantPutEventsTo(trigger);

    new events.Rule(this, "Rule", {
      eventBus,
      eventPattern: {
        source: ["custom"],
        detailType: [EmployeeCreatedEvent.type, EmployeeDeletedEvent.type],
      },
      targets: [
        new events_targets.LambdaFunction(listener, {
          retryAttempts: 3,
        }),
      ],
    });
    const authorizer = new apigw_authorizers.HttpUserPoolAuthorizer(
      `${id}Authorizer`,
      userPool,
      {
        userPoolClients: [userPoolClient],
      },
    );
    const api = new apigw.HttpApi(this, "EmployeeDashboardApi", {
      corsPreflight: {
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "Content-Length",
          "X-Requested-With",
        ],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
        allowCredentials: false,
      },
    });

    const apiFunction = new ln.NodejsFunction(this, "ApiFunction", {
      entry: `${__dirname}/functions/apis/index.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        TABLE_NAME: table.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: { minify: true, sourceMap: true },
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    table.grantReadData(apiFunction);
    eventBus.grantPutEventsTo(apiFunction);
    const apiIntegration = new integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );
    api.addRoutes({
      path: "/{proxy+}",
      methods: [
        apigw.HttpMethod.GET,
        apigw.HttpMethod.POST,
        apigw.HttpMethod.DELETE,
      ],
      integration: apiIntegration,
      authorizer,
      // authorizer: undefined,
    });
    if (props.stage.startsWith("test")) {
      const serverlessSpy = new ServerlessSpy(this, "ServerlessSpy", {
        generateSpyEventsFileLocation: "test/spy.ts",
      });
      serverlessSpy.spy();
    }
  }
  getEventBus(stage: string) {
    if (stage.startsWith("test")) {
      const eventBus = new events.EventBus(this, "EventBus");
      new cdk.CfnOutput(this, "EventBusName", {
        value: eventBus.eventBusName,
      });
      return eventBus;
    }
    return events.EventBus.fromEventBusArn(
      this,
      "EventBus",
      ssm.StringParameter.valueForStringParameter(
        this,
        `/vimo/${stage}/event-bus-arn`,
      ),
    );
  }
  getAuth(stage: string) {
    if (stage.startsWith("test")) {
      const userPool = new cognito.UserPool(this, "UserPool", {
        customAttributes: {
          currentAgency: new cognito.StringAttribute({ mutable: true }),
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      new cdk.CfnOutput(this, "UserPoolId", {
        value: userPool.userPoolId,
      });

      const userPoolClient = new cognito.UserPoolClient(
        this,
        "UserPoolClient",
        {
          userPool,
          authFlows: {
            userPassword: true,
          },
        },
      );
      new cdk.CfnOutput(this, "UserPoolClientId", {
        value: userPoolClient.userPoolClientId,
      });

      return { userPool, userPoolClient };
    }
    const userPoolArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/vimo/${stage}/user-pool-arn`,
    );
    const userPoolClientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/vimo/${stage}/user-pool-client-id`,
    );

    const userPool = cognito.UserPool.fromUserPoolArn(
      this,
      "UserPool",
      userPoolArn,
    );

    const userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(
      this,
      "UserPoolClient",
      userPoolClientId,
    );

    return { userPool, userPoolClient };
  }
}
