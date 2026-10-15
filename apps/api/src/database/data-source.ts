import "reflect-metadata";
import { DataSource } from "typeorm";
import { loadEnv } from "../config/env.js";
import { dataSourceOptions } from "./options.js";

export default new DataSource(dataSourceOptions(loadEnv()));
