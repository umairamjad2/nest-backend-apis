import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { QueryTasksDto } from './dto/query-tasks.dto.js';

@ApiTags('tasks')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
@UseGuards(JwtAuthGuard)
// The global limit (10/min) is meant for auth routes; a task list page makes many small requests
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'List your tasks with filters, search, sorting and pagination' })
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTasksDto) {
    return this.tasksService.findAll(user.userId, query);
  }

  // Declared before ':id' so "stats" isn't parsed as an ID
  @ApiOperation({ summary: 'Count your tasks by status, plus overdue ones' })
  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.stats(user.userId);
  }

  @ApiOperation({ summary: 'Get one of your tasks' })
  @ApiNotFoundResponse({ description: "No such task, or it isn't yours" })
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(user.userId, id);
  }

  @ApiOperation({ summary: 'Create a task' })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.userId, dto);
  }

  @ApiOperation({ summary: 'Update one of your tasks' })
  @ApiNotFoundResponse({ description: "No such task, or it isn't yours" })
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.userId, id, dto);
  }

  @ApiOperation({ summary: 'Delete one of your tasks' })
  @ApiNotFoundResponse({ description: "No such task, or it isn't yours" })
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(user.userId, id);
  }
}
