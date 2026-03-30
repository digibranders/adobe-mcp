import { describe, expect, it } from "vitest";

import { loadConfig } from "../core/config.js";
import { StderrLogger } from "../core/logger.js";
import { AdapterRegistry } from "../server/registry.js";

describe("AdapterRegistry", () => {
  it("returns a capability matrix for all target apps", () => {
    const registry = new AdapterRegistry(loadConfig({}), new StderrLogger("error"));
    const matrix = registry.getCapabilityMatrix();

    expect(matrix).toHaveLength(6);
    expect(matrix.map((entry) => entry.appId)).toEqual([
      "illustrator",
      "photoshop",
      "indesign",
      "acrobat",
      "aftereffects",
      "premiere"
    ]);
  });

  it("returns status for a specific app", async () => {
    const registry = new AdapterRegistry(loadConfig({}), new StderrLogger("error"));
    const status = await registry.getStatus("illustrator", true);

    expect(status.descriptor.displayName).toBe("Adobe Illustrator");
    expect(status.supportedOperations).toContain("discover_host");
  });
});
