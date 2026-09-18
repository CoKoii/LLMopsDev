import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { Permissions } from "../../common/auth/permissions.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { AdminService } from "./admin.service";
import { QueryAdminResourcesDto } from "./dto/query-admin-resources.dto";
import { UpdateAdminResourceDto } from "./dto/update-admin-resource.dto";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Permissions("admin:read")
  @Get("overview")
  overview(@Query("days") days?: string) {
    return this.adminService.getOverview(Number(days));
  }

  @Permissions("admin:read")
  @Get("apps")
  apps(@Query() query: QueryAdminResourcesDto) {
    return this.adminService.listApps(query);
  }

  @Permissions("admin:update")
  @Put("apps/:id")
  updateApp(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateAdminResourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.updateApp(id, dto, user.userId);
  }

  @Permissions("admin:read")
  @Get("plugins")
  plugins(@Query() query: QueryAdminResourcesDto) {
    return this.adminService.listPlugins(query);
  }

  @Permissions("admin:update")
  @Put("plugins/:id")
  updatePlugin(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateAdminResourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.updatePlugin(id, dto, user.userId);
  }

  @Permissions("admin:read")
  @Get("knowledge")
  knowledge(@Query() query: QueryAdminResourcesDto) {
    return this.adminService.listKnowledges(query);
  }

  @Permissions("admin:update")
  @Put("knowledge/:id")
  updateKnowledge(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateAdminResourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.updateKnowledge(id, dto, user.userId);
  }
}
