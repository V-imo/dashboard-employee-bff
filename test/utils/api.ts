import { hc } from "hono/client";
import type { Routes } from "../../src/functions/apis/index";

export type EmployeeInput = {
  email: string;
  firstName: string;
  lastName: string;
  agencyId: string;
};

export type EmployeeResponse = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  agencyId: string;
};

export class ApiClient {
  client: ReturnType<typeof hc<Routes>>;

  constructor(baseUrl: string, userId?: string) {
    this.client = hc<Routes>(baseUrl, {
      headers: { Authorization: userId ?? "" },
    });
  }

  async createEmployee(employee: EmployeeInput) {
    const response = await this.client.user.$post({
      json: employee,
    });
    return response.json();
  }

  async getEmployees(agencyId: string) {
    const response = await this.client.user[":agencyId"].$get({
      param: { agencyId },
    });
    return response.json() as Promise<EmployeeResponse[]>;
  }

  async deleteEmployee(agencyId: string, email: string) {
    const response = await this.client.user[":agencyId"][":email"].$delete({
      param: { agencyId, email },
    });
    return response.json();
  }
}
