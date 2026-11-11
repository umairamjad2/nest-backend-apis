import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums.js';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTaskDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ example: 'Write the README', maxLength: 200 })
  title: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ example: 'Cover setup and deployment', maxLength: 2000, nullable: true })
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskStatus)
  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ example: '2026-12-01', description: 'ISO date', nullable: true })
  dueDate?: string | null;
}
