import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ProfileStorageError } from "./profile.errors.js";

export class JsonProfileStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return JSON.parse(contents);
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      if (error instanceof SyntaxError) {
        throw new ProfileStorageError("Stored profile JSON is malformed");
      }

      throw new ProfileStorageError();
    }
  }

  async write(profile) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    } catch {
      await unlink(temporaryPath).catch(() => {});
      throw new ProfileStorageError();
    }
  }
}

