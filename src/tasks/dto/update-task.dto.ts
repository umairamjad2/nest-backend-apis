import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums.js';
import { trim } from './create-task.dto.js';

// Written out instead of PartialType(CreateTaskDto): @IsOptional also lets null
// through, and title, status and priority can't be null in the database.
// ValidateIf skips only a missing field, so null is rejected for those three.
// description and dueDate use @IsOptional because null means "clear it".
export class UpdateTaskDto {
  @ValidateIf((o: UpdateTaskDto) => o.title !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiPropertyOptional({ maxLength: 200 })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  description?: string | null;

  @ValidateIf((o: UpdateTaskDto) => o.status !== undefined)
  @IsEnum(TaskStatus)
  @ApiPropertyOptional({ enum: TaskStatus })
  status?: TaskStatus;

  @ValidateIf((o: UpdateTaskDto) => o.priority !== undefined)
  @IsEnum(TaskPriority)
  @ApiPropertyOptional({ enum: TaskPriority })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ example: '2026-12-01', nullable: true })
  dueDate?: string | null;
}
