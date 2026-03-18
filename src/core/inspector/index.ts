import {
  $remove,
  GetItemCommand,
  QueryCommand,
  UpdateAttributesCommand,
} from "dynamodb-toolbox";
import { CognitoEsgTable } from "../dynamodb";
import { InspectorEntity, InspectorEntityType } from "./inspector.entity";
import { ignoreOplockError } from "../utils";

type UpdateInspectorInput = Omit<InspectorEntityType, "ttl"> & {
  ttl?: number | ReturnType<typeof $remove>;
};

export namespace Inspector {
  export async function update(inspector: UpdateInspectorInput) {
    await InspectorEntity.build(UpdateAttributesCommand)
      .item(inspector)
      .options({
        condition: {
          or: [
            { attr: "oplock", exists: false },
            { attr: "oplock", lte: inspector.oplock },
          ],
        },
      })
      .send()
      .catch(ignoreOplockError);
  }

  export async function get(agencyId: string, email: string) {
    const { Item } = await InspectorEntity.build(GetItemCommand)
      .key({ agencyId, email })
      .send();
    return Item;
  }

  export async function del(agencyId: string, email: string) {
    const inspector = await get(agencyId, email);
    if (!inspector) {
      return;
    }

    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await update({
      ...inspector,
      deleted: true,
      latched: false,
      ttl,
      oplock: Date.now(),
    });
  }
  export async function latchDelete(
    agencyId: string,
    email: string,
    oplock: number,
  ) {
    const inspector = await get(agencyId, email);
    if (!inspector) {
      return;
    }

    await update({
      ...inspector,
      latched: true,
      oplock,
    });
  }

  export async function listByAgency(agencyId: string) {
    const { Items = [] } = await CognitoEsgTable.build(QueryCommand)
      .entities(InspectorEntity)
      .query({
        partition: `AGENCY#${agencyId}`,
        range: { beginsWith: "INSPECTOR#" },
      })
      .send();

    return Items.filter((item) => !item.deleted);
  }
}
