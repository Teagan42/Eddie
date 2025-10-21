import { Module } from "@nestjs/common";

import { KNEX_INSTANCE, KNEX_PROVIDER } from "./knex.provider";
import { DatabaseService } from "./database.service";

@Module({
  providers: [KNEX_PROVIDER, DatabaseService],
  exports: [KNEX_INSTANCE, DatabaseService],
})
export class DatabaseModule {}
