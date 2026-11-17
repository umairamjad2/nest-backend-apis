import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  @ApiProperty({ example: 'Password123' })
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @ApiProperty({ example: 'NewPassword123', minLength: 8, maxLength: 72 })
  newPassword: string;
}
