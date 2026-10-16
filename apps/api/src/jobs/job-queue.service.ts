import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { type JobWithMetadata, PgBoss, type Queue } from "pg-boss";
import type { EntityManager } from "typeorm";
import { ENV, type Env } from "../config/env.js";
import { sslOptions } from "../database/ssl.js";

type Handler = (job: JobWithMetadata<object>) => Promise<void>;

/**
 * Background jobs in Postgres (pg-boss, schema `pgboss`). They exist for AI drafting, so they run
 * only when the AI service is set; otherwise pg-boss isn't started and nothing is queued.
 */
@Injectable()
export class JobQueue implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueue.name);
  private readonly queues = new Map<string, { options: Omit<Queue, "name">; handler: Handler }>();
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return Boolean(this.env.AI_SERVICE_URL && this.env.AI_SERVICE_TOKEN);
  }

  /** A queue and its worker: started with the app, or at once when the app is already running. */
  async register<T extends object>(
    name: string,
    options: Omit<Queue, "name">,
    handler: (job: JobWithMetadata<T>) => Promise<void>,
  ): Promise<void> {
    this.queues.set(name, { options, handler: handler as Handler });
    if (this.boss) await this.startQueue(this.boss, name);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    const boss = new PgBoss({
      connectionString: this.env.DATABASE_URL,
      ssl: sslOptions(this.env),
      schema: "pgboss",
      max: 4,
    });
    boss.on("error", (error: Error) => this.logger.error(`Background jobs: ${error.message}`));
    await boss.start();
    this.boss = boss;
    for (const name of this.queues.keys()) await this.startQueue(boss, name);
  }

  private async startQueue(boss: PgBoss, name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (!queue) return;
    await boss.createQueue(name, queue.options);
    await boss.work(
      name,
      { includeMetadata: true, pollingIntervalSeconds: this.env.JOBS_POLL_SECONDS },
      async ([job]: JobWithMetadata<object>[]) => {
        if (job) await queue.handler(job);
      },
    );
  }

  /** Queues a job in the caller's transaction, so it exists exactly when the rows it works on do. */
  async send(manager: EntityManager, name: string, data: object): Promise<void> {
    const runner = manager.queryRunner;
    if (!this.boss || !runner)
      throw new Error("Jobs are queued inside a transaction, once jobs run");
    await this.boss.send(name, data, {
      db: {
        executeSql: async (text: string, values?: unknown[]) => ({
          rows: (await runner.query(text, values ?? [], true)).records,
        }),
      },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5_000 });
    this.boss = null;
  }
}
