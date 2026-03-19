import {
  $remove,
  GetItemCommand,
  QueryCommand,
  UpdateAttributesCommand,
} from "dynamodb-toolbox";
import { CognitoEsgTable } from "../dynamodb";
import { EmployeeEntity, EmployeeEntityType } from "./employee.entity";
import { ignoreOplockError } from "../utils";

type UpdateEmployeeInput = Omit<EmployeeEntityType, "ttl"> & {
  ttl?: number | ReturnType<typeof $remove>;
};

export namespace Employee {
  export async function update(employee: UpdateEmployeeInput) {
    await EmployeeEntity.build(UpdateAttributesCommand)
      .item(employee)
      .options({
        condition: {
          or: [
            { attr: "oplock", exists: false },
            { attr: "oplock", lte: employee.oplock },
          ],
        },
      })
      .send()
      .catch(ignoreOplockError);
  }

  export async function get(agencyId: string, email: string) {
    const { Item } = await EmployeeEntity.build(GetItemCommand)
      .key({ agencyId, email })
      .send();
    return Item;
  }

  export async function del(
    agencyId: string,
    email: string,
    latched = false,
    oplock = Date.now(),
  ) {
    const employee = await get(agencyId, email);

    if (latched) {
      await update({
        ...employee,
        latched: true,
        oplock,
      });
      return;
    }

    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await update({
      ...employee,
      deleted: true,
      latched: false,
      ttl,
      oplock,
    });
  }
  export async function listByAgency(agencyId: string) {
    const { Items = [] } = await CognitoEsgTable.build(QueryCommand)
      .entities(EmployeeEntity)
      .query({
        partition: `AGENCY#${agencyId}`,
        range: { beginsWith: "EMPLOYEE#" },
      })
      .send();

    return Items.filter((item) => !item.deleted);
  }
}
