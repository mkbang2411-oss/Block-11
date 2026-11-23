import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { assertValidKey } from "./keys.js";

export class LocalStorage {
  constructor(root) {
    this.root = path.resolve(root);
    this.name = `local:${this.root}`;
  }
  async init() {
    await fsp.mkdir(this.root, { recursive: true });
  }
  async ping() {
    await fsp.access(this.root);
  }
  #path(key) {
    assertValidKey(key);
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep))
      throw new Error("key escapes root");
    return p;
  }
  async put(key, buf) {
    const p = this.#path(key);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, p); // ghi nguyên tử
  }
  async get(key) {
    try {
      return await fsp.readFile(this.#path(key));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async stream(key) {
    const p = this.#path(key);
    try {
      const st = await fsp.stat(p);
      return { body: fs.createReadStream(p), size: st.size };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async delete(key) {
    // idempotent: file không còn cũng coi là thành công
    try {
      await fsp.unlink(this.#path(key));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  async list(prefix = "") {
    const out = [];
    const walk = async (dir) => {
      let ents;
      try {
        ents = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (!e.name.endsWith(".tmp"))
          out.push(path.relative(this.root, full).split(path.sep).join("/"));
      }
    };
    await walk(this.root);
    return out.filter((k) => k.startsWith(prefix)).sort();
  }
}
