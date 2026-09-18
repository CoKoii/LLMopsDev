import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from "@nestjs/common";
import { Permissions } from "../../../common/auth/permissions.decorator";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // -------------------------
  // 获取用户列表
  @Permissions("user:list")
  @Get()
  list(@Query() query: QueryUsersDto) {
    return this.usersService.list(query);
  }
  // -------------------------

  // -------------------------
  // 更新用户
  @Permissions("user:update")
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }
  // -------------------------
}
