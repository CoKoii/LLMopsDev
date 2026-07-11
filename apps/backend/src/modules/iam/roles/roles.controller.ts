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
import { Permissions } from "../../../common/auth/permissions.decorator";
import { CreateRoleDto } from "./dto/create-role.dto";
import { QueryRolesDto } from "./dto/query-roles.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // -------------------------
  // 创建角色
  @Permissions("role:create")
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }
  // -------------------------

  // -------------------------
  // 获取角色列表
  @Permissions("role:list")
  @Get()
  list(@Query() query: QueryRolesDto) {
    return this.rolesService.list(query);
  }
  // -------------------------

  // -------------------------
  // 更新角色
  @Permissions("role:update")
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto);
  }
  // -------------------------
}
