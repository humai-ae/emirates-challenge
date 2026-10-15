import { MemoryFileStore } from "./memory-file-store.js";
import { describeFileStore } from "./storage/file-store-contract.js";

describeFileStore("in-memory", () => new MemoryFileStore());
