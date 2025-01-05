import { getLogger } from "../../src/logger";

describe("logger", () => {
  test("Uses info if no level is set", () => {
    const logger = getLogger();
    expect(logger.level).toBe("info");
  });
  test("Can log at another level with LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "error";
    const logger = getLogger();
    expect(logger.level).toBe("error");
  });
});
