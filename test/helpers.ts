import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { BillionSend, type BillionSendOptions } from "../src/index.js";
import { ContractMock } from "./contract/mock-server.js";
import { type JsonSchema, operation, pointerOf, SAMPLE_UUID, sample } from "./contract/spec.js";

export const ID = SAMPLE_UUID;
export const ID2 = "0d5b0a52-8c1f-4a3e-b0f4-7d8e9a1b2c3d";
export const API_KEY = "bs_test_0123456789";

/** Starts one contract mock for the file and checks after each test that nothing broke the contract. */
export function useContractMock(): {
  mock: ContractMock;
  client: (options?: BillionSendOptions) => BillionSend;
} {
  const mock = new ContractMock();
  beforeAll(async () => {
    await mock.start();
  });
  afterAll(async () => {
    await mock.stop();
  });
  afterEach(() => {
    const violations = [...mock.violations];
    mock.reset();
    expect(violations, "contract violations").toEqual([]);
  });
  return {
    mock,
    client: (options = {}) => new BillionSend({ apiKey: API_KEY, baseUrl: mock.url, ...options }),
  };
}

/** A minimal request body that validates against the operation's request schema. */
export function sampleBody(key: string): never {
  const op = operation(key);
  const schema = op.requestBody?.content["application/json"]?.schema as JsonSchema | undefined;
  if (!schema) throw new Error(`${key} takes no body`);
  return sample(schema) as never;
}

export { pointerOf };
