import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SentryModule, SentryGlobalFilter } from "@sentry/nestjs/setup";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.getOrThrow<string>("DATABASE_HOST"),
        port: config.getOrThrow<number>("DATABASE_PORT"),
        username: config.getOrThrow<string>("DATABASE_USER"),
        password: config.getOrThrow<string>("DATABASE_PASSWORD"),
        database: config.getOrThrow<string>("DATABASE_NAME"),
        ssl: config.get<string>("DATABASE_SSL") === "true",
        entities: [__dirname + "/**/*.entity.{js,ts}"],
        migrations: [__dirname + "/migrations/**/*.{js,ts}"],
        // Never use synchronize: true in production
        synchronize: config.get<string>("NODE_ENV") !== "production",
        logging: config.get<string>("NODE_ENV") === "development",
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    // SentryGlobalFilter must be first to catch all unhandled exceptions
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
