import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export interface DashboardEmployeeBffProps extends cdk.StackProps {
  serviceName: string;
  stage: string;
}

export class DashboardEmployeeBff extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardEmployeeBffProps) {
    super(scope, id, props)
    // Add your infra here...
  }
}
