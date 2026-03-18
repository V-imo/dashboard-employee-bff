import { hc } from "hono/client";
import type { Routes } from "../../src/functions/apis/index";

export type UserRole = "employee" | "inspector";

export type UserInput = {
  email: string;
  firstName: string;
  lastName: string;
  agencyId: string;
};

export type UserResponse = {
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

  private getResource(role: UserRole) {
    return role === "employee" ? this.client.user : this.client.inspector;
  }

  async createUser(role: UserRole, user: UserInput) {
    const response = await this.getResource(role).$post({
      json: user,
    });
    return response.json();
  }

  async getUsers(role: UserRole, agencyId: string) {
    const response = await this.getResource(role)[":agencyId"].$get({
      param: { agencyId },
    });
    return response.json() as Promise<UserResponse[]>;
  }

  async deleteUser(role: UserRole, agencyId: string, email: string) {
    const response = await this.getResource(role)[":agencyId"][":email"].$delete(
      {
        param: { agencyId, email },
      },
    );
    return response.json();
  }

  async createEmployee(employee: UserInput) {
    return this.createUser("employee", employee);
  }

  async getEmployees(agencyId: string) {
    return this.getUsers("employee", agencyId);
  }

  async deleteEmployee(agencyId: string, email: string) {
    return this.deleteUser("employee", agencyId, email);
  }

  async createInspector(inspector: UserInput) {
    return this.createUser("inspector", inspector);
  }

  async getInspectors(agencyId: string) {
    return this.getUsers("inspector", agencyId);
  }

  async deleteInspector(agencyId: string, email: string) {
    return this.deleteUser("inspector", agencyId, email);
  }
}
