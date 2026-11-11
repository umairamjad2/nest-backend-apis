import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums.js';
import { trim } from './create-task.dto.js';

export const TASK_SORT_FIELDS = ['createdAt', 'dueDate', 'priority'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export class QueryTasksDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  @ApiPropertyOptional({ enum: TaskStatus })
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  @ApiPropertyOptional({ enum: TaskPriority })
  priority?: TaskPriority;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Matches title or description, ignoring case' })
  search?: string;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS)
  @ApiPropertyOptional({ enum: TASK_SORT_FIELDS, default: 'createdAt' })
  sortBy?: TaskSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  order?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  limit?: number;
}
