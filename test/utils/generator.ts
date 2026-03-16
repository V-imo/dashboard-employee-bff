import { faker } from "@faker-js/faker";

type EmployeeOverrides = Partial<{
  agencyId: string;
  email: string;
  firstName: string;
  lastName: string;
}>;

export const generateEmployee = (overrides: EmployeeOverrides = {}) => {
  const firstName = overrides.firstName ?? faker.person.firstName();
  const lastName = overrides.lastName ?? faker.person.lastName();

  return {
    agencyId: overrides.agencyId ?? faker.string.uuid(),
    email: overrides.email ?? faker.internet.email({ firstName, lastName }),
    firstName,
    lastName,
  };
};
