import {
  type ConfirmRolesRequest,
  ConfirmRolesRequestSchema,
  type DatasetResponse,
  type DatasetsListResponse,
  MAX_UPLOAD_BYTES,
  type UploadDatasetFields,
  UploadDatasetFieldsSchema,
  type User,
} from "@hrcc/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DatasetsService, type UploadedCsv } from "./datasets.service.js";

interface UploadedParts {
  transactions?: UploadedCsv[];
  employees?: UploadedCsv[];
}

// The canonical lower-case form, as Postgres returns it.
const DatasetIdPipe = new ZodValidationPipe(z.uuid().transform((value) => value.toLowerCase()));

@Controller("datasets")
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  /** Guards run before the interceptor, so only an admin's upload is ever read. */
  @Post()
  @Roles("admin")
  @HttpCode(201)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "transactions", maxCount: 1 },
        { name: "employees", maxCount: 1 },
      ],
      {
        // Browsers send file names as UTF-8; multer reads them as Latin-1 unless told.
        defParamCharset: "utf8",
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 2, fields: 4, fieldSize: 1024 },
      },
    ),
  )
  upload(
    @CurrentUser() admin: User,
    @UploadedFiles() parts: UploadedParts | undefined,
    @Body(new ZodValidationPipe(UploadDatasetFieldsSchema)) fields: UploadDatasetFields,
  ): Promise<DatasetResponse> {
    return this.datasets.upload(admin, fields, {
      transactions: parts?.transactions?.[0],
      employees: parts?.employees?.[0],
    });
  }

  @Get()
  @Roles("admin", "analyst")
  list(): Promise<DatasetsListResponse> {
    return this.datasets.list();
  }

  @Get(":id")
  @Roles("admin", "analyst")
  async get(@Param("id", DatasetIdPipe) id: string): Promise<DatasetResponse> {
    return { dataset: await this.datasets.detail(id) };
  }

  @Patch(":id/columns")
  @Roles("admin")
  confirmRoles(
    @CurrentUser() admin: User,
    @Param("id", DatasetIdPipe) id: string,
    @Body(new ZodValidationPipe(ConfirmRolesRequestSchema)) mapping: ConfirmRolesRequest,
  ): Promise<DatasetResponse> {
    return this.datasets.confirmRoles(admin, id, mapping);
  }

  @Delete(":id")
  @Roles("admin")
  remove(
    @CurrentUser() admin: User,
    @Param("id", DatasetIdPipe) id: string,
  ): Promise<DatasetResponse> {
    return this.datasets.remove(admin, id);
  }
}
