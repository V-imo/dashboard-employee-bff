import { faker } from "@faker-js/faker";

type UserOverrides = Partial<{
  agencyId: string;
  email: string;
  firstName: string;
  lastName: string;
}>;

export type GeneratedUser = {
  agencyId: string;
  email: string;
  firstName: string;
  lastName: string;
};

const generateUser = (overrides: UserOverrides = {}): GeneratedUser => {
  const firstName = overrides.firstName ?? faker.person.firstName();
  const lastName = overrides.lastName ?? faker.person.lastName();

  return {
    agencyId: overrides.agencyId ?? faker.string.uuid(),
    email: overrides.email ?? faker.internet.email({ firstName, lastName }),
    firstName,
    lastName,
  };
};

export const generateEmployee = (overrides: UserOverrides = {}) =>
  generateUser(overrides);

export const generateInspector = (overrides: UserOverrides = {}) =>
  generateUser(overrides);
