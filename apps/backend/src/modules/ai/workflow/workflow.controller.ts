import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { QueryWorkflowsDto } from "./dto/query-workflows.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { WorkflowService } from "./workflow.service";

@Controller("ai/workflows")
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // -------------------------
  // 创建工作流
  @Post()
  create(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowService.create(createWorkflowDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取工作流列表
  @Get()
  list(@Query() query: QueryWorkflowsDto) {
    return this.workflowService.list(query);
  }
  // -------------------------

  // -------------------------
  // 获取工作流详情
  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.workflowService.findOne(id);
  }
  // -------------------------

  // -------------------------
  // 更新工作流
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflowService.update(id, updateWorkflowDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 删除工作流
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.workflowService.remove(id);
  }
  // -------------------------
}
