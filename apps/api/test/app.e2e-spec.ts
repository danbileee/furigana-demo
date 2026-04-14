import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { type App } from "supertest/types";
import { AppModule } from "../src/app.module.js";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("/health (GET)", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);
    expect(response.body).toMatchObject({ status: "ok" });
    expect(typeof response.body.timestamp).toBe("string");
  });
});
