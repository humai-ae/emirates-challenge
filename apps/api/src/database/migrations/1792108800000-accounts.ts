import type { MigrationInterface, QueryRunner } from "typeorm";

/** Email and password accounts. */
export class Accounts1792108800000 implements MigrationInterface {
  name = "Accounts1792108800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users ADD COLUMN email text");
    // Every existing row is a seeded demo user; give it an address on the reserved demo domain.
    await queryRunner.query("UPDATE users SET email = lower(username) || '@emirates.test'");
    await queryRunner.query("ALTER TABLE users ALTER COLUMN email SET NOT NULL");
    await queryRunner.query("ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)");
    await queryRunner.query(
      "ALTER TABLE users ADD CONSTRAINT users_email_lower_case CHECK (email = lower(email))",
    );
    await queryRunner.query("ALTER TABLE users DROP COLUMN username");
    await queryRunner.query("ALTER TABLE users ADD COLUMN password_hash text");
    await queryRunner.query(
      "ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false",
    );
    await queryRunner.query("ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true");
    await queryRunner.query("ALTER TABLE users ALTER COLUMN is_demo SET DEFAULT false");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users ALTER COLUMN is_demo SET DEFAULT true");
    await queryRunner.query("ALTER TABLE users DROP COLUMN is_active");
    await queryRunner.query("ALTER TABLE users DROP COLUMN must_change_password");
    await queryRunner.query("ALTER TABLE users DROP COLUMN password_hash");
    await queryRunner.query("ALTER TABLE users ADD COLUMN username text");
    await queryRunner.query("UPDATE users SET username = split_part(email, '@', 1)");
    await queryRunner.query("ALTER TABLE users ALTER COLUMN username SET NOT NULL");
    await queryRunner.query(
      "ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username)",
    );
    await queryRunner.query("ALTER TABLE users DROP COLUMN email");
  }
}
