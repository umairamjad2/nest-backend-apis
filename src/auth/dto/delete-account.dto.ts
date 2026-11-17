import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  @ApiProperty({ description: 'Your current password, to confirm', example: 'Password123' })
  password: string;
}
