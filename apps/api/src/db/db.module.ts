import { Module } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');
export type Database = PostgresJsDatabase<typeof schema>;

@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (): Database => {
        const env = loadEnv();
        const queryClient = postgres(env.DATABASE_URL);
        return drizzle(queryClient, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
