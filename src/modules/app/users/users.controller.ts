import { Public } from '../../../common/decorators/public.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';

@Controller('users')
export class UsersController {
  private usersService: UsersService;
  constructor(usersService: UsersService) {
    this.usersService = usersService;
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.id);
  }

  @Post()
  createUser(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch('me')
  updateUser(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }

  @Get()
  @Public()
  getUsers() {
    return this.usersService.getUsers();
  }
}

// TODO: Мы остановились на том, что создали jwt auth и добавили создание аккаунтов
// Дальше добавим транзакции и тд.
