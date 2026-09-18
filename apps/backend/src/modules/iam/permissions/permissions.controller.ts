import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { Permissions } from "../../../common/auth/permissions.decorator";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { QueryPermissionsDto } from "./dto/query-permissions.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { PermissionsService } from "./permissions.service";

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // -------------------------
  // 获取当前用户权限
  @Get("me")
  listMine(@CurrentUser() user: AuthUser) {
    return this.permissionsService.listMine(user.permissions);
  }
  // -------------------------

  // -------------------------
  // 创建权限
  @Permissions("permission:create")
  @Post()
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }
  // -------------------------

  // -------------------------
  // 获取权限列表
  @Permissions("permission:list")
  @Get()
  list(@Query() query: QueryPermissionsDto) {
    return this.permissionsService.list(query);
  }
  // -------------------------

  // -------------------------
  // 更新权限
  @Permissions("permission:update")
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto);
  }
  // -------------------------
}
