import { Public } from 'src/common/decorators/public.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

@Controller('users')
export class UsersController {
  private usersService: UsersService;
  constructor(usersService: UsersService) {
    this.usersService = usersService;
  }

  @Get()
  @Public()
  getUsers() {
    return this.usersService.getUsers();
  }

  @Post()
  createUser(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}

// TODO: Мы остановились на том, что создали jwt auth и добавили создание аккаунтов
// Дальше добавим транзакции и тд.
