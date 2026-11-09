import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SelfOrAdminGuard } from '../auth/guards/self-or-admin.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
@ApiForbiddenResponse({ description: 'Not allowed for this user' })
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'List all users (admin only)' })
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @ApiOperation({ summary: 'Get a user by ID (own account or admin)' })
  @UseGuards(SelfOrAdminGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  //because create user from auth -> user creation endpoint so nobody can bypass email verification.
  //using registration in the Auth module.  
  // @Post()
  //   create(@Body() body: CreateUserDto) {
  //   return this.usersService.create(body);
  // }

  @ApiOperation({ summary: 'Update a user (own account or admin)' })
  @UseGuards(SelfOrAdminGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
  ) {
  return this.usersService.update(id, body);
  }

  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }



}