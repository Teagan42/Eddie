import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";

import { KNEX_PROVIDER } from "./knex.provider";
import { DatabaseService } from "./database.service";

@Module({
  imports: [ConfigModule],
  providers: [KNEX_PROVIDER, DatabaseService],
  exports: [KNEX_PROVIDER, DatabaseService],
})
export class DatabaseModule {}
