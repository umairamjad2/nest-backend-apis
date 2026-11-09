import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The newest refresh_token returned by login or refresh' })
  refreshToken: string;
}