import { PartialType, PickType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto.js';

// Only profile fields. Password changes go through the reset flow; role is never client-editable.
export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, ['name'] as const),
) {}
